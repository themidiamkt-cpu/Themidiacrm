import { describe, expect, it, vi } from "vitest";

// O módulo importa a camada de modelo só para o redator de produção; os casos
// daqui exercitam as regras puras e um redator dublê.
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({ runModelCall: vi.fn() }));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({ llmEdgeConfigFromEnv: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: {} }));

import {
  bairroDoEndereco,
  limparRedacao,
  mensagemPorMarcadores,
  nomeCurto,
  redigirMensagens,
  temSiteProprio,
} from "./manual-message";
import {
  isManualMessageConfig,
  manualMessageConfigSchema,
  prospectingInputSchema,
  type Prospect,
} from "./schema";

const empresa = (over: Partial<Prospect> = {}): Prospect => ({
  key: "place-1",
  name: "Tec-Lub 4 Irmãos | Troca de óleo em Barão Geraldo",
  phone: "+5519999990000",
  website: null,
  category: "Serviço de troca de óleo",
  address: "R. Uirapuru, 10 - Jardim São Gonçalo, Campinas - SP, 13082-706, Brasil",
  maps_url: null,
  rating: 4.9,
  reviews: 179,
  emails: [],
  socials: [],
  ...over,
});

describe("temSiteProprio", () => {
  it("rede social, link de WhatsApp e campo vazio não são site próprio", () => {
    for (const url of [
      null,
      "",
      "https://www.instagram.com/empresa",
      "http://instagram.com/empresa?igshid=1",
      "https://m.facebook.com/Empresa-123/",
      "https://wa.me/5519999990000",
      "https://l.instagram.com/?u=https%3A%2F%2Fwa.me%2Fmessage",
      "https://linktr.ee/empresa",
      "https://mail.google.com/mail/u/0/#inbox",
      "https://x.com/empresa",
      "https://g.page/r/empresa",
      "https://empresa.business.site/",
      "https://maps.app.goo.gl/abc123",
      "https://www.facebook.com.br/empresa",
      "isto não é url",
    ])
      expect(temSiteProprio(url), String(url)).toBe(false);
  });
  it("domínio da empresa é site próprio, inclusive construtor gratuito", () => {
    for (const url of [
      "http://www.friocamp.com.br/",
      "https://harmonyclinicsp.com.br/",
      "https://servclim.wixsite.com/servclim",
      "https://sites.google.com/view/vetjp/inicio",
      "https://www.xpto.com.br/",
      "https://waldir-ar.com.br/",
    ])
      expect(temSiteProprio(url), url).toBe(true);
  });
});

describe("nomeCurto e bairroDoEndereco", () => {
  it("tira slogan e lista de serviços grudados no nome", () => {
    expect(nomeCurto("Tec-Lub 4 Irmãos | Troca de óleo em Barão Geraldo")).toBe("Tec-Lub 4 Irmãos");
    expect(nomeCurto("Meu Momento - Clínica de Estética na República - SP")).toBe("Meu Momento");
    expect(nomeCurto("Clínica Aline Miranda: Cursos - Cílios")).toBe("Clínica Aline Miranda");
    expect(nomeCurto("Kest Estética")).toBe("Kest Estética");
  });
  it("lê o bairro do endereço do Maps e devolve null quando não há", () => {
    expect(bairroDoEndereco(empresa().address)).toBe("Jardim São Gonçalo");
    expect(bairroDoEndereco("Campinas")).toBeNull();
    expect(bairroDoEndereco(null)).toBeNull();
  });
});

describe("mensagemPorMarcadores", () => {
  it("troca os marcadores pelos dados e some com o que não existe", () => {
    const texto = mensagemPorMarcadores(
      "Oi! Encontrei a {{empresa}} no Google, nota {{nota}} com {{ avaliacoes }} avaliações em {{bairro}}. {{desconhecido}}",
      empresa(),
    );
    expect(texto).toBe(
      "Oi! Encontrei a Tec-Lub 4 Irmãos no Google, nota 4,9 com 179 avaliações em Jardim São Gonçalo.",
    );
  });
});

