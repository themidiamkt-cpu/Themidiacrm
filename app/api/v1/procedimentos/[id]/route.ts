/**
 * PATCH  /api/v1/procedimentos/[id] — edita nome, validade, mensagem, etapa ou pausa (manager+).
 * DELETE /api/v1/procedimentos/[id] — remove do catálogo (manager+). Os registros dos
 *        leads ficam (histórico), mas sem catálogo não disparam mais mensagem.
 *
 * Mudar a MENSAGEM vale para os envios futuros, inclusive de leads que já têm o
 * procedimento registrado: o texto é lido do catálogo no momento do envio.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DO_CATALOGO, semTipos } from "@/lib/procedimentos/db";
import { atualizarProcedimentoSchema } from "@/lib/procedimentos/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "procedimentos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);
  const { id } = await params;

  const parsed = atualizarProcedimentoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = semTipos(await createClient());
  const { data, error } = await supabase
    .from("themidia_procedimentos")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select(COLUNAS_DO_CATALOGO)
    .maybeSingle();
  if (error?.code === "23505") {
    return fail("conflict", t("Já existe um procedimento com esse nome."), 409, { requestId });
  }
  if (error) return fail("internal_error", t("Erro ao salvar o procedimento."), 500, { requestId });
  if (!data) return fail("not_found", t("Procedimento não encontrado."), 404, { requestId });

  void audit({
    action: "procedimento.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "procedimento",
    resourceId: data.id,
    requestId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "procedimentos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);
  const { id } = await params;

  const supabase = semTipos(await createClient());
  const { data, error } = await supabase
    .from("themidia_procedimentos")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", t("Erro ao excluir o procedimento."), 500, { requestId });
  if (!data) return fail("not_found", t("Procedimento não encontrado."), 404, { requestId });

  void audit({
    action: "procedimento.deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "procedimento",
    resourceId: data.id,
    requestId,
  });
  return noContent(requestId);
}
