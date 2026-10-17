/**
 * GET  /api/v1/procedimentos — o catálogo de procedimentos da organização
 *      (agent+ lê; a RLS já filtra por organização).
 * POST /api/v1/procedimentos — cadastra um procedimento (manager+): nome, meses de
 *      validade, mensagem de retorno e a etapa para onde o lead vai depois.
 *
 * Cadastrar NÃO manda nada: a mensagem só sai quando um lead tem este procedimento
 * REALIZADO e a validade vence (ver `lib/procedimentos/executor.ts`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DO_CATALOGO, semTipos, tabelaAusente } from "@/lib/procedimentos/db";
import { criarProcedimentoSchema } from "@/lib/procedimentos/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "procedimentos" });
  if (!authz.ok) return authz.response;
  const { org } = authz;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const supabase = semTipos(await createClient());
  const { data, error } = await supabase
    .from("themidia_procedimentos")
    .select(COLUNAS_DO_CATALOGO)
    .eq("organization_id", org.orgId)
    .order("nome", { ascending: true });
  if (error) {
    if (tabelaAusente(error)) {
      return fail("feature_unavailable", t("Procedimentos ainda não estão ativados nesta instalação."), 404, { requestId });
    }
    return fail("internal_error", t("Erro ao listar procedimentos."), 500, { requestId });
  }
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "procedimentos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);

  const parsed = criarProcedimentoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = semTipos(await createClient());
  const { data, error } = await supabase
    .from("themidia_procedimentos")
    .insert({
      organization_id: org.orgId,
      created_by_user_id: user.id,
      nome: parsed.data.nome,
      meses_validade: parsed.data.meses_validade,
      mensagem: parsed.data.mensagem,
      etapa_destino_id: parsed.data.etapa_destino_id ?? null,
      ativo: parsed.data.ativo ?? true,
    })
    .select(COLUNAS_DO_CATALOGO)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return fail("conflict", t("Já existe um procedimento com esse nome."), 409, { requestId });
    }
    if (tabelaAusente(error)) {
      return fail("feature_unavailable", t("Procedimentos ainda não estão ativados nesta instalação."), 404, { requestId });
    }
    return fail("internal_error", t("Erro ao salvar o procedimento."), 500, { requestId });
  }

  void audit({
    action: "procedimento.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "procedimento",
    resourceId: data.id,
    requestId,
  });
  return ok(data, { status: 201, requestId });
}
