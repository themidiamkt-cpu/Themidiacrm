import { describe, expect, it } from "vitest";

import { empresaDoNome, interpolarContato, nomeCurto } from "./empresa-do-nome";

// Nomes reais de perfis de clínica que entraram na prospecção.
const REAIS: [string, string | null][] = [
  ["Bauck Centro De Estética Avançada", "Bauck Centro De Estética Avançada"],
  ["Dra Jenifer Montalbo - Farmacêutica Esteta - Harmonização facial e corporal - Valinhos", "Dra Jenifer Montalbo"],
  ["Nova Mulher Clínica de Estética", "Nova Mulher Clínica de Estética"],
  ["Clínica Elleve - Estética e Bem Estar", "Clínica Elleve"],
  ["Perfect Laser By Liliá Ribeiro - Estética & Spa", "Perfect Laser By Liliá Ribeiro"],
  ["Clinica de Estética Drena estética avançada || Pós operatório || Valinhos", "Clinica de Estética Drena estética avançada"],
  ["Dra. Graziela Silva - Biomédica Esteta", "Dra. Graziela Silva"],
  [
    "Dra Natália Rocha | Harmonização Facial e Estética Íntima, Preenchimento, Bioestimulador, Botox, Fios de PDO.",
    "Dra Natália Rocha",
  ],
];

describe("empresaDoNome", () => {
  it.each(REAIS)("%s", (entrada, esperado) => {
    expect(empresaDoNome(entrada)).toBe(esperado);
  });

  it("nome vazio ou só espaço não vira texto", () => {
    expect(empresaDoNome("")).toBeNull();
    expect(empresaDoNome("   ")).toBeNull();
    expect(empresaDoNome(null)).toBeNull();
    expect(empresaDoNome(undefined)).toBeNull();
  });

  it("nome que continua bio depois do corte não vale", () => {
    const bio = "Harmonização facial, preenchimento labial, bioestimulador de colágeno e fios de PDO em Campinas";
    expect(empresaDoNome(bio)).toBeNull();
  });
});

describe("nomeCurto (mesma regra da prospecção)", () => {
  it("mantém os casos que já existiam", () => {
    expect(nomeCurto("Tec-Lub 4 Irmãos | Troca de óleo em Barão Geraldo")).toBe("Tec-Lub 4 Irmãos");
    expect(nomeCurto("Meu Momento - Clínica de Estética na República - SP")).toBe("Meu Momento");
    expect(nomeCurto("Clínica Aline Miranda: Cursos - Cílios")).toBe("Clínica Aline Miranda");
  });
});

describe("interpolarContato", () => {
  const base = "Encontramos a {{empresa}}. Oi, {{primeiro_nome}}! ({{nome}})";

  it("troca as três marcações", () => {
    const r = interpolarContato(base, "Dra Natália Rocha | Harmonização Facial");
    expect(r.faltando).toEqual([]);
    expect(r.texto).toBe(
      "Encontramos a Dra Natália Rocha. Oi, Dra! (Dra Natália Rocha | Harmonização Facial)",
    );
  });

  it("sem nome nenhuma marcação é trocada e todas voltam em faltando", () => {
    const r = interpolarContato(base, null);
    expect(r.texto).toBe(base);
    expect(r.faltando.sort()).toEqual(["empresa", "nome", "primeiro_nome"]);
  });

  it("nome longo demais deixa só empresa em falta", () => {
    const bio = "Harmonização facial, preenchimento labial, bioestimulador de colágeno e fios de PDO em Campinas";
    const r = interpolarContato("Encontramos a {{empresa}}.", bio);
    expect(r.faltando).toEqual(["empresa"]);
    expect(r.texto).toBe("Encontramos a {{empresa}}.");
  });

  it("texto sem marcação passa intacto", () => {
    expect(interpolarContato("Oi, tudo bem?", null)).toEqual({ texto: "Oi, tudo bem?", faltando: [] });
  });

  it("a mensagem da abordagem sai com o nome curto", () => {
    const msg = "Estamos analisando alguns perfis de clínicas de estética e encontramos a {{empresa}}.";
    expect(interpolarContato(msg, "Clínica Elleve - Estética e Bem Estar").texto).toBe(
      "Estamos analisando alguns perfis de clínicas de estética e encontramos a Clínica Elleve.",
    );
  });
});
