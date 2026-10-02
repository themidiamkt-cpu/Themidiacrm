/**
 * GET /api/v1/ai/followup-flows/people-counts — quantas pessoas estão em cada
 * fluxo AGORA (enrollments vivos), para a lista de fluxos.
 *
 * Mesmo conjunto de "vivo" do contador por passo do construtor
 * (`STATUS_VIVOS`), para os dois números nunca discordarem. Qualquer membro lê;
 * RLS + filtro explícito de `organization_id`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { contarPessoasPorFluxo, STATUS_VIVOS } from "@/lib/followup/pessoas-no-fluxo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Teto da leitura: acima disso o número da tela é "pelo menos". */
const TETO = 10_000;

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "followup_queue" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followup_enrollments")
    .select("pointer_id")
    .eq("organization_id", authz.org.orgId)
    .in("status", [...STATUS_VIVOS])
    .limit(TETO);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const linhas = (data ?? []) as { pointer_id: string | null }[];
  return ok(
    { por_fluxo: contarPessoasPorFluxo(linhas), truncado: linhas.length >= TETO },
    { requestId, headers: { "Cache-Control": "no-store" } },
  );
}
