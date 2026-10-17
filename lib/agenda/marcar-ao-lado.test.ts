import { describe, it, expect } from "vitest";

import { ehEtapaDeDiagnosticoMarcado, urlDaMarcacao } from "./marcar-ao-lado";

describe("ehEtapaDeDiagnosticoMarcado", () => {
  it.each(["Diagnóstico marcado", "diagnostico marcado", "DIAGNÓSTICO AGENDADO", "Diagnóstico Marcado ✅"])(
    "reconhece %s",
    (nome) => expect(ehEtapaDeDiagnosticoMarcado(nome)).toBe(true),
  );

  it.each(["Diagnóstico curto", "Marcado", "Abordada", "Mensagem pronta", "Diagnóstico feito", "", null, undefined])(
    "ignora %s",
    (nome) => expect(ehEtapaDeDiagnosticoMarcado(nome)).toBe(false),
  );
});

describe("urlDaMarcacao", () => {
  it("leva o contato e a conversa quando há", () => {
    expect(urlDaMarcacao("c1", "v1")).toBe("/app/agenda?contato=c1&conversa=v1");
  });
  it("sem conversa leva só o contato", () => {
    expect(urlDaMarcacao("c1")).toBe("/app/agenda?contato=c1");
    expect(urlDaMarcacao("c1", null)).toBe("/app/agenda?contato=c1");
  });
});
