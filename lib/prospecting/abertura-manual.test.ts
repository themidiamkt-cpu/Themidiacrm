import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { agenteDaAberturaManual, agenteQueContinua } from "./abertura-manual";

const ORG = "6a085767-be5f-4d13-ac98-6dd1898f31c5";
const CONVERSA = "cc013661-ef39-45ee-ab42-0b0a88239a19";
const CAMPANHA = "34cffc96-a320-4f6f-9b49-ca98d457edce";
const AGENTE = "963a0f8d-e632-47c2-8f21-324615ec082f";

const manual = (over: Record<string, unknown> = {}) => ({
  mode: "manual_message",
  channel_session_id: "0a122aee-127d-4fdf-88c0-d2f5e6953b41",
  pipeline_id: "6426c178-e5dd-49b4-bd88-9cd95b1c2cc3",
  stage_id: "a73173d3-5e91-4948-8458-4d5d81fe626b",
  agent_id: AGENTE,
  base_message: "Oi! Encontrei a {{empresa}} no Google.",
  legal_basis_ref: "LIA 2026-10",
  ...over,
});

describe("agenteQueContinua", () => {
  it("abertura de abordagem manual com agente no ar: o agente continua", () => {
    expect(agenteQueContinua({ config: manual(), ultimaSaida: null, agenteNoAr: true })).toBe(
      AGENTE,
    );
  });
  it("da segunda mensagem em diante é uma pessoa atendendo", () => {
    expect(
      agenteQueContinua({
        config: manual(),
        ultimaSaida: "2026-10-06T19:28:09.509Z",
        agenteNoAr: true,
      }),
    ).toBeNull();
  });
  it("campanha sem agente, agente fora do ar ou campanha automática não devolvem", () => {
    expect(
      agenteQueContinua({
        config: manual({ agent_id: null }),
        ultimaSaida: null,
        agenteNoAr: true,
      }),
    ).toBeNull();
    expect(
      agenteQueContinua({ config: manual(), ultimaSaida: null, agenteNoAr: false }),
    ).toBeNull();
    expect(
      agenteQueContinua({
        config: { agent_id: AGENTE, instruction: "campanha automática" },
        ultimaSaida: null,
        agenteNoAr: true,
      }),
    ).toBeNull();
    expect(agenteQueContinua({ config: null, ultimaSaida: null, agenteNoAr: true })).toBeNull();
  });
});

/** Banco dublado: cada tabela devolve a linha combinada e anota os filtros que recebeu. */
function banco(linhas: Record<string, unknown>) {
  const consultas: { tabela: string; filtros: Record<string, unknown> }[] = [];
  const admin = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      consultas.push({ tabela, filtros });
      const cadeia = {
        select: () => cadeia,
        eq: (coluna: string, valor: unknown) => {
          filtros[coluna] = valor;
          return cadeia;
        },
        is: () => cadeia,
        not: () => cadeia,
        limit: () => cadeia,
        maybeSingle: async () => ({ data: linhas[tabela] ?? null, error: null }),
      };
      return cadeia;
    },
  } as unknown as SupabaseClient;
  return { admin, consultas };
}

describe("agenteDaAberturaManual", () => {
  const completo = {
    prospecting_candidates: { campaign_id: CAMPANHA },
    conversations: { last_outbound_at: null },
    prospecting_campaigns: { config: manual() },
    ai_agents: { id: AGENTE },
  };

  it("devolve o agente da campanha e filtra a organização em toda leitura", async () => {
    const { admin, consultas } = banco(completo);
    expect(await agenteDaAberturaManual(admin, ORG, CONVERSA)).toBe(AGENTE);
    expect(consultas.map((c) => c.tabela)).toEqual([
      "prospecting_candidates",
      "conversations",
      "prospecting_campaigns",
      "ai_agents",
    ]);
    for (const c of consultas) expect(c.filtros.organization_id, c.tabela).toBe(ORG);
  });

  it("conversa que não veio da prospecção para na primeira ida ao banco", async () => {
    const { admin, consultas } = banco({ ...completo, prospecting_candidates: null });
    expect(await agenteDaAberturaManual(admin, ORG, CONVERSA)).toBeNull();
    expect(consultas.map((c) => c.tabela)).toEqual(["prospecting_candidates", "conversations"]);
  });

  it("conversa que já teve saída não é abertura", async () => {
    const { admin, consultas } = banco({
      ...completo,
      conversations: { last_outbound_at: "2026-10-06T19:28:09.509Z" },
    });
    expect(await agenteDaAberturaManual(admin, ORG, CONVERSA)).toBeNull();
    expect(consultas).toHaveLength(2);
  });

  it("agente pausado ou despublicado: a conversa fica com quem enviou", async () => {
    const { admin } = banco({ ...completo, ai_agents: null });
    expect(await agenteDaAberturaManual(admin, ORG, CONVERSA)).toBeNull();
  });
});
