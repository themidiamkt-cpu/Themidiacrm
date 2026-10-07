import { describe, expect, it, vi } from "vitest";
import type pg from "pg";

import { contatoDaConversaVeioDeAnuncio, DIAS_DA_ORIGEM } from "./agente-da-origem";
import { resolveTurnAgent } from "./resolve-turn-agent";
import type { LoadedRouter } from "./router-config";

const banco = (linhas: unknown[] | Error | "lento") => {
  const query = vi.fn(async (_sql: string, _parametros: unknown[]) => {
    if (linhas instanceof Error) throw linhas;
    if (linhas === "lento") return new Promise(() => undefined);
    return { rows: linhas };
  });
  return { db: { query } as unknown as pg.Pool, query };
};

describe("contatoDaConversaVeioDeAnuncio", () => {
  it("contato com origem de anúncio, dentro do prazo: sim", async () => {
    const { db, query } = banco([{ source_metadata: { ad_platform: "meta_ads" } }]);
    expect(await contatoDaConversaVeioDeAnuncio(db, "org-1", "conv-1")).toBe(true);
    // A organização e o prazo vão como parâmetros, nunca concatenados no texto.
    expect(query.mock.calls[0]![1]).toEqual(["org-1", "conv-1", DIAS_DA_ORIGEM]);
    expect(String(query.mock.calls[0]![0])).toContain("c.organization_id = v.organization_id");
  });

  it("contato sem origem de anúncio, ou fora do prazo (nenhuma linha): não", async () => {
    expect(
      await contatoDaConversaVeioDeAnuncio(
        banco([{ source_metadata: { ad_platform: "site" } }]).db,
        "o",
        "c",
      ),
    ).toBe(false);
    expect(await contatoDaConversaVeioDeAnuncio(banco([]).db, "o", "c")).toBe(false);
  });

  it('erro ou banco lento valem "não": a dúvida nunca segura o turno', async () => {
    expect(await contatoDaConversaVeioDeAnuncio(banco(new Error("caiu")).db, "o", "c")).toBe(false);
    vi.useFakeTimers();
    const resposta = contatoDaConversaVeioDeAnuncio(banco("lento").db, "o", "c");
    await vi.advanceTimersByTimeAsync(600);
    expect(await resposta).toBe(false);
    vi.useRealTimers();
  });
});

const membros = [
  { agentId: "agent-site", intentName: "site", intentDescription: "quer um site", examples: [] },
];

const roteador = (over: Partial<LoadedRouter> = {}): LoadedRouter => ({
  id: "router-1",
  name: "R",
  classifierModel: null,
  classifierProvider: null,
  sticky: true,
  minConfidence: 0.6,
  fallbackAgentId: "agent-reserva",
  adOriginAgentId: "agent-anuncios",
  members: membros,
  ...over,
});

const entrada = {
  tenantId: "org-1",
  leadId: "lead-1",
  jobId: "job-1",
  channelSessionId: "sess-1",
  conversationId: "conv-1",
  signal: "Olá, tenho interesse",
  stickyAgentId: null,
  stickyIntent: null,
};

function deps(over: Record<string, unknown> = {}) {
  const carregarPorId = vi.fn(async (_db: unknown, _org: unknown, id: string) => ({ agentId: id }));
  const classifyIntent = vi.fn(async () => ({ intentName: "site", confidence: 0.95 }));
  return {
    carregarPorId,
    classifyIntent,
    deps: {
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      agenteDaCampanha: vi.fn(async () => null),
      veioDeAnuncio: vi.fn(async () => true),
      loadActiveRouter: vi.fn(async () => roteador()),
      loadPublishedAgentConfigById: carregarPorId,
      loadPublishedAgentConfig: vi.fn(async () => ({ agentId: "agent-da-sessao" })),
      classifyIntent,
      consultarJev: vi.fn(() => ({
        estado: Promise.resolve("desligada"),
        escolha: Promise.resolve(null),
        observar: vi.fn(),
      })),
      ...over,
    } as never,
  };
}

describe("resolveTurnAgent: quem chegou por anúncio", () => {
  it("vai para o agente da origem, sem gastar o classificador nem registrar decisão do roteador", async () => {
    const d = deps();
    const out = await resolveTurnAgent({} as never, {} as never, entrada, d.deps);
    expect(out).toMatchObject({ outcome: "origem", routerId: null, intentName: null });
    expect((out.config as unknown as { agentId: string }).agentId).toBe("agent-anuncios");
    expect(d.classifyIntent).not.toHaveBeenCalled();
  });

  it("contato que não veio de anúncio segue pelo assunto, como sempre", async () => {
    const d = deps({ veioDeAnuncio: vi.fn(async () => false) });
    const out = await resolveTurnAgent({} as never, {} as never, entrada, d.deps);
    expect(out.outcome).toBe("classified");
    expect((out.config as unknown as { agentId: string }).agentId).toBe("agent-site");
  });

  it("roteador sem agente de anúncio nem pergunta a origem", async () => {
    const veioDeAnuncio = vi.fn(async () => true);
    const d = deps({
      veioDeAnuncio,
      loadActiveRouter: vi.fn(async () => roteador({ adOriginAgentId: null })),
    });
    const out = await resolveTurnAgent({} as never, {} as never, entrada, d.deps);
    expect(veioDeAnuncio).not.toHaveBeenCalled();
    expect(out.outcome).toBe("classified");
  });

  it("a campanha que criou a conversa continua acima da origem", async () => {
    const d = deps({ agenteDaCampanha: vi.fn(async () => "agent-da-campanha") });
    const out = await resolveTurnAgent({} as never, {} as never, entrada, d.deps);
    expect(out.outcome).toBe("campanha");
    expect((out.config as unknown as { agentId: string }).agentId).toBe("agent-da-campanha");
  });

  it("agente de anúncio sem versão publicada: falha aberta, segue pela régua do número", async () => {
    const d = deps();
    d.carregarPorId.mockImplementation(async (_db: unknown, _org: unknown, id: string) =>
      id === "agent-anuncios" ? (null as never) : { agentId: id },
    );
    const out = await resolveTurnAgent({} as never, {} as never, entrada, d.deps);
    expect(out.outcome).toBe("classified");
    expect((out.config as unknown as { agentId: string }).agentId).toBe("agent-site");
  });

  it("vale também no turno sem mensagem (follow-up): a origem decide antes do sticky", async () => {
    const d = deps();
    const out = await resolveTurnAgent(
      {} as never,
      {} as never,
      { ...entrada, signal: null, stickyAgentId: "agent-site", stickyIntent: "site" },
      d.deps,
    );
    expect(out.outcome).toBe("origem");
  });
});
