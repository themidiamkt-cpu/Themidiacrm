/**
 * GET /api/v1/procedimentos/retornos — o retorno automático de procedimentos
 * visto como follow-up: por procedimento (quantas pessoas aguardam, o próximo
 * vencimento, quantos já foram enviados) e a FILA de quem vai receber (e o que
 * aconteceu nos últimos envios). Alimenta a tela Follow-ups (abas Fluxos e Fila).
 *
 * Não é um fluxo do motor de follow-up (ver `lib/procedimentos/executor.ts`),
 * mas é mostrado ao lado deles porque, para quem opera, é a mesma pergunta:
 * "quem vai receber mensagem automática e quando?".
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_CATALOGO, semTipos, tabelaAusente } from "@/lib/procedimentos/db";
import { resumirRetornos, type LinhaDoRetorno } from "@/lib/procedimentos/retornos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS_DA_FILA =
  "id, lead_id, procedimento_id, nome, status, realizado_em, vence_em, lembrete_enviado_em, lembrete_resultado, contacts(name, display_name, phone_number), crm_leads(title)";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "procedimentos" });
  if (!authz.ok) return authz.response;
  const { org } = authz;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const supabase = semTipos(await createClient());
  const trintaDias = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [catalogo, pendentes, recentes] = await Promise.all([
    supabase
      .from("themidia_procedimentos")
      .select(COLUNAS_DO_CATALOGO)
      .eq("organization_id", org.orgId)
      .order("nome", { ascending: true }),
    // Quem ainda vai receber: realizado, sem desfecho.
    supabase
      .from("themidia_lead_procedimentos")
      .select(COLUNAS_DA_FILA)
      .eq("organization_id", org.orgId)
      .eq("status", "realizado")
      .is("lembrete_enviado_em", null)
      .is("lembrete_resultado", null)
      .order("vence_em", { ascending: true })
      .limit(300),
    // O que aconteceu nos últimos 30 dias (enviado, expirado, falhou…).
    supabase
      .from("themidia_lead_procedimentos")
      .select(COLUNAS_DA_FILA)
      .eq("organization_id", org.orgId)
      .eq("status", "realizado")
      .not("lembrete_resultado", "is", null)
      .gte("updated_at", trintaDias)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const erro = catalogo.error ?? pendentes.error ?? recentes.error;
  if (erro) {
    if (tabelaAusente(erro)) {
      return fail("feature_unavailable", t("Procedimentos ainda não estão ativados nesta instalação."), 404, { requestId });
    }
    return fail("internal_error", t("Erro ao listar procedimentos."), 500, { requestId });
  }

  return ok(
    resumirRetornos({
      catalogo: (catalogo.data ?? []) as Array<{
        id: string;
        nome: string;
        meses_validade: number;
        ativo: boolean;
        etapa_destino_id: string | null;
      }>,
      pendentes: (pendentes.data ?? []) as unknown as LinhaDoRetorno[],
      recentes: (recentes.data ?? []) as unknown as LinhaDoRetorno[],
    }),
    { requestId },
  );
}
