import { describe, expect, it } from "vitest";
import { abordagensPorFunil, aproveitarUltimaAbordagem } from "./ultima-abordagem-manual";

const CANAL = "0a122aee-127d-4fdf-88c0-d2f5e6953b41";
const FUNIL = "6426c178-e5dd-49b4-bd88-9cd95b1c2cc3";
const PRONTA = "a73173d3-5e91-4948-8458-4d5d81fe626b";
const ABORDADO = "fc2ff52f-9485-434b-b824-66874c3f4b2e";
const RESPONDEU = "19579e89-d8f1-43bf-a44c-ac865d55b119";
const AGENTE = "963a0f8d-e632-47c2-8f21-324615ec082f";

const manual = (over: Record<string, unknown> = {}) => ({
  mode: "manual_message",
  channel_session_id: CANAL,
  pipeline_id: FUNIL,
  stage_id: PRONTA,
  agent_id: AGENTE,
  sent_stage_id: ABORDADO,
  replied_stage_id: RESPONDEU,
  base_message: "Oi! Encontrei a {{empresa}} no Google.",
  personalize: true,
  only_without_site: true,
  legal_basis_ref: "LIA 2026-10",
  ...over,
});

const opcoes = {
  agents: [{ id: AGENTE }],
  channels: [{ id: CANAL, status: "WORKING" }],
  stages: [
    { id: PRONTA, pipeline_id: FUNIL },
    { id: ABORDADO, pipeline_id: FUNIL },
    { id: RESPONDEU, pipeline_id: FUNIL },
  ],
};

describe("aproveitarUltimaAbordagem", () => {
  it("devolve null quando a organização nunca fez abordagem manual", () => {
    expect(aproveitarUltimaAbordagem([], opcoes)).toBeNull();
    expect(
      aproveitarUltimaAbordagem(
        [{ config: null }, { config: { agent_id: AGENTE, instruction: "x" } }],
        opcoes,
      ),
    ).toBeNull();
  });

  it("usa a abordagem manual mais recente, pulando rascunho e campanha automática", () => {
    const config = aproveitarUltimaAbordagem(
      [
        { config: null },
        { config: { agent_id: AGENTE, instruction: "campanha automática" } },
        { config: manual({ base_message: "Mensagem que estou usando agora." }) },
        { config: manual({ base_message: "Mensagem antiga, de outra oferta." }) },
      ],
      opcoes,
    );
    expect(config).toEqual(manual({ base_message: "Mensagem que estou usando agora." }));
  });

  it("devolve em branco o que deixou de existir e mantém a mensagem", () => {
    const config = aproveitarUltimaAbordagem([{ config: manual() }], {
      agents: [],
      channels: [{ id: CANAL, status: "STOPPED" }],
      stages: [{ id: PRONTA, pipeline_id: FUNIL }],
    });
    expect(config).toEqual(
      manual({
        channel_session_id: "",
        agent_id: null,
        sent_stage_id: null,
        replied_stage_id: null,
      }),
    );
  });

  it("funil que sumiu leva junto as etapas", () => {
    const config = aproveitarUltimaAbordagem([{ config: manual() }], { ...opcoes, stages: [] });
    expect(config).toMatchObject({
      pipeline_id: "",
      stage_id: "",
      sent_stage_id: null,
      replied_stage_id: null,
      base_message: "Oi! Encontrei a {{empresa}} no Google.",
    });
  });

  it("configuração gravada antes das etapas opcionais existirem entra com os padrões", () => {
    const antiga = manual();
    delete (antiga as Record<string, unknown>).sent_stage_id;
    delete (antiga as Record<string, unknown>).replied_stage_id;
    delete (antiga as Record<string, unknown>).only_without_site;
    const config = aproveitarUltimaAbordagem([{ config: antiga }], opcoes);
    expect(config).toMatchObject({
      sent_stage_id: null,
      replied_stage_id: null,
      only_without_site: false,
      personalize: true,
    });
  });
});

describe("abordagensPorFunil", () => {
  const OUTRO_FUNIL = "ccaa55e2-9ab6-4436-8969-5bf7c871bd8e";
  const ETAPA_DO_OUTRO = "11111111-2222-4333-8444-555555555555";
  const doisFunis = {
    ...opcoes,
    stages: [...opcoes.stages, { id: ETAPA_DO_OUTRO, pipeline_id: OUTRO_FUNIL }],
  };
  const clinicas = (over: Record<string, unknown> = {}) =>
    manual({
      pipeline_id: OUTRO_FUNIL,
      stage_id: ETAPA_DO_OUTRO,
      sent_stage_id: null,
      replied_stage_id: null,
      agent_id: null,
      base_message: "Com quem eu falo sobre o marketing da clínica?",
      ...over,
    });

  it("devolve a mais recente de cada funil, da mais nova para a mais antiga", () => {
    const lista = abordagensPorFunil(
      [
        { config: null },
        { config: clinicas() },
        { config: manual({ base_message: "Site, a mais nova." }) },
        { config: clinicas({ base_message: "Clínicas, antiga." }) },
        { config: manual({ base_message: "Site, antiga." }) },
      ],
      doisFunis,
    );
    expect(lista.map((c) => c.base_message)).toEqual([
      "Com quem eu falo sobre o marketing da clínica?",
      "Site, a mais nova.",
    ]);
    expect(lista.map((c) => c.pipeline_id)).toEqual([OUTRO_FUNIL, FUNIL]);
  });

  it("deixa de fora a abordagem de um funil que não existe mais", () => {
    expect(abordagensPorFunil([{ config: clinicas() }, { config: manual() }], opcoes)).toEqual([
      manual(),
    ]);
  });

  it("sem abordagem manual, lista vazia", () => {
    expect(abordagensPorFunil([{ config: null }], opcoes)).toEqual([]);
  });
});
