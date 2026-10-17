import { describe, expect, it } from "vitest";

import { funilDeEntrada } from "./funil-atual";

const FUNIS = [
  { id: "a", is_default: false },
  { id: "b", is_default: true },
  { id: "c", is_default: false },
];

describe("funilDeEntrada", () => {
  it("usa o último funil aberto quando ele ainda existe", () => {
    expect(funilDeEntrada(FUNIS, "c")?.id).toBe("c");
  });
  it("cookie velho ou de outra organização cai no padrão", () => {
    expect(funilDeEntrada(FUNIS, "zzz")?.id).toBe("b");
    expect(funilDeEntrada(FUNIS, null)?.id).toBe("b");
    expect(funilDeEntrada(FUNIS, undefined)?.id).toBe("b");
  });
  it("sem padrão, o primeiro", () => {
    expect(funilDeEntrada([{ id: "x" }, { id: "y" }], null)?.id).toBe("x");
  });
  it("sem funis, nenhum (a lista de gerenciar segue disponível para criar o primeiro)", () => {
    expect(funilDeEntrada([], "a")).toBeNull();
  });
});
