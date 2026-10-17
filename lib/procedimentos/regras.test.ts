import { describe, it, expect } from "vitest";

import {
  DIAS_DE_TOLERANCIA,
  diasEntre,
  ehDataISO,
  estadoDoVencimento,
  hojeNoFuso,
  montarMensagem,
  somarMeses,
  venceEm,
} from "./regras";

describe("somarMeses", () => {
  it("soma meses simples", () => {
    expect(somarMeses("2026-04-15", 6)).toBe("2026-10-15");
    expect(somarMeses("2026-10-16", 1)).toBe("2026-11-16");
  });
  it("vira o ano", () => {
    expect(somarMeses("2026-11-20", 3)).toBe("2027-02-20");
    expect(somarMeses("2026-12-31", 12)).toBe("2027-12-31");
  });
  it("não estoura o fim do mês", () => {
    expect(somarMeses("2026-08-31", 6)).toBe("2027-02-28");
    expect(somarMeses("2027-08-31", 6)).toBe("2028-02-29"); // bissexto
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("recusa data inválida", () => {
    expect(() => somarMeses("2026-02-30", 1)).toThrow();
    expect(() => somarMeses("15/04/2026", 1)).toThrow();
  });
});

describe("venceEm / ehDataISO", () => {
  it("botox a cada 6 meses", () => {
    expect(venceEm("2026-04-15", 6)).toBe("2026-10-15");
  });
  it("valida o formato", () => {
    expect(ehDataISO("2026-10-16")).toBe(true);
    expect(ehDataISO("2026-13-01")).toBe(false);
    expect(ehDataISO("2026-2-1")).toBe(false);
  });
});

describe("estadoDoVencimento", () => {
  it("antes do dia: ainda não", () => {
    expect(estadoDoVencimento("2026-10-16", "2026-10-15")).toBe("ainda_nao");
  });
  it("no dia e até a tolerância: no prazo", () => {
    expect(estadoDoVencimento("2026-10-16", "2026-10-16")).toBe("no_prazo");
    expect(estadoDoVencimento("2026-10-16", `2026-10-${16 + DIAS_DE_TOLERANCIA}`)).toBe("no_prazo");
  });
  it("passou da tolerância: expirado (não manda mensagem velha)", () => {
    expect(estadoDoVencimento("2026-10-16", `2026-10-${16 + DIAS_DE_TOLERANCIA + 1}`)).toBe("expirado");
    expect(estadoDoVencimento("2024-01-01", "2026-10-16")).toBe("expirado");
  });
  it("diasEntre conta dias civis", () => {
    expect(diasEntre("2026-10-16", "2026-10-15")).toBe(1);
    expect(diasEntre("2026-03-01", "2026-02-28")).toBe(1);
  });
});

describe("hojeNoFuso", () => {
  it("usa o dia do fuso, não o do UTC", () => {
    const quase3AmUtc = new Date("2026-10-16T02:30:00Z"); // ainda 15/10 à noite em São Paulo
    expect(hojeNoFuso("America/Sao_Paulo", quase3AmUtc)).toBe("2026-10-15");
    expect(hojeNoFuso("UTC", quase3AmUtc)).toBe("2026-10-16");
  });
  it("fuso inválido cai em São Paulo", () => {
    expect(hojeNoFuso("Nao/Existe", new Date("2026-10-16T15:00:00Z"))).toBe("2026-10-16");
  });
});

describe("montarMensagem", () => {
  const modelo = "Oi {nome}! Faz 6 meses do seu {procedimento}. Vamos renovar?";
  it("troca as variáveis e usa o primeiro nome", () => {
    expect(montarMensagem(modelo, { nome: "Maria da Silva", procedimento: "botox" })).toBe(
      "Oi Maria! Faz 6 meses do seu botox. Vamos renovar?",
    );
  });
  it("sem nome, arruma a pontuação", () => {
    expect(montarMensagem("Oi {nome}, tudo bem?", { nome: null, procedimento: "botox" })).toBe(
      "Oi, tudo bem?",
    );
  });
  it("aceita espaços dentro da chave", () => {
    expect(montarMensagem("{ nome }: {procedimento}", { nome: "Ana", procedimento: "peeling" })).toBe(
      "Ana: peeling",
    );
  });
});
