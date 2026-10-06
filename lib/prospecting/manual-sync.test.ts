import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/v1/leads/_handler", () => ({ moveLeadHandler: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { decidirEtapa, resolverEtapasDaAbordagem, type EtapaDoFunil } from "./manual-sync";

const etapa = (id: string, over: Partial<EtapaDoFunil> = {}): EtapaDoFunil => ({
  id,
  is_won: false,
  is_lost: false,
  agent_stage_hint: null,
  ...over,
});

// O funil de sites: Mensagem pronta → Abordado → Respondeu → Prévia → Proposta → Pagou → No ar → Não fechou
const FUNIL_SITES = [
  etapa("pronta"),
  etapa("abordado"),
  etapa("respondeu", { agent_stage_hint: "contacted" }),
  etapa("previa"),
  etapa("proposta", { agent_stage_hint: "negotiating" }),
  etapa("pagou", { is_won: true }),
  etapa("no-ar"),
  etapa("nao-fechou", { is_lost: true, agent_stage_hint: "lost" }),
];

describe("resolverEtapasDaAbordagem", () => {
  it("sem nada na configuração: abordado é a etapa seguinte, respondeu é a do passo contacted", () => {
    expect(resolverEtapasDaAbordagem(FUNIL_SITES, { stage_id: "pronta" })).toEqual({
      inicial: "pronta",
      abordado: "abordado",
      respondeu: "respondeu",
    });
  });
  it("a configuração manda quando aponta etapa aberta do funil", () => {
    expect(
      resolverEtapasDaAbordagem(FUNIL_SITES, {
        stage_id: "pronta",
        sent_stage_id: "previa",
        replied_stage_id: "proposta",
      }),
    ).toEqual({ inicial: "pronta", abordado: "previa", respondeu: "proposta" });
  });
  it("quando a etapa seguinte já é a de resposta, não inventa um 'abordado'", () => {
    const funil = [
      etapa("chegou"),
      etapa("ja-respondi", { agent_stage_hint: "contacted" }),
      etapa("x"),
    ];
    expect(resolverEtapasDaAbordagem(funil, { stage_id: "chegou" })).toEqual({
      inicial: "chegou",
      abordado: null,
      respondeu: "ja-respondi",
    });
  });
  it("não usa como 'abordado' a etapa de qualificados da campanha automática, nem etapa de ganho/perda", () => {
    const funil = [etapa("entrada"), etapa("qualificados"), etapa("ganhou", { is_won: true })];
    expect(
      resolverEtapasDaAbordagem(funil, { stage_id: "entrada", qualified_stage_id: "qualificados" }),
    ).toEqual({ inicial: "entrada", abordado: null, respondeu: null });
    expect(
      resolverEtapasDaAbordagem([etapa("a"), etapa("fim", { is_lost: true })], { stage_id: "a" }),
    ).toEqual({
      inicial: "a",
      abordado: null,
      respondeu: null,
    });
  });
  it("etapa inicial que não existe mais no funil: nada se resolve por posição", () => {
    expect(resolverEtapasDaAbordagem(FUNIL_SITES, { stage_id: "apagada" }).abordado).toBeNull();
  });
});

describe("decidirEtapa", () => {
  const etapas = { inicial: "pronta", abordado: "abordado", respondeu: "respondeu" };
  it("enviou e ainda está na inicial → abordado", () => {
    expect(decidirEtapa({ etapaAtual: "pronta", etapas, enviou: true, respondeu: false })).toBe(
      "abordado",
    );
  });
  it("respondeu → respondeu, saindo da inicial ou de abordado", () => {
    expect(decidirEtapa({ etapaAtual: "pronta", etapas, enviou: true, respondeu: true })).toBe(
      "respondeu",
    );
    expect(decidirEtapa({ etapaAtual: "abordado", etapas, enviou: true, respondeu: true })).toBe(
      "respondeu",
    );
  });
  it("nunca volta e nunca mexe em cartão que alguém já levou adiante", () => {
    expect(
      decidirEtapa({ etapaAtual: "respondeu", etapas, enviou: true, respondeu: true }),
    ).toBeNull();
    expect(
      decidirEtapa({ etapaAtual: "previa", etapas, enviou: true, respondeu: true }),
    ).toBeNull();
    expect(
      decidirEtapa({ etapaAtual: "abordado", etapas, enviou: true, respondeu: false }),
    ).toBeNull();
  });
  it("sem etapa de destino resolvida, fica onde está", () => {
    const semNada = { inicial: "pronta", abordado: null, respondeu: null };
    expect(
      decidirEtapa({ etapaAtual: "pronta", etapas: semNada, enviou: true, respondeu: true }),
    ).toBeNull();
  });
});
