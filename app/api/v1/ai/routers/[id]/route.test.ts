import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/v1/ai/routers/:id é a rota que o editor rebusca depois de salvar.
 * Se ela não devolve `flow_pointer_id`, o baseline do editor vira "nenhuma
 * intenção tem roteiro": o Salvar fica ligado depois de vincular, e escolher
 * "Nenhum" deixa o draft igual ao baseline — o desvínculo nunca é gravado e a
 * intenção segue disparando o roteiro.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ROUTER_ID = "55555555-5555-4555-8555-555555555555";

describe("GET /api/v1/ai/routers/:id", () => {
  it("devolve flow_pointer_id de cada membro", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "a@example.com",
        full_name: null,
        avatar_url: null,
        is_platform_admin: false,
        idioma: "pt-BR" as const,
        organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "agent" }],
      },
      org: { orgId: ORG_ID, name: "Org", role: "agent" },
    } as Awaited<ReturnType<typeof requireRole>>);

    const selects: Record<string, string> = {};
    const chain = (table: string, result: unknown) => {
      const q = {
        select(cols: string) {
          selects[table] = cols;
          return q;
        },
        eq() {
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: result, error: null }),
        order: () => Promise.resolve({ data: result, error: null }),
      };
      return q;
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) =>
        table === "ai_routers"
          ? chain(table, { id: ROUTER_ID, name: "R" })
          : chain(table, [{ id: "m1", flow_pointer_id: "77777777-7777-4777-8777-777777777777" }]),
    } as unknown as ReturnType<typeof createAdminClient>);

    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://x/api/v1/ai/routers/${ROUTER_ID}`), {
      params: Promise.resolve({ id: ROUTER_ID }),
    });

    expect(res.status).toBe(200);
    expect(selects.ai_router_members).toContain("flow_pointer_id");
  });
});

/**
 * PATCH com `config.pipeline_agents`: a regra "quem está num funil". O funil e o
 * agente moram no jsonb, sem chave estrangeira, então quem confere que os dois
 * são DESTA organização é a rota — o id vem do corpo, a organização nunca.
 */
describe("PATCH /api/v1/ai/routers/:id — regra de funil", () => {
  const FUNIL = "66666666-6666-4666-8666-666666666666";
  const AGENTE = "77777777-7777-4777-8777-777777777777";

  function preparar(achados: { funis: string[]; agentes: string[] }) {
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "a@example.com",
        full_name: null,
        avatar_url: null,
        is_platform_admin: false,
        idioma: "pt-BR" as const,
        organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "admin" }],
      },
      org: { orgId: ORG_ID, name: "Org", role: "admin" },
    } as Awaited<ReturnType<typeof requireRole>>);

    const filtros: Record<string, Array<[string, unknown]>> = {};
    const gravado: { config?: Record<string, unknown> } = {};
    const consulta = (table: string) => {
      const usados: Array<[string, unknown]> = [];
      filtros[table] = usados;
      const q = {
        select: () => q,
        eq(coluna: string, valor: unknown) {
          usados.push([coluna, valor]);
          return q;
        },
        is: () => q,
        in: (_coluna: string, ids: string[]) =>
          Promise.resolve({
            data: (table === "crm_pipelines" ? achados.funis : achados.agentes)
              .filter((id) => ids.includes(id))
              .map((id) => ({ id })),
            error: null,
          }),
        maybeSingle: () =>
          Promise.resolve({ data: { id: ROUTER_ID, config: { sticky: true, min_confidence: 0.6 } }, error: null }),
        update(valores: { config?: Record<string, unknown> }) {
          gravado.config = valores.config;
          const fim = { eq: () => fim, then: (ok: (v: { error: null }) => unknown) => ok({ error: null }) };
          return fim;
        },
      };
      return q;
    };
    vi.mocked(createAdminClient).mockReturnValue({ from: consulta } as unknown as ReturnType<typeof createAdminClient>);
    return { filtros, gravado };
  }

  const patch = async (config: unknown) => {
    const { PATCH } = await import("./route");
    return PATCH(
      new NextRequest(`http://x/api/v1/ai/routers/${ROUTER_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ config }),
      }),
      { params: Promise.resolve({ id: ROUTER_ID }) },
    );
  };

  it("grava a regra conferida, mesclada ao config que já existia", async () => {
    const { filtros, gravado } = preparar({ funis: [FUNIL], agentes: [AGENTE] });
    const res = await patch({ pipeline_agents: [{ pipeline_id: FUNIL, agent_id: AGENTE }] });
    expect(res.status).toBe(200);
    expect(gravado.config).toEqual({
      sticky: true,
      min_confidence: 0.6,
      pipeline_agents: [{ pipeline_id: FUNIL, agent_id: AGENTE }],
    });
    // Funil e agente procurados DENTRO da organização de quem pediu.
    expect(filtros.crm_pipelines).toContainEqual(["organization_id", ORG_ID]);
    expect(filtros.ai_agents).toContainEqual(["organization_id", ORG_ID]);
  });

  it("recusa funil ou agente que não é desta organização, sem gravar nada", async () => {
    const semFunil = preparar({ funis: [], agentes: [AGENTE] });
    expect((await patch({ pipeline_agents: [{ pipeline_id: FUNIL, agent_id: AGENTE }] })).status).toBe(422);
    expect(semFunil.gravado.config).toBeUndefined();

    const semAgente = preparar({ funis: [FUNIL], agentes: [] });
    expect((await patch({ pipeline_agents: [{ pipeline_id: FUNIL, agent_id: AGENTE }] })).status).toBe(422);
    expect(semAgente.gravado.config).toBeUndefined();
  });

  it("recusa forma torta: id que não é uuid, chave a mais, funil repetido", async () => {
    const { gravado } = preparar({ funis: [FUNIL], agentes: [AGENTE] });
    const regra = { pipeline_id: FUNIL, agent_id: AGENTE };
    expect((await patch({ pipeline_agents: [{ ...regra, pipeline_id: "x" }] })).status).toBe(422);
    expect((await patch({ pipeline_agents: [{ ...regra, organization_id: ORG_ID }] })).status).toBe(422);
    expect((await patch({ pipeline_agents: [regra, regra] })).status).toBe(422);
    expect((await patch({ pipeline_agents: "todos" })).status).toBe(422);
    expect(gravado.config).toBeUndefined();
  });

  it("`null` ou lista vazia limpam a regra", async () => {
    const { gravado } = preparar({ funis: [], agentes: [] });
    expect((await patch({ pipeline_agents: null })).status).toBe(200);
    expect(gravado.config?.pipeline_agents).toEqual([]);
  });
});
