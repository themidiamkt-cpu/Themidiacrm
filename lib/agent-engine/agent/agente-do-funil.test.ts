import { describe, expect, it, vi } from "vitest";
import type pg from "pg";

import {
  agenteDoFunil,
  caladoNesteTurno,
  foraDoFunilDoAgente,
  funisAbertosDoContatoDaConversa,
  MAX_REGRAS_DE_FUNIL,
  type RegraDeFunil,
} from "./agente-do-funil";
import { resolveTurnAgent } from "./resolve-turn-agent";
import { lerRegrasDeFunil, type LoadedRouter } from "./router-config";

const banco = (linhas: unknown[] | Error | "lento") => {
  const query = vi.fn(async (_sql: string, _parametros: unknown[]) => {
    if (linhas instanceof Error) throw linhas;
    if (linhas === "lento") return new Promise(() => undefined);
    return { rows: linhas };
  });
  return { db: { query } as unknown as pg.Pool, query };
};

const FUNIL_CLINICAS = "f0000000-0000-4000-8000-000000000001";
const FUNIL_SITES = "f0000000-0000-4000-8000-000000000002";
const AGENTE_ANUNCIOS = "a0000000-0000-4000-8000-000000000001";
const AGENTE_SITE = "a0000000-0000-4000-8000-000000000002";
const AGENTE_RESERVA = "a0000000-0000-4000-8000-000000000003";

const regras: RegraDeFunil[] = [{ pipelineId: FUNIL_CLINICAS, agentId: AGENTE_ANUNCIOS }];

describe("funisAbertosDoContatoDaConversa", () => {
  it("devolve os funis com negócio ABERTO do contato da conversa, só da organização", async () => {
    const { db, query } = banco([{ pipeline_id: FUNIL_CLINICAS }, { pipeline_id: FUNIL_SITES }]);
    const funis = await funisAbertosDoContatoDaConversa(db, "org-1", "conv-1");
    expect([...(funis ?? [])]).toEqual([FUNIL_CLINICAS, FUNIL_SITES]);
    // A organização vai como parâmetro e amarra as duas tabelas, nunca só uma.
    expect(query.mock.calls[0]![1]).toEqual(["org-1", "conv-1"]);
    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toContain("l.organization_id = v.organization_id");
    expect(sql).toContain("l.status = 'open'");
  });

  it("contato sem negócio aberto: conjunto vazio, que é diferente de não saber", async () => {
    const funis = await funisAbertosDoContatoDaConversa(banco([]).db, "o", "c");
    expect(funis).not.toBeNull();
    expect(funis?.size).toBe(0);
  });

  it("erro ou banco lento valem `null`: a dúvida não segura o turno", async () => {
    expect(await funisAbertosDoContatoDaConversa(banco(new Error("caiu")).db, "o", "c")).toBeNull();
    vi.useFakeTimers();
    const resposta = funisAbertosDoContatoDaConversa(banco("lento").db, "o", "c");
    await vi.advanceTimersByTimeAsync(600);
    expect(await resposta).toBeNull();
    vi.useRealTimers();
  });
});