describe("limparRedacao", () => {
  it("tira aspas, negrito e travessão que o modelo devolve em volta do texto", () => {
    expect(limparRedacao('"Oi! Vi a **Kest** — tudo bem?"')).toBe("Oi! Vi a Kest, tudo bem?");
  });
});

describe("redigirMensagens", () => {
  const lista = [
    { id: "a", data: empresa() },
    { id: "b", data: empresa({ key: "place-2", name: "Kest Estética" }) },
    { id: "c", data: empresa({ key: "place-3", name: "Elite Ar" }) },
  ];
  it("toda empresa sai com texto; falha e resposta vazia da IA caem na mensagem base", async () => {
    const redator = vi.fn(async (_base: string, p: Prospect) => {
      if (p.name === "Kest Estética") throw new Error("provedor fora do ar");
      if (p.name === "Elite Ar") return "   ";
      return "Oi! Encontrei a Tec-Lub no Google. Posso te mandar uma ideia?";
    });
    const { textos, comIa } = await redigirMensagens(lista, "Oi, {{empresa}}! Tudo bem?", redator);
    expect(comIa).toBe(1);
    expect(textos.get("a")).toBe("Oi! Encontrei a Tec-Lub no Google. Posso te mandar uma ideia?");
    expect(textos.get("b")).toBe("Oi, Kest Estética! Tudo bem?");
    expect(textos.get("c")).toBe("Oi, Elite Ar! Tudo bem?");
  });
  it("sem redator, usa só os marcadores e não chama modelo nenhum", async () => {
    const { textos, comIa } = await redigirMensagens(lista, "Oi, {{empresa}}!", null);
    expect(comIa).toBe(0);
    expect([...textos.values()]).toEqual([
      "Oi, Tec-Lub 4 Irmãos!",
      "Oi, Kest Estética!",
      "Oi, Elite Ar!",
    ]);
  });
  it("resposta da IA que devolve marcador cru é descartada", async () => {
    const { textos, comIa } = await redigirMensagens(
      [lista[1]!],
      "Oi, {{empresa}}! Tudo bem?",
      async () => "Oi, {{empresa}}! Tudo certo por aí?",
    );
    expect(comIa).toBe(0);
    expect(textos.get("b")).toBe("Oi, Kest Estética! Tudo bem?");
  });
});

describe("configuração da abordagem manual", () => {
  const base = {
    mode: "manual_message" as const,
    channel_session_id: "0a122aee-127d-4fdf-88c0-d2f5e6953b41",
    pipeline_id: "6426c178-e5dd-49b4-bd88-9cd95b1c2cc3",
    stage_id: "a73173d3-5e91-4948-8458-4d5d81fe626b",
    base_message: "Oi! Encontrei a {{empresa}} no Google.",
    legal_basis_ref: "LIA 2026-10",
  };
  it("aplica os padrões e reconhece o modo", () => {
    const config = manualMessageConfigSchema.parse(base);
    expect(config).toMatchObject({ agent_id: null, personalize: true, only_without_site: false });
    expect(isManualMessageConfig(config)).toBe(true);
    expect(isManualMessageConfig({ agent_id: "x", instruction: "y" })).toBe(false);
    expect(isManualMessageConfig(null)).toBe(false);
  });
  it("a ação prepare_manual recusa a configuração da campanha automática", () => {
    const id = "34cffc96-a320-4f6f-9b49-ca98d457edce";
    expect(
      prospectingInputSchema.safeParse({ action: "prepare_manual", id, config: base }).success,
    ).toBe(true);
    expect(
      prospectingInputSchema.safeParse({
        action: "prepare_manual",
        id,
        config: { ...base, mode: undefined, daily_limit: 10 },
      }).success,
    ).toBe(false);
    // E o inverso: a campanha automática não aceita a configuração manual.
    expect(prospectingInputSchema.safeParse({ action: "start", id, config: base }).success).toBe(
      false,
    );
  });
});
