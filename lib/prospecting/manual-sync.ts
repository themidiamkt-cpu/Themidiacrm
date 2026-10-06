/**
 * O funil acompanha a abordagem — sem depender de quem enviou.
 *
 * Na abordagem manual o negócio nasce na etapa inicial e quem envia é uma pessoa,
 * pelo Inbox. Nada movia o cartão depois: nem o envio, nem a resposta da empresa
 * (quem move por conversa é o agente, e nessas conversas ele está calado). Medido
 * numa instalação: 21 cartões em "Mensagem pronta" com 18 mensagens já enviadas.
 *
 * Esta sincronia roda no mesmo relógio da prospecção e olha o que a CONVERSA
 * mostra:
 *
 *  - houve envio → o candidato vira `sent` e o negócio vai para a etapa de
 *    "abordado";
 *  - a empresa respondeu DEPOIS de um minuto do primeiro envio → vai para a etapa
 *    de "respondeu". O minuto existe porque saudação e ausência do WhatsApp
 *    Business chegam em segundos e não são resposta de ninguém.
 *
 * Só anda para FRENTE e só a partir das etapas que a própria sincronia conhece
 * (inicial e abordado): cartão que alguém moveu à mão não é tocado.
 */
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { logger } from "@/lib/logger";
import { isManualMessageConfig } from "./schema";

/** Quanto depois do primeiro envio uma mensagem recebida conta como resposta. */
export const SEGUNDOS_PARA_CONTAR_COMO_RESPOSTA = 60;

export interface EtapaDoFunil {
  id: string;
  is_won: boolean;
  is_lost: boolean;
  agent_stage_hint: string | null;
}

export interface EtapasDaAbordagem {
  inicial: string;
  abordado: string | null;
  respondeu: string | null;
}

/**
 * Quais etapas representam "abordado" e "respondeu" neste funil.
 *
 * A configuração manda quando diz. Sem ela: "respondeu" é a etapa que o funil
 * já ligou ao passo `contacted` do agente, e "abordado" é a etapa aberta logo
 * depois da inicial — desde que não seja a de "respondeu" nem a de qualificados.
 * Funil em que a etapa seguinte já É a de resposta fica sem "abordado": melhor
 * não mover do que mover para o lugar errado.
 *
 * `etapas` chega na ordem do funil.
 */
export function resolverEtapasDaAbordagem(
  etapas: readonly EtapaDoFunil[],
  config: {
    stage_id: string;
    sent_stage_id?: string | null;
    replied_stage_id?: string | null;
    qualified_stage_id?: string | null;
  },
): EtapasDaAbordagem {
  const existe = (id: string | null | undefined) =>
    !!id && etapas.some((e) => e.id === id && !e.is_won && !e.is_lost);
  const respondeu = existe(config.replied_stage_id)
    ? config.replied_stage_id!
    : (etapas.find((e) => e.agent_stage_hint === "contacted" && !e.is_won && !e.is_lost)?.id ??
      null);
  let abordado: string | null = existe(config.sent_stage_id) ? config.sent_stage_id! : null;
  if (!abordado) {
    const seguinte = etapas[etapas.findIndex((e) => e.id === config.stage_id) + 1];
    const temInicial = etapas.some((e) => e.id === config.stage_id);
    if (
      temInicial &&
      seguinte &&
      !seguinte.is_won &&
      !seguinte.is_lost &&
      seguinte.id !== respondeu &&
      seguinte.id !== config.qualified_stage_id
    )
      abordado = seguinte.id;
  }
  return {
    inicial: config.stage_id,
    abordado: abordado === config.stage_id ? null : abordado,
    respondeu: respondeu === config.stage_id ? null : respondeu,
  };
}

/** Para onde o negócio deve ir agora — ou `null`, que é "fica onde está". */
export function decidirEtapa(input: {
  etapaAtual: string;
  etapas: EtapasDaAbordagem;
  enviou: boolean;
  respondeu: boolean;
}): string | null {
  const { etapaAtual, etapas } = input;
  const noCaminho = etapaAtual === etapas.inicial || etapaAtual === etapas.abordado;
  if (input.respondeu && etapas.respondeu && noCaminho && etapaAtual !== etapas.respondeu)
    return etapas.respondeu;
  if (input.enviou && etapas.abordado && etapaAtual === etapas.inicial) return etapas.abordado;
  return null;
}