describe("as duas perguntas da regra", () => {
  it("agenteDoFunil: o agente do funil que o contato ocupa; na dúvida, nenhum", () => {
    expect(agenteDoFunil(regras, new Set([FUNIL_CLINICAS]))).toBe(AGENTE_ANUNCIOS);
    expect(agenteDoFunil(regras, new Set([FUNIL_SITES]))).toBeNull();
    expect(agenteDoFunil(regras, new Set())).toBeNull();
    expect(agenteDoFunil(regras, null)).toBeNull();
    expect(agenteDoFunil([], new Set([FUNIL_CLINICAS]))).toBeNull();
  });

  it("foraDoFunilDoAgente: só barra o agente que TEM regra, e barra na dúvida", () => {
    expect(foraDoFunilDoAgente(regras, new Set([FUNIL_CLINICAS]), AGENTE_ANUNCIOS)).toBe(false);
    expect(foraDoFunilDoAgente(regras, new Set([FUNIL_SITES]), AGENTE_ANUNCIOS)).toBe(true);
    expect(foraDoFunilDoAgente(regras, new Set(), AGENTE_ANUNCIOS)).toBe(true);
    expect(foraDoFunilDoAgente(regras, null, AGENTE_ANUNCIOS)).toBe(true);
    // Agente sem regra de funil nunca é barrado, saiba-se ou não onde o contato está.
    expect(foraDoFunilDoAgente(regras, new Set(), AGENTE_SITE)).toBe(false);
    expect(foraDoFunilDoAgente(regras, null, AGENTE_SITE)).toBe(false);
    expect(foraDoFunilDoAgente([], null, AGENTE_ANUNCIOS)).toBe(false);
  });

  it("agente com dois funis atende quem está em qualquer um deles", () => {
    const duas = [...regras, { pipelineId: FUNIL_SITES, agentId: AGENTE_ANUNCIOS }];
    expect(foraDoFunilDoAgente(duas, new Set([FUNIL_SITES]), AGENTE_ANUNCIOS)).toBe(false);
  });

  it("caladoNesteTurno: pausa a cópia e tira do modo assistido, sem tocar no original", () => {
    const original = { agentId: AGENTE_ANUNCIOS, operationMode: "assisted", pausedAt: null } as never;
    const calado = caladoNesteTurno(original, new Date("2026-10-09T12:00:00.000Z"));
    expect(calado.pausedAt).toBe("2026-10-09T12:00:00.000Z");
    expect(calado.operationMode).toBe("automatic");
    expect((original as { pausedAt: unknown }).pausedAt).toBeNull();
  });
});

