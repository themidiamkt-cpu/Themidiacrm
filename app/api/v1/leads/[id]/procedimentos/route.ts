/**
 * GET  /api/v1/leads/[id]/procedimentos — procedimentos agendados ou feitos do lead.
 * POST /api/v1/leads/[id]/procedimentos — registra um procedimento do catálogo:
 *      `agendado` (com a data marcada) ou `realizado` (com a data em que foi feito,
 *      ou hoje). Ao REALIZAR, o vencimento é calculado: realizado_em + meses do catálogo.
 *
 * Registrar não manda mensagem. O envio é o cron (`lib/procedimentos/executor.ts`),
 * quando a validade vence.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DO_LEAD, semTipos, tabelaAusente } from "@/lib/procedimentos/db";
import { hojeNoFuso, venceEm } from "@/lib/procedimentos/regras";
import { registrarProcedimentoDoLeadSchema } from "@/lib/procedimentos/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "lead_procedimentos" });
  if (!authz.ok) return authz.response;
  const { org } = authz;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const supabase = semTipos(await createClient());
  const { data, error } = await supabase
    .from("themidia_lead_procedimentos")
    .select(COLUNAS_DO_LEAD)
    .eq("organization_id", org.orgId)
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    if (tabelaAusente(error)) {
      return fail("feature_unavailable", t("Procedimentos ainda não estão ativados nesta instalação."), 404, { requestId });
    }
    return fail("internal_error", t("Erro ao listar procedimentos."), 500, { requestId });
  }
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "lead_procedimentos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);
  const { id } = await params;

  const parsed = registrarProcedimentoDoLeadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const dados = parsed.data;

  const supabase = semTipos(await createClient());
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!lead) return fail("not_found", t("Lead não encontrado."), 404, { requestId });
  if (!lead.contact_id) {
    return fail("validation_failed", t("Este negócio não tem contato para receber o retorno."), 422, { requestId });
  }

  const { data: catalogo, error: erroCatalogo } = await supabase
    .from("themidia_procedimentos")
    .select("id, nome, meses_validade")
    .eq("id", dados.procedimento_id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (erroCatalogo && tabelaAusente(erroCatalogo)) {
    return fail("feature_unavailable", t("Procedimentos ainda não estão ativados nesta instalação."), 404, { requestId });
  }
  if (!catalogo) return fail("not_found", t("Procedimento não encontrado."), 404, { requestId });

  const hoje = hojeNoFuso(org.timezone);
  const realizado = dados.status === "realizado";
  const realizadoEm = realizado ? (dados.realizado_em ?? hoje) : null;
  if (realizadoEm && realizadoEm > hoje) {
    return fail("validation_failed", t("A data em que foi realizado não pode ser no futuro."), 422, { requestId });
  }

  const { data, error } = await supabase
    .from("themidia_lead_procedimentos")
    .insert({
      organization_id: org.orgId,
      lead_id: lead.id,
      contact_id: lead.contact_id,
      procedimento_id: catalogo.id,
      nome: catalogo.nome,
      status: dados.status,
      agendado_para: dados.status === "agendado" ? dados.agendado_para : null,
      realizado_em: realizadoEm,
      vence_em: realizadoEm ? venceEm(realizadoEm, catalogo.meses_validade) : null,
      created_by_user_id: user.id,
    })
    .select(COLUNAS_DO_LEAD)
    .single();
  if (error || !data) {
    return fail("internal_error", t("Erro ao salvar o procedimento."), 500, { requestId });
  }

  void audit({
    action: "lead_procedimento.registered",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "lead_procedimento",
    resourceId: data.id,
    requestId,
    metadata: { status: dados.status },
  });
  return ok(data, { status: 201, requestId });
}