interface Linha {
  id: string;
  organization_id: string;
  campaign_id: string;
  status: string;
  lead_id: string;
  stage_id: string;
  pipeline_id: string;
  config: unknown;
  primeiro_envio: Date;
  respondeu: boolean;
}

const TETO_POR_RODADA = 300;

/**
 * Uma rodada da sincronia, para todas as organizações. Devolve o que mudou;
 * zero em tudo é o caso comum e não gera registro.
 */
export async function sincronizarFunilDaAbordagem(pool: pg.Pool, admin: SupabaseClient) {
  const { rows } = await pool.query<Linha>(
    `select p.id,p.organization_id,p.campaign_id,p.status,p.lead_id,l.stage_id,l.pipeline_id,c.config,o.primeiro_envio,
            exists(select 1 from messages i where i.organization_id=p.organization_id and i.conversation_id=p.conversation_id
                   and i.direction='inbound' and i.created_at > o.primeiro_envio + make_interval(secs => $1)) as respondeu
       from prospecting_candidates p
       join prospecting_campaigns c on c.organization_id=p.organization_id and c.id=p.campaign_id
       join crm_leads l on l.organization_id=p.organization_id and l.id=p.lead_id
       cross join lateral (select min(m.created_at) as primeiro_envio from messages m
                            where m.organization_id=p.organization_id and m.conversation_id=p.conversation_id and m.direction='outbound') o
      where p.conversation_id is not null and o.primeiro_envio is not null and l.status='open'
        and p.created_at > now() - interval '60 days'
        and ((c.config->>'mode'='manual_message' and p.status in ('queued','sent'))
          or (c.config->>'mode' is null and p.status='sent'))
        and (p.status='queued' or l.stage_id::text = c.config->>'stage_id' or l.updated_at > now() - interval '14 days')
      order by p.updated_at limit $2`,
    [SEGUNDOS_PARA_CONTAR_COMO_RESPOSTA, TETO_POR_RODADA],
  );
  const etapasPorCampanha = new Map<string, EtapasDaAbordagem | null>();
  let abordados = 0;
  let responderam = 0;
  let marcados = 0;
  for (const r of rows) {
    const manual = isManualMessageConfig(r.config);
    try {
      if (manual && r.status === "queued") {
        const mudou = await pool.query(
          "update prospecting_candidates set status='sent',attempted_at=coalesce(attempted_at,$3),updated_at=now() where organization_id=$1 and id=$2 and status='queued'",
          [r.organization_id, r.id, r.primeiro_envio],
        );
        marcados += mudou.rowCount ?? 0;
      }
      let etapas = etapasPorCampanha.get(r.campaign_id);
      if (etapas === undefined) {
        const config = r.config as {
          stage_id?: string;
          sent_stage_id?: string | null;
          replied_stage_id?: string | null;
          qualified_stage_id?: string | null;
        } | null;
        if (!config?.stage_id) etapas = null;
        else {
          const lidas = await pool.query<EtapaDoFunil>(
            "select id,is_won,is_lost,agent_stage_hint from crm_stages where organization_id=$1 and pipeline_id=$2 and not is_archived order by position",
            [r.organization_id, r.pipeline_id],
          );
          etapas = resolverEtapasDaAbordagem(lidas.rows, { ...config, stage_id: config.stage_id });
        }
        etapasPorCampanha.set(r.campaign_id, etapas);
      }
      if (!etapas) continue;
      const destino = decidirEtapa({
        etapaAtual: r.stage_id,
        etapas,
        enviou: true,
        // Na campanha automática quem lê a resposta e move é o agente.
        respondeu: manual && r.respondeu,
      });
      if (!destino) continue;
      await moveLeadHandler(
        admin,
        {
          organization_id: r.organization_id,
          actor: { type: "webhook_source", id: r.campaign_id },
          requestId: `prospecting-sync:${r.id}`,
        },
        r.lead_id,
        {
          to_stage_id: destino,
          reason:
            destino === etapas.respondeu
              ? "Prospecção: a empresa respondeu à abordagem."
              : "Prospecção: a abordagem foi enviada.",
        },
      );
      if (destino === etapas.respondeu) responderam += 1;
      else abordados += 1;
    } catch (error) {
      // Um negócio que não move (etapa apagada, regra do funil) não para os outros.
      logger.warn("[prospecting] sincronia do funil pulou um negócio", {
        candidateId: r.id,
        organizationId: r.organization_id,
        erro: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { abordados, responderam, marcados };
}