describe("lerRegrasDeFunil", () => {
  it("lê as linhas boas e descarta as tortas, sem lançar", () => {
    expect(
      lerRegrasDeFunil([
        { pipeline_id: FUNIL_CLINICAS, agent_id: AGENTE_ANUNCIOS },
        { pipeline_id: "nao-e-uuid", agent_id: AGENTE_SITE },
        { pipeline_id: FUNIL_SITES },
        null,
        "texto",
        // O mesmo funil de novo: vale a primeira regra.
        { pipeline_id: FUNIL_CLINICAS, agent_id: AGENTE_SITE },
      ]),
    ).toEqual([{ pipelineId: FUNIL_CLINICAS, agentId: AGENTE_ANUNCIOS }]);
    expect(lerRegrasDeFunil(undefined)).toEqual([]);
    expect(lerRegrasDeFunil({ pipeline_id: FUNIL_CLINICAS })).toEqual([]);
  });

  it("não lê além do teto", () => {
    const muitas = Array.from({ length: MAX_REGRAS_DE_FUNIL + 5 }, (_, i) => ({
      pipeline_id: `f0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      agent_id: AGENTE_ANUNCIOS,
    }));
    expect(lerRegrasDeFunil(muitas)).toHaveLength(MAX_REGRAS_DE_FUNIL);
  });
});

const membros = [{ agentId: AGENTE_SITE, intentName: "site", intentDescription: "quer um site", examples: [] }];

const roteador = (over: Partial<LoadedRouter> = {}): LoadedRouter => ({
  id: "router-1",
  name: "R",
  classifierModel: null,
  classifierProvider: null,
  sticky: true,
  minConfidence: 0.6,
  fallbackAgentId: AGENTE_RESERVA,
  adOriginAgentId: null,
  pipelineAgents: regras,
  members: membros,
  ...over,
});

const entrada = {
  tenantId: "org-1",
  leadId: "lead-1",
  jobId: "job-1",
  channelSessionId: "sess-1",
  conversationId: "conv-1",
  signal: "20:00",
  stickyAgentId: null,
  stickyIntent: null,
};

type Config = { agentId: string; pausedAt?: string | null; operationMode?: string };
const agenteDe = (out: { config: unknown }) => out.config as Config;

function deps(over: Record<string, unknown> = {}) {
  const carregarPorId = vi.fn(async (_db: unknown, _org: unknown, id: string) => ({ agentId: id, pausedAt: null }));
  const classifyIntent = vi.fn(async () => ({ intentName: null as string | null, confidence: 0.2 }));
  const funisAbertos = vi.fn(async () => new Set([FUNIL_CLINICAS]) as ReadonlySet<string> | null);
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    carregarPorId,
    classifyIntent,
    funisAbertos,
    log,
    deps: {
      log,
      agenteDaCampanha: vi.fn(async () => null),
      veioDeAnuncio: vi.fn(async () => true),
      funisAbertos,
      loadActiveRouter: vi.fn(async () => roteador()),
      loadPublishedAgentConfigById: carregarPorId,
      loadPublishedAgentConfig: vi.fn(async () => ({ agentId: "agent-da-sessao", pausedAt: null })),
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

const resolver = (d: ReturnType<typeof deps>, over: Partial<typeof entrada> | { signal: null } = {}) =>
  resolveTurnAgent({} as never, {} as never, { ...entrada, ...over }, d.deps);

describe("resolveTurnAgent: quem está num funil", () => {
  it("contato com negócio aberto no funil vai para o agente do funil, sem gastar o classificador", async () => {
    const d = deps();
    const out = await resolver(d);
    expect(out).toMatchObject({ outcome: "funil", routerId: null, intentName: null });
    expect(agenteDe(out).agentId).toBe(AGENTE_ANUNCIOS);
    expect(agenteDe(out).pausedAt).toBeNull();
    expect(d.classifyIntent).not.toHaveBeenCalled();
  });

  it("vale também no turno sem mensagem (follow-up), antes do sticky", async () => {
    const d = deps();
    const out = await resolver(d, { signal: null, stickyAgentId: AGENTE_SITE, stickyIntent: "site" } as never);
    expect(out.outcome).toBe("funil");
  });

  it("a campanha que criou a conversa continua acima do funil", async () => {
    const d = deps({ agenteDaCampanha: vi.fn(async () => "agent-da-campanha") });
    const out = await resolver(d);
    expect(out.outcome).toBe("campanha");
    expect(d.funisAbertos).not.toHaveBeenCalled();
  });

  it("roteador sem regra de funil nem consulta o funil, e segue como sempre", async () => {
    const d = deps({ loadActiveRouter: vi.fn(async () => roteador({ pipelineAgents: [] })) });
    const out = await resolver(d);
    expect(d.funisAbertos).not.toHaveBeenCalled();
    expect(out.outcome).toBe("fallback");
    expect(agenteDe(out).agentId).toBe(AGENTE_RESERVA);
  });

  it("contato fora do funil segue pelo assunto, com os outros agentes intactos", async () => {
    const d = deps({ funisAbertos: vi.fn(async () => new Set<string>()) });
    d.classifyIntent.mockResolvedValue({ intentName: "site", confidence: 0.95 });
    const out = await resolver(d);
    expect(out.outcome).toBe("classified");
    expect(agenteDe(out).agentId).toBe(AGENTE_SITE);
    expect(agenteDe(out).pausedAt).toBeNull();
  });

  it("agente do funil sem versão publicada: falha aberta, segue pela régua do número", async () => {
    const d = deps();
    d.carregarPorId.mockImplementation(async (_db: unknown, _org: unknown, id: string) =>
      id === AGENTE_ANUNCIOS ? (null as never) : { agentId: id, pausedAt: null },
    );
    const out = await resolver(d);
    expect(out.outcome).toBe("fallback");
    expect(agenteDe(out).agentId).toBe(AGENTE_RESERVA);
  });
});

describe("resolveTurnAgent: o agente do funil não atende quem está fora dele", () => {
  // O caso medido em produção em 09/10/2026: a reserva do roteador apontava para
  // o agente dos anúncios e ele respondeu a uma cliente antiga.
  it("reserva apontando para o agente do funil + contato fora: turno calado, nunca o genérico", async () => {
    const d = deps({
      funisAbertos: vi.fn(async () => new Set<string>()),
      loadActiveRouter: vi.fn(async () => roteador({ fallbackAgentId: AGENTE_ANUNCIOS })),
    });
    const out = await resolver(d);
    expect(out.config).not.toBeNull();
    expect(agenteDe(out).agentId).toBe(AGENTE_ANUNCIOS);
    expect(agenteDe(out).pausedAt).toEqual(expect.any(String));
    expect(agenteDe(out).operationMode).toBe("automatic");
    expect(d.log.info).toHaveBeenCalledWith(
      expect.stringContaining("contato está fora"),
      expect.objectContaining({ agentId: AGENTE_ANUNCIOS, funilConferido: true }),
    );
  });

  it("a mesma reserva atende normalmente quem ESTÁ no funil", async () => {
    const d = deps({ loadActiveRouter: vi.fn(async () => roteador({ fallbackAgentId: AGENTE_ANUNCIOS })) });
    const out = await resolver(d);
    expect(out.outcome).toBe("funil");
    expect(agenteDe(out).pausedAt).toBeNull();
  });

  it("intenção apontando para o agente do funil + contato fora: calado, e não começa fluxo", async () => {
    const d = deps({
      funisAbertos: vi.fn(async () => new Set([FUNIL_SITES])),
      loadActiveRouter: vi.fn(async () =>
        roteador({
          members: [
            {
              agentId: AGENTE_ANUNCIOS,
              intentName: "clinica",
              intentDescription: "é de clínica",
              examples: [],
              flowPointerId: "flow-1",
            },
          ],
        }),
      ),
    });
    d.classifyIntent.mockResolvedValue({ intentName: "clinica", confidence: 0.95 });
    const out = await resolver(d);
    expect(agenteDe(out).pausedAt).toEqual(expect.any(String));
    expect(out.flowPointerId).toBeNull();
  });

  it("follow-up (sem mensagem) que cairia na reserva restrita: calado", async () => {
    const d = deps({
      funisAbertos: vi.fn(async () => new Set<string>()),
      loadActiveRouter: vi.fn(async () => roteador({ fallbackAgentId: AGENTE_ANUNCIOS })),
    });
    const out = await resolver(d, { signal: null } as never);
    expect(agenteDe(out).pausedAt).toEqual(expect.any(String));
  });

  it("sem conseguir conferir o funil: não roteia por ele e o agente restrito não responde", async () => {
    const d = deps({
      funisAbertos: vi.fn(async () => null),
      loadActiveRouter: vi.fn(async () => roteador({ fallbackAgentId: AGENTE_ANUNCIOS })),
    });
    const out = await resolver(d);
    expect(out.outcome).not.toBe("funil");
    expect(agenteDe(out).pausedAt).toEqual(expect.any(String));
    expect(d.log.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ funilConferido: false }),
    );
  });

  it("origem de anúncio apontando para o agente do funil + contato fora: o degrau é pulado e o assunto decide", async () => {
    const veioDeAnuncio = vi.fn(async () => true);
    const d = deps({
      veioDeAnuncio,
      funisAbertos: vi.fn(async () => new Set<string>()),
      loadActiveRouter: vi.fn(async () => roteador({ adOriginAgentId: AGENTE_ANUNCIOS })),
    });
    d.classifyIntent.mockResolvedValue({ intentName: "site", confidence: 0.95 });
    const out = await resolver(d);
    expect(veioDeAnuncio).not.toHaveBeenCalled();
    expect(out.outcome).toBe("classified");
    expect(agenteDe(out).agentId).toBe(AGENTE_SITE);
  });

  it("origem de anúncio com agente SEM regra de funil continua valendo", async () => {
    const d = deps({
      funisAbertos: vi.fn(async () => new Set<string>()),
      loadActiveRouter: vi.fn(async () => roteador({ adOriginAgentId: AGENTE_SITE })),
    });
    const out = await resolver(d);
    expect(out.outcome).toBe("origem");
    expect(agenteDe(out).agentId).toBe(AGENTE_SITE);
  });

  it("erro inesperado depois de as regras serem lidas: o agente da sessão também passa pela trava", async () => {
    const d = deps({
      funisAbertos: vi.fn(async () => new Set<string>()),
      classifyIntent: vi.fn(async () => {
        throw new Error("classificador caiu feio");
      }),
      loadPublishedAgentConfig: vi.fn(async () => ({ agentId: AGENTE_ANUNCIOS, pausedAt: null })),
    });
    const out = await resolver(d);
    expect(out.outcome).toBe("classifier_failed");
    expect(agenteDe(out).agentId).toBe(AGENTE_ANUNCIOS);
    expect(agenteDe(out).pausedAt).toEqual(expect.any(String));
  });
});
