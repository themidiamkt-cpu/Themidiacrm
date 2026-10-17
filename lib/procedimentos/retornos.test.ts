import { describe, expect, it } from "vitest";

import { resumirRetornos, type LinhaDoRetorno } from "./retornos";

function linha(over: Partial<LinhaDoRetorno>): LinhaDoRetorno {
  return {
    id: "l",
    lead_id: "lead",
    contact_id: "c1",
    procedimento_id: "p1",
    nome: "Botox",
    realizado_em: "2026-04-15",
    vence_em: "2026-10-15",
    lembrete_enviado_em: null,
    lembrete_resultado: null,
    contacts: { name: "Maria Silva", display_name: null, phone_number: "+5519" },
    crm_leads: { title: "Maria" },
    ...over,
  };
}

describe("resumirRetornos", () => {
  const catalogo = [
    { id: "p1", nome: "Botox", meses_validade: 6, ativo: true },
    { id: "p2", nome: "Peeling", meses_validade: 3, ativo: false },
  ];

  it("conta quem aguarda e acha o próximo vencimento por procedimento", () => {
    const r = resumirRetornos({
      catalogo,
      pendentes: [
        linha({ id: "a", vence_em: "2026-12-01" }),
        linha({ id: "b", vence_em: "2026-11-05" }),
        linha({ id: "c", procedimento_id: "p2", nome: "Peeling", vence_em: "2027-01-01" }),
      ],
      recentes: [],
    });
    const botox = r.procedimentos.find((p) => p.id === "p1")!;
    expect(botox.aguardando).toBe(2);
    expect(botox.proximo_vencimento).toBe("2026-11-05");
    expect(r.procedimentos.find((p) => p.id === "p2")!.aguardando).toBe(1);
  });

  it("conta enviados dos últimos 30 dias só do próprio procedimento", () => {
    const r = resumirRetornos({
      catalogo,
      pendentes: [],
      recentes: [
        linha({ id: "x", lembrete_resultado: "enviado", lembrete_enviado_em: "2026-10-10T12:00:00Z" }),
        linha({ id: "y", lembrete_resultado: "expirado" }),
        linha({ id: "z", procedimento_id: "p2", lembrete_resultado: "enviado" }),
      ],
    });
    expect(r.procedimentos.find((p) => p.id === "p1")!.enviados_30d).toBe(1);
    expect(r.procedimentos.find((p) => p.id === "p2")!.enviados_30d).toBe(1);
  });

  it("a fila traz o paciente pelo nome, com fallback para o título do negócio", () => {
    const r = resumirRetornos({
      catalogo,
      pendentes: [
        linha({ id: "a" }),
        linha({ id: "b", contacts: null, crm_leads: { title: "Lead sem contato" } }),
      ],
      recentes: [linha({ id: "c", lembrete_resultado: "expirado" })],
    });
    expect(r.fila.map((i) => [i.id, i.estado])).toEqual([
      ["a", "aguardando"],
      ["b", "aguardando"],
      ["c", "expirado"],
    ]);
    expect(r.fila[0]!.paciente).toBe("Maria Silva");
    expect(r.fila[0]).toMatchObject({ contact_id: "c1", procedimento_id: "p1" });
    expect(r.fila[1]!.paciente).toBe("Lead sem contato");
  });

  it("aceita embed em array (como o PostgREST às vezes devolve)", () => {
    const r = resumirRetornos({
      catalogo,
      pendentes: [linha({ contacts: [{ name: "Ana", display_name: null, phone_number: null }] as never })],
      recentes: [],
    });
    expect(r.fila[0]!.paciente).toBe("Ana");
  });

  it("quem já venceu e ainda não saiu vira 'aguardando_envio' (e quem vence depois segue 'aguardando')", () => {
    const r = resumirRetornos(
      {
        catalogo,
        pendentes: [
          linha({ id: "a", vence_em: "2026-10-16" }),
          linha({ id: "b", vence_em: "2026-10-17" }),
          linha({ id: "c", vence_em: "2026-10-18" }),
        ],
        recentes: [],
      },
      "2026-10-17",
    );
    expect(r.fila.map((i) => [i.id, i.estado])).toEqual([
      ["a", "aguardando_envio"],
      ["b", "aguardando_envio"],
      ["c", "aguardando"],
    ]);
  });
});
