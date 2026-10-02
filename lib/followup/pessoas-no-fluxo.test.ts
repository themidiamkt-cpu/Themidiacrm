import { describe, expect, it } from "vitest";

import { agruparPessoasNoFluxo, type LinhaDeEnrollment } from "./pessoas-no-fluxo";

const linha = (over: Partial<LinhaDeEnrollment>): LinhaDeEnrollment => ({
  id: "e1",
  contact_id: "c1",
  contact_name: "Camila",
  status: "waiting_reply",
  current_node_id: "resposta-1",
  proxima_acao_em: null,
  updated_at: "2026-10-01T10:00:00.000Z",
  outcome: null,
  ...over,
});

describe("agruparPessoasNoFluxo", () => {
  it("separa quem está no passo de quem saiu por ele, e soma os totais", () => {
    const r = agruparPessoasNoFluxo([
      linha({ id: "e1", status: "waiting_reply", current_node_id: "resposta-1" }),
      linha({ id: "e2", status: "active", current_node_id: "espera-1", contact_name: "Jorge" }),
      linha({ id: "e3", status: "paused_manual", current_node_id: "resposta-1" }),
      linha({ id: "e4", status: "completed", current_node_id: "fim-marcou", outcome: "converted" }),
      linha({ id: "e5", status: "dead", current_node_id: "resposta-1" }),
    ]);
    expect(r.total_vivos).toBe(3);
    expect(r.total_encerrados).toBe(2);
    expect(r.passos["resposta-1"]!.vivos.map((p) => p.enrollment_id)).toEqual(["e1", "e3"]);
    expect(r.passos["resposta-1"]!.encerrados.map((p) => p.enrollment_id)).toEqual(["e5"]);
    expect(r.passos["espera-1"]!.vivos[0]!.contact.name).toBe("Jorge");
    expect(r.passos["fim-marcou"]!.vivos).toEqual([]);
    expect(r.passos["fim-marcou"]!.encerrados[0]!.outcome).toBe("converted");
  });

  it("passo sem ninguém não aparece, e lista vazia devolve zeros", () => {
    const r = agruparPessoasNoFluxo([]);
    expect(r).toEqual({ passos: {}, total_vivos: 0, total_encerrados: 0 });
  });

  it("ordena: no passo, quem espera há mais tempo primeiro; encerrados, o mais recente primeiro", () => {
    const r = agruparPessoasNoFluxo([
      linha({ id: "novo", updated_at: "2026-10-02T10:00:00.000Z" }),
      linha({ id: "antigo", updated_at: "2026-09-30T10:00:00.000Z" }),
      linha({ id: "fim-velho", status: "completed", updated_at: "2026-09-20T10:00:00.000Z" }),
      linha({ id: "fim-novo", status: "cancelled", updated_at: "2026-10-01T10:00:00.000Z" }),
    ]);
    expect(r.passos["resposta-1"]!.vivos.map((p) => p.enrollment_id)).toEqual(["antigo", "novo"]);
    expect(r.passos["resposta-1"]!.encerrados.map((p) => p.enrollment_id)).toEqual([
      "fim-novo",
      "fim-velho",
    ]);
  });

  it("estado desconhecido conta como encerrado, nunca como gente esperando", () => {
    const r = agruparPessoasNoFluxo([linha({ status: "estado_novo" })]);
    expect(r.total_vivos).toBe(0);
    expect(r.total_encerrados).toBe(1);
  });
});
