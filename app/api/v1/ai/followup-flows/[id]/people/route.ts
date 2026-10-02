/**
 * GET /api/v1/ai/followup-flows/[id]/people — quem está em cada passo do fluxo.
 *
 * Leitura para o construtor: os enrollments VIVOS do fluxo, mais os encerrados
 * dos últimos 30 dias, agrupados pelo passo (`current_node_id`). Qualquer membro
 * lê (mesmo papel da Fila); RLS + filtro explícito de `organization_id`.
 *
 * Tem teto: é um retrato para a tela, não um relatório. Fluxo com mais gente
 * viva do que o teto devolve `truncado: true` e a Fila continua sendo o lugar
 * da lista inteira.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import {
  agruparPessoasNoFluxo,
  JANELA_DOS_ENCERRADOS_DIAS,
  STATUS_ENCERRADOS,
  STATUS_VIVOS,
  type LinhaDeEnrollment,
} from "@/lib/followup/pessoas-no-fluxo";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TETO_VIVOS = 500;
const TETO_ENCERRADOS = 300;
const COLUNAS =
  "id, contact_id, status, current_node_id, next_eval_at, updated_at, outcome, contacts:contact_id(id, name, display_name, phone_number)";

type RouteCtx = { params: Promise<{ id: string }> };

interface Contato {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
}
interface Linha {
  id: string;
  contact_id: string;
  status: string;
  current_node_id: string;
  next_eval_at: string | null;
  updated_at: string;
  outcome: string | null;
  contacts: Contato | Contato[] | null;
}

function linha(l: Linha, semContato: string): LinhaDeEnrollment {
  const contato = Array.isArray(l.contacts) ? (l.contacts[0] ?? null) : l.contacts;
  return {
    id: l.id,
    contact_id: l.contact_id,
    contact_name: contato ? rotuloDoContato(contato) : semContato,
    status: l.status,
    current_node_id: l.current_node_id,
    next_eval_at: l.next_eval_at,
    updated_at: l.updated_at,
    outcome: l.outcome,
  };
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("viewer", { requestId, resource: "followup_queue" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const org = authz.org.orgId;

  const supabase = await createClient();
  const desde = new Date(Date.now() - JANELA_DOS_ENCERRADOS_DIAS * 86_400_000).toISOString();
  const [vivos, encerrados] = await Promise.all([
    supabase
      .from("followup_enrollments")
      .select(COLUNAS)
      .eq("organization_id", org)
      .eq("pointer_id", id)
      .in("status", [...STATUS_VIVOS])
      .order("updated_at", { ascending: true })
      .limit(TETO_VIVOS + 1),
    supabase
      .from("followup_enrollments")
      .select(COLUNAS)
      .eq("organization_id", org)
      .eq("pointer_id", id)
      .in("status", [...STATUS_ENCERRADOS])
      .gte("updated_at", desde)
      .order("updated_at", { ascending: false })
      .limit(TETO_ENCERRADOS),
  ]);
  if (vivos.error) return fail("internal_error", vivos.error.message, 500, { requestId });
  if (encerrados.error) return fail("internal_error", encerrados.error.message, 500, { requestId });

  const linhasVivas = (vivos.data ?? []) as unknown as Linha[];
  const truncado = linhasVivas.length > TETO_VIVOS;
  const semContato = t("Contato removido");
  const pessoas = agruparPessoasNoFluxo(
    [...linhasVivas.slice(0, TETO_VIVOS), ...((encerrados.data ?? []) as unknown as Linha[])].map(
      (l) => linha(l, semContato),
    ),
  );
  return ok(
    { ...pessoas, truncado, janela_dos_encerrados_dias: JANELA_DOS_ENCERRADOS_DIAS },
    { requestId, headers: { "Cache-Control": "no-store" } },
  );
}
