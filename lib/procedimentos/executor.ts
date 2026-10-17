/**
 * Retorno automático de procedimentos — a rodada que manda a mensagem.
 *
 * Molde: `app/api/v1/cron/agenda-reminder/route.ts` (outro cron que manda texto
 * fixo a pacientes). Mesmas portas, mesmas guardas: contato bloqueado ou sem
 * telefone, canal WhatsApp no ar, JANELA DE ENVIO do canal (7h–22h por padrão) e
 * o espaçamento entre envios. O envio sai por `sendMessageHandler`, o caminho de
 * saída do sistema inteiro.
 *
 * ─── O que torna isto seguro de rodar sozinho ───────────────────────────────
 *
 *  1. RESERVA ANTES DE ENVIAR. `lembrete_enviado_em` é gravado por um UPDATE
 *     condicional (`... where lembrete_enviado_em is null`) ANTES da mensagem
 *     sair. Duas rodadas simultâneas (ou um reinício no meio) nunca mandam duas
 *     vezes: só quem ganhou a reserva envia. Se o ENVIO falha, a reserva é
 *     devolvida e a rodada seguinte tenta de novo, até `MAX_TENTATIVAS`.
 *  2. NÃO MANDA MENSAGEM VELHA. Procedimento que venceu há mais de
 *     `DIAS_DE_TOLERANCIA` dias vira `expirado` e não sai nada: cadastrar hoje um
 *     botox feito há dois anos não pode mandar "faz 6 meses" para o paciente.
 *  3. TETO POR RODADA (`LIMITE_POR_RODADA`) + pacing do canal.
 *  4. SEM PROCEDIMENTO NO CATÁLOGO, SEM MENSAGEM. Se o cadastro foi apagado, o
 *     registro vira `sem_procedimento`; se está `ativo = false`, a rodada espera
 *     (reativar dentro do prazo volta a enviar).
 *  5. TABELA AUSENTE NÃO DERRUBA O CRON: antes da migration, a rodada só responde
 *     `ausente: true`.
 *
 * A etapa de destino é aplicada DEPOIS do envio e só no MESMO funil do cartão;
 * falhar em mover nunca desfaz nem repete a mensagem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { decidirPreGoLiveDoCanalViaSupabase } from "@/lib/ai/elegibilidade/consulta-pre-go-live";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { ensureConversation } from "@/lib/automation/start-conversation";
import { espacarEnvio } from "@/lib/automation/throttle";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";

import {
  LIMITE_POR_RODADA,
  MAX_TENTATIVAS,
  estadoDoVencimento,
  hojeNoFuso,
  montarMensagem,
} from "./regras";

interface Catalogo {
  id: string;
  nome: string;
  mensagem: string;
  etapa_destino_id: string | null;
  ativo: boolean;
}

interface LinhaAVencer {
  id: string;
  organization_id: string;
  lead_id: string;
  contact_id: string;
  procedimento_id: string | null;
  nome: string;
  vence_em: string;
  lembrete_tentativas: number;
  procedimento: Catalogo | Catalogo[] | null;
}

export interface ResultadoDosProcedimentos {
  ausente?: boolean;
  examinados: number;
  enviados: number;
  expirados: number;
  pulados: Record<string, number>;
  erros: number;
}

function catalogoDe(linha: LinhaAVencer): Catalogo | null {
  const p = linha.procedimento;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

/** O erro de "tabela não existe" do PostgREST/Postgres (migration ainda não aplicada). */
function tabelaAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|Could not find the table/i.test(error.message ?? "")
  );
}

