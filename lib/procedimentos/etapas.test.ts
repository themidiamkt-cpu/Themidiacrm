import { describe, expect, it } from "vitest";

import { acharEtapaPosVenda, ehEtapaDeFechamento } from "./etapas";

const e = (name: string, extra: Record<string, unknown> = {}) => ({ id: name, name, pipeline_id: "f1", ...extra });

describe("ehEtapaDeFechamento", () => {
  it("reconhece o fechamento da clínica", () => {
    expect(ehEtapaDeFechamento({ name: "Fechou procedimento", is_won: true })).toBe(true);
    expect(ehEtapaDeFechamento({ name: "Fechado" })).toBe(true);
    expect(ehEtapaDeFechamento({ name: "Qualquer nome", is_won: true })).toBe(true);
  });
  it("não conta perda nem 'não fechou'", () => {
    expect(ehEtapaDeFechamento({ name: "Não fechou", is_lost: true })).toBe(false);
    expect(ehEtapaDeFechamento({ name: "Não fechou" })).toBe(false);
    expect(ehEtapaDeFechamento({ name: "Perdido", is_lost: true })).toBe(false);
    expect(ehEtapaDeFechamento({ name: "Fechando valor e plano" })).toBe(false);
    expect(ehEtapaDeFechamento({ name: "Compareceu" })).toBe(false);
  });
});

describe("acharEtapaPosVenda", () => {
  it("acha a etapa do mesmo funil, com ou sem acento e hífen", () => {
    expect(acharEtapaPosVenda([e("Compareceu"), e("Pós-venda")], "f1")?.name).toBe("Pós-venda");
    expect(acharEtapaPosVenda([e("Pos venda")], "f1")?.name).toBe("Pos venda");
    expect(acharEtapaPosVenda([e("Posvenda")], "f1")?.name).toBe("Posvenda");
  });
  it("ignora arquivada e etapa de outro funil", () => {
    expect(acharEtapaPosVenda([e("Pós-venda", { is_archived: true })], "f1")).toBeNull();
    expect(acharEtapaPosVenda([{ id: "x", name: "Pós-venda", pipeline_id: "f2" }], "f1")).toBeNull();
  });
  it("sem pós-venda devolve null", () => {
    expect(acharEtapaPosVenda([e("Compareceu")], "f1")).toBeNull();
  });
});
