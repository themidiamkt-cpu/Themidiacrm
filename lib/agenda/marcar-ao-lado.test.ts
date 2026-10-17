import { describe, it, expect } from "vitest";

import { ehEtapaDeAgendamento, urlDaMarcacao } from "./marcar-ao-lado";

describe("ehEtapaDeAgendamento", () => {
  it.each([
    "Agendado",
    "agendada",
    "Diagnóstico marcado",
    "DIAGNÓSTICO AGENDADO",
    "Consulta marcada ✅",
    "Avaliação Agendada",
  ])("reconhece %s", (nome) => expect(ehEtapaDeAgendamento(nome)).toBe(true));

  it.each([
    "Não agendado",
    "Desmarcado",
    "Cancelado",
    "Faltou",
    "Reagendar",
    "Contato feito",
    "Compareceu",
    "Fechou procedimento",
    "Diagnóstico curto",
    "Mensagem pronta",
    "Agendamento",
    "",
    null,
    undefined,
  ])("ignora %s", (nome) => expect(ehEtapaDeAgendamento(nome)).toBe(false));
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
