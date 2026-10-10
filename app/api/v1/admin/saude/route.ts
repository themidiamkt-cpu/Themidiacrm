import { randomUUID } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import {
  avaliarSaude,
  type Alerta,
  type CanalSaude,
  type DadosDeSaude,
  type ProvedorIA,
} from "@/lib/saude/avaliar";

export interface CustoPorOrganizacao {
  organizacao: string;
  chamadas: number;
  erros: number;
  custo_cents: number;
}

export interface CustoPorPonto {
  purpose: string;
  model: string;
  chamadas: number;
  custo_cents: number;
}

export interface SaudeData {
  gerado_em: string;
  alertas: Alerta[];
  provedores: ProvedorIA[];
  canais: CanalSaude[];
  contadores: Omit<DadosDeSaude, "provedores" | "canais">;
  custo_7d: { por_organizacao: CustoPorOrganizacao[]; por_ponto: CustoPorPonto[]; total_cents: number };
}

const LIMITE_LINHAS = 20000;

/**
 * GET /api/v1/admin/saude — fotografia do que está quebrado agora.
 * Só administrador da plataforma; só leitura.
 */
export async function GET() {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const admin = createAdminClient();
  const agora = Date.now();
  const h24 = new Date(agora - 24 * 3600_000).toISOString();
  const d7 = new Date(agora - 7 * 24 * 3600_000).toISOString();
  const min10 = new Date(agora - 10 * 60_000).toISOString();

  const orgNome = new Map<string, string>();
  const { data: orgs } = await admin.from("organizations").select("id, display_name");
  for (const o of orgs ?? []) orgNome.set(o.id as string, (o.display_name as string) ?? (o.id as string));

  // ---- IA: 7 dias de chamadas; provedor só das últimas 24 h ----
  const { data: calls } = await admin
    .from("llm_calls")
    .select("organization_id, provider, model, purpose, status, error_code, cost_cents, created_at")
    .gte("created_at", d7)
    .order("created_at", { ascending: false })
    .limit(LIMITE_LINHAS);

  const prov = new Map<string, ProvedorIA>();
  const porOrg = new Map<string, CustoPorOrganizacao>();
  const porPonto = new Map<string, CustoPorPonto>();
  let total = 0;
  for (const c of calls ?? []) {
    const cents = Number(c.cost_cents ?? 0);
    const criada = c.created_at as string;
    const org = orgNome.get(c.organization_id as string) ?? (c.organization_id as string);
    const o = porOrg.get(org) ?? { organizacao: org, chamadas: 0, erros: 0, custo_cents: 0 };
    o.chamadas += 1;
    o.custo_cents += cents;
    if (c.status === "erro") o.erros += 1;
    porOrg.set(org, o);

    const chave = `${c.purpose}|${c.model}`;
    const p = porPonto.get(chave) ?? {
      purpose: c.purpose as string,
      model: c.model as string,
      chamadas: 0,
      custo_cents: 0,
    };
    p.chamadas += 1;
    p.custo_cents += cents;
    porPonto.set(chave, p);
    total += cents;

    if (criada >= h24) {
      const pr = prov.get(c.provider as string) ?? {
        provider: c.provider as string,
        ok: 0,
        erros: 0,
        ultimo_erro_code: null,
        ultimo_erro_em: null,
        ultimo_ok_em: null,
      };
      if (c.status === "erro") {
        pr.erros += 1;
        if (!pr.ultimo_erro_em || criada > pr.ultimo_erro_em) {
          pr.ultimo_erro_em = criada;
          pr.ultimo_erro_code = (c.error_code as string | null) ?? null;
        }
      } else {
        pr.ok += 1;
        if (!pr.ultimo_ok_em || criada > pr.ultimo_ok_em) pr.ultimo_ok_em = criada;
      }
      prov.set(c.provider as string, pr);
    }
  }

  // ---- canais ----
  const { data: sessoes } = await admin
    .from("channel_sessions")
    .select("id, organization_id, display_name, waha_session_name, status, consecutive_health_fails, metadata");
  const canais: CanalSaude[] = (sessoes ?? [])
    .filter((s) => s.status !== "ARCHIVED")
    .map((s) => ({
      id: s.id as string,
      organizacao: orgNome.get(s.organization_id as string) ?? (s.organization_id as string),
      nome: (s.display_name as string | null) ?? (s.waha_session_name as string),
      status: s.status as string,
      falhas_seguidas: Number(s.consecutive_health_fails ?? 0),
      ia_aberta: (s.metadata as { ai_gate?: string } | null)?.ai_gate === "open",
    }));

  // ---- contadores ----
  const head = { count: "exact" as const, head: true };
  const [msgs, atrasados, mortos, followups] = await Promise.all([
    admin.from("messages").select("id", head).eq("status", "failed").gte("created_at", h24),
    admin.from("job_queue").select("id", head).eq("status", "pending").lt("run_after", min10),
    admin.from("job_queue").select("id", head).eq("status", "dead").gte("created_at", h24),
    admin.from("followup_enrollments").select("id", head).eq("status", "dead"),
  ]);

  const dados: DadosDeSaude = {
    provedores: [...prov.values()],
    canais,
    mensagens_falhas_24h: msgs.count ?? 0,
    jobs_pendentes_atrasados: atrasados.count ?? 0,
    jobs_mortos_24h: mortos.count ?? 0,
    followups_mortos: followups.count ?? 0,
  };

  const { provedores, canais: _c, ...contadores } = dados;
  void _c;
  return ok<SaudeData>(
    {
      gerado_em: new Date().toISOString(),
      alertas: avaliarSaude(dados),
      provedores,
      canais,
      contadores,
      custo_7d: {
        por_organizacao: [...porOrg.values()].sort((a, b) => b.custo_cents - a.custo_cents),
        por_ponto: [...porPonto.values()].sort((a, b) => b.custo_cents - a.custo_cents).slice(0, 15),
        total_cents: total,
      },
    },
    { requestId },
  );
}
