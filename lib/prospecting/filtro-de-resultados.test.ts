import { describe, expect, it } from "vitest";
import { filtrarResultados } from "./filtro-de-resultados";

const linha = (id: string, progress: string, website: string | null) => ({
  id,
  progress,
  data: { website },
});

const campanha = [
  linha("a", "manual_ready", null),
  linha("b", "manual_ready", "https://www.empresa-b.com.br/"),
  linha("c", "sent", "https://www.instagram.com/empresa-c"),
  linha("d", "sent", null),
  linha("e", "replied", null),
  linha("f", "skipped", "https://www.empresa-f.com.br/"),
];

describe("filtrarResultados", () => {
  it("sem filtro, mostra tudo e conta cada botão sobre a campanha inteira", () => {
    const r = filtrarResultados(campanha, "all", null);
    expect(r.visiveis.map((l) => l.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(r).toMatchObject({ total: 6, semSite: 4, comSite: 2 });
    expect(r.andamentos).toEqual([
      { valor: "manual_ready", quantas: 2 },
      { valor: "sent", quantas: 2 },
      { valor: "replied", quantas: 1 },
      { valor: "skipped", quantas: 1 },
    ]);
  });

  it("os dois filtros se combinam", () => {
    const r = filtrarResultados(campanha, "without_site", "sent");
    expect(r.visiveis.map((l) => l.id)).toEqual(["c", "d"]);
  });

  it("a contagem de um grupo respeita o filtro do outro e ignora o próprio", () => {
    const r = filtrarResultados(campanha, "without_site", "manual_ready");
    // Site: contado dentro de "Mensagem pronta" (a sem site, b com site).
    expect(r).toMatchObject({ total: 6, semSite: 1, comSite: 1 });
    // Andamento: contado dentro de "Sem site próprio" (a, c, d, e).
    expect(r.andamentos).toEqual([
      { valor: "manual_ready", quantas: 1 },
      { valor: "sent", quantas: 2 },
      { valor: "replied", quantas: 1 },
      { valor: "skipped", quantas: 0 },
    ]);
    expect(r.visiveis.map((l) => l.id)).toEqual(["a"]);
  });

  it("o botão de um andamento não some quando o outro filtro zera a contagem dele", () => {
    const r = filtrarResultados(campanha, "with_site", null);
    expect(r.andamentos.map((a) => a.valor)).toEqual([
      "manual_ready",
      "sent",
      "replied",
      "skipped",
    ]);
    expect(r.andamentos.find((a) => a.valor === "replied")?.quantas).toBe(0);
  });

  it("andamento que a ordem não conhece vai para o fim, sem sumir", () => {
    const r = filtrarResultados(
      [linha("x", "andamento_novo", null), linha("y", "sent", null)],
      "all",
      null,
    );
    expect(r.andamentos.map((a) => a.valor)).toEqual(["sent", "andamento_novo"]);
  });
});