export async function tickProcedimentos(
  admin: SupabaseClient,
  opcoes: { agora?: Date; limite?: number } = {},
): Promise<ResultadoDosProcedimentos> {
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LIMITE_POR_RODADA;
  const r: ResultadoDosProcedimentos = {
    examinados: 0,
    enviados: 0,
    expirados: 0,
    pulados: {},
    erros: 0,
  };
  const pular = (motivo: string) => {
    r.pulados[motivo] = (r.pulados[motivo] ?? 0) + 1;
  };

  // Superconjunto folgado (amanhã em UTC cobre qualquer fuso); o dia certo é
  // conferido por organização logo abaixo.
  const amanhaUtc = new Date(agora.getTime() + 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("themidia_lead_procedimentos")
    .select(
      "id, organization_id, lead_id, contact_id, procedimento_id, nome, vence_em, lembrete_tentativas, procedimento:themidia_procedimentos(id, nome, mensagem, etapa_destino_id, ativo)",
    )
    .eq("status", "realizado")
    .is("lembrete_enviado_em", null)
    .is("lembrete_resultado", null)
    .lte("vence_em", amanhaUtc)
    .order("vence_em", { ascending: true })
    .limit(200);
  if (error) {
    if (tabelaAusente(error)) return { ...r, ausente: true };
    throw new Error(error.message);
  }
  const linhas = (data ?? []) as unknown as LinhaAVencer[];
  r.examinados = linhas.length;
  if (linhas.length === 0) return r;

  const orgIds = [...new Set(linhas.map((l) => l.organization_id))];
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, timezone")
    .in("id", orgIds);
  const fusoDaOrg = new Map(
    ((orgs ?? []) as Array<{ id: string; timezone: string | null }>).map((o) => [o.id, o.timezone]),
  );

  const encerrar = async (linha: LinhaAVencer, resultado: string) => {
    await admin
      .from("themidia_lead_procedimentos")
      .update({ lembrete_resultado: resultado })
      .eq("id", linha.id)
      .eq("organization_id", linha.organization_id)
      .is("lembrete_enviado_em", null)
      .is("lembrete_resultado", null);
  };

  for (const linha of linhas) {
    if (r.enviados >= limite) {
      pular("teto_da_rodada");
      continue;
    }
    const org = linha.organization_id;
    const hoje = hojeNoFuso(fusoDaOrg.get(org), agora);
    const estado = estadoDoVencimento(linha.vence_em, hoje);
    if (estado === "ainda_nao") {
      pular("ainda_nao");
      continue;
    }
    if (estado === "expirado") {
      await encerrar(linha, "expirado");
      r.expirados += 1;
      continue;
    }

    const catalogo = catalogoDe(linha);
    if (!catalogo) {
      await encerrar(linha, "sem_procedimento");
      pular("sem_procedimento");
      continue;
    }
    if (!catalogo.ativo) {
      pular("procedimento_pausado");
      continue;
    }

    const { data: contato } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number, is_blocked, is_anonymized")
      .eq("id", linha.contact_id)
      .eq("organization_id", org)
      .maybeSingle();
    if (!contato || contato.is_blocked || contato.is_anonymized) {
      await encerrar(linha, "contato_bloqueado");
      pular("contato_bloqueado");
      continue;
    }
    if (!contato.phone_number) {
      await encerrar(linha, "sem_numero");
      pular("sem_numero");
      continue;
    }

    const { data: canal } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", org)
      .eq("status", "WORKING")
      .limit(1)
      .maybeSingle();
    if (!canal) {
      pular("sem_canal");
      continue;
    }
    if (await adiarAteAJanelaAbrir(admin, org, canal.id, agora)) {
      pular("fora_da_janela");
      continue;
    }

    // MODO DE TESTE DO CANAL (`pre_go_live`): o envio automático só vale para os
    // números da lista de teste. Conferido ANTES de reservar: sem isto, cada rodada
    // criaria uma mensagem `failed` ("bloqueado pelo modo de teste") na conversa do
    // paciente e o retorno seria dado como enviado. O registro fica pendente e
    // sai sozinho quando o canal é liberado (ou o número entra na lista).
    // Quem libera é o Roberto, em Conexões › Configurar acesso da IA — nunca este código.
    const gate = await decidirPreGoLiveDoCanalViaSupabase(admin, {
      organizationId: org,
      channelSessionId: canal.id,
      contactPhoneNumber: contato.phone_number,
    });
    if (!gate.permite) {
      pular("canal_em_teste");
      continue;
    }

    // RESERVA: só quem muda `lembrete_enviado_em` de null manda a mensagem.
    const tentativa = linha.lembrete_tentativas + 1;
    const { data: reservada } = await admin
      .from("themidia_lead_procedimentos")
      .update({ lembrete_enviado_em: agora.toISOString(), lembrete_tentativas: tentativa })
      .eq("id", linha.id)
      .eq("organization_id", org)
      .is("lembrete_enviado_em", null)
      .is("lembrete_resultado", null)
      .select("id")
      .maybeSingle();
    if (!reservada) {
      pular("outra_rodada_pegou");
      continue;
    }

    const corpo = montarMensagem(catalogo.mensagem, {
      nome: nomeDoContato(contato),
      procedimento: catalogo.nome,
    });

    try {
      await espacarEnvio(canal.id);
      const conversaId = await ensureConversation(admin, org, contato.id, canal.id);
      const mensagem = await sendMessageHandler(
        admin,
        {
          organization_id: org,
          actor: { type: "webhook_source", id: linha.id },
          requestId: `procedimento-retorno:${linha.id}`,
        },
        { conversation_id: conversaId, type: "text", body: corpo } as Parameters<
          typeof sendMessageHandler
        >[2],
      );
      // O handler DEVOLVE a mensagem mesmo quando o envio é recusado (ela nasce
      // `failed` com `error_code`): isso não é "enviado". Tratar como falha devolve
      // a reserva e conta a tentativa, em vez de dar o retorno por feito.
      if (mensagem?.status === "failed") {
        throw new Error(`mensagem_recusada:${mensagem.error_code ?? "sem_codigo"}`);
      }
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      logger.error("[procedimentos] envio falhou", { linhaId: linha.id, tentativa, error: mensagem });
      r.erros += 1;
      // O envio NÃO saiu: devolve a reserva (ou desiste na última tentativa).
      await admin
        .from("themidia_lead_procedimentos")
        .update(
          tentativa >= MAX_TENTATIVAS
            ? { lembrete_enviado_em: null, lembrete_resultado: "falhou" }
            : { lembrete_enviado_em: null },
        )
        .eq("id", linha.id)
        .eq("organization_id", org);
      continue;
    }

    await admin
      .from("themidia_lead_procedimentos")
      .update({ lembrete_resultado: "enviado" })
      .eq("id", linha.id)
      .eq("organization_id", org);
    r.enviados += 1;

    if (catalogo.etapa_destino_id) {
      await moverParaEtapaDeDestino(admin, linha, catalogo.etapa_destino_id);
    }
  }

  return r;
}

/** Depois do envio, leva o cartão para a etapa escolhida — só se ele está aberto e no mesmo funil. */
async function moverParaEtapaDeDestino(
  admin: SupabaseClient,
  linha: LinhaAVencer,
  etapaId: string,
): Promise<void> {
  try {
    const [{ data: lead }, { data: etapa }] = await Promise.all([
      admin
        .from("crm_leads")
        .select("id, status, stage_id, pipeline_id")
        .eq("id", linha.lead_id)
        .eq("organization_id", linha.organization_id)
        .maybeSingle(),
      admin
        .from("crm_stages")
        .select("id, pipeline_id, is_archived")
        .eq("id", etapaId)
        .eq("organization_id", linha.organization_id)
        .maybeSingle(),
    ]);
    if (!lead || !etapa || etapa.is_archived) return;
    if (lead.status !== "open" || lead.stage_id === etapa.id) return;
    if (lead.pipeline_id !== etapa.pipeline_id) {
      logger.warn("[procedimentos] etapa de destino é de outro funil; cartão não movido", {
        linhaId: linha.id,
      });
      return;
    }
    await moveLeadHandler(
      admin,
      {
        organization_id: linha.organization_id,
        actor: { type: "webhook_source", id: linha.id },
        requestId: `procedimento-retorno:${linha.id}:mover`,
      },
      linha.lead_id,
      { to_stage_id: etapa.id, reason: `Retorno de ${linha.nome}` },
    );
  } catch (err) {
    logger.warn("[procedimentos] mensagem enviada, mas o cartão não foi movido", {
      linhaId: linha.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
