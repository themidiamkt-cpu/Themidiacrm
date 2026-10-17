/**
 * PATCH  /api/v1/leads/[id]/procedimentos/[pid] — muda o status (agendado → realizado,
 *        cancelar) ou as datas. Ao marcar REALIZADO o vencimento é recalculado com a
 *        validade ATUAL do catálogo.
 * DELETE /api/v1/leads/[id]/procedimentos/[pid] — remove o registro.
 *
 * Retorno JÁ ENVIADO não se reabre: mudar a data de realização de um registro
 * cujo lembrete saiu mandaria a mensagem de novo para o mesmo paciente. Para um
 * novo ciclo (voltou e fez de novo), registre o procedimento outra vez.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DO_LEAD, semTipos } from "@/lib/procedimentos/db";
import { hojeNoFuso, venceEm } from "@/lib/procedimentos/regras";
import { atualizarProcedimentoDoLeadSchema } from "@/lib/procedimentos/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; pid: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "lead_procedimentos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);
  const { id, pid } = await params;

  const parsed = atualizarProcedimentoDoLeadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const dados = parsed.data;

  const supabase = semTipos(await createClient());
  const { data: atual } = await supabase
    .from("themidia_lead_procedimentos")
    .select("id, procedimento_id, status, agendado_para, realizado_em, lembrete_enviado_em, lembrete_resultado")
    .eq("id", pid)
    .eq("lead_id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!atual) return fail("not_found", t("Procedimento não encontrado."), 404, { requestId });

  const status = dados.status ?? atual.status;
  const jaEnviado = !!atual.lembrete_enviado_em || atual.lembrete_resultado === "enviado";
  // Só um NOVO CICLO de vencimento reabre a varredura: virar realizado vindo de
  // outro status, ou trocar a data em que foi realizado.
  const novoCiclo =
    status === "realizado" &&
    (atual.status !== "realizado" ||
      (dados.realizado_em !== undefined && dados.realizado_em !== atual.realizado_em));
  if (jaEnviado && novoCiclo) {
    return fail("conflict", t("O retorno deste procedimento já foi enviado. Registre um novo procedimento."), 409, { requestId });
  }

  const hoje = hojeNoFuso(org.timezone);
  const mudanca: Record<string, unknown> = {};
  if (dados.status !== undefined) mudanca.status = dados.status;

  if (status === "realizado") {
    const realizadoEm = dados.realizado_em ?? atual.realizado_em ?? hoje;
    if (realizadoEm > hoje) {
      return fail("validation_failed", t("A data em que foi realizado não pode ser no futuro."), 422, { requestId });
    }
    if (!atual.procedimento_id) {
      return fail("validation_failed", t("O procedimento foi removido do catálogo."), 422, { requestId });
    }
    const { data: catalogo } = await supabase
      .from("themidia_procedimentos")
      .select("meses_validade")
      .eq("id", atual.procedimento_id)
      .eq("organization_id", org.orgId)
      .maybeSingle();
    if (!catalogo) {
      return fail("validation_failed", t("O procedimento foi removido do catálogo."), 422, { requestId });
    }
    if (novoCiclo) {
      mudanca.realizado_em = realizadoEm;
      mudanca.vence_em = venceEm(realizadoEm, catalogo.meses_validade);
      // Novo ciclo de vencimento: a varredura volta a enxergar o registro.
      mudanca.lembrete_enviado_em = null;
      mudanca.lembrete_resultado = null;
      mudanca.lembrete_tentativas = 0;
    }
  } else {
    // agendado ou cancelado: nada vence, nada dispara.
    mudanca.vence_em = null;
    if (status === "agendado") mudanca.realizado_em = null;
    if (dados.agendado_para !== undefined) mudanca.agendado_para = dados.agendado_para;
  }

  if (Object.keys(mudanca).length === 0) mudanca.status = status;
  const { data, error } = await supabase
    .from("themidia_lead_procedimentos")
    .update(mudanca)
    .eq("id", pid)
    .eq("lead_id", id)
    .eq("organization_id", org.orgId)
    .select(COLUNAS_DO_LEAD)
    .maybeSingle();
  if (error) return fail("internal_error", t("Erro ao salvar o procedimento."), 500, { requestId });
  if (!data) return fail("not_found", t("Procedimento não encontrado."), 404, { requestId });

  void audit({
    action: "lead_procedimento.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "lead_procedimento",
    resourceId: data.id,
    requestId,
    metadata: { status },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "lead_procedimentos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);
  const { id, pid } = await params;

  const supabase = semTipos(await createClient());
  const { data, error } = await supabase
    .from("themidia_lead_procedimentos")
    .delete()
    .eq("id", pid)
    .eq("lead_id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", t("Erro ao excluir o procedimento."), 500, { requestId });
  if (!data) return fail("not_found", t("Procedimento não encontrado."), 404, { requestId });

  void audit({
    action: "lead_procedimento.deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "lead_procedimento",
    resourceId: data.id,
    requestId,
  });
  return noContent(requestId);
}
