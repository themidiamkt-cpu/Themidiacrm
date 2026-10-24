import { describe, expect, it } from "vitest";

import {
  decidirRitmoDoEnvio,
  ehFimDeSemana,
  INTERVALO_ENTRE_ENVIOS_AUTOMATICOS_MS,
  proximaAberturaDeEnvio,
} from "./ritmo-do-envio-automatico";

const TZ = "America/Sao_Paulo";

// 2026-10-23 é sexta; 2026-10-24 sábado; 2026-10-26 segunda. Brasília = UTC-3.
const SEXTA_17H = new Date("2026-10-23T20:00:00Z");
const SABADO_12H = new Date("2026-10-24T15:00:00Z");
const DOMINGO_2030 = new Date("2026-10-25T23:30:00Z");
const SEGUNDA_07H = new Date("2026-10-26T10:00:00Z");

describe("ehFimDeSemana", () => {
  it("sábado e domingo no fuso do tenant", () => {
    expect(ehFimDeSemana(SABADO_12H, TZ)).toBe(true);
    expect(ehFimDeSemana(DOMINGO_2030, TZ)).toBe(true);
  });

  it("sexta à tarde é dia útil", () => {
    expect(ehFimDeSemana(SEXTA_17H, TZ)).toBe(false);
  });
});

describe("proximaAberturaDeEnvio", () => {
  it("sábado vai para segunda às 07:00 do fuso, não para o instante cru de 24h", () => {
    expect(proximaAberturaDeEnvio(SABADO_12H, TZ, 7, 22).toISOString()).toBe(SEGUNDA_07H.toISOString());
  });

  it("domingo à noite também vai para segunda às 07:00", () => {
    expect(proximaAberturaDeEnvio(DOMINGO_2030, TZ, 7, 22).toISOString()).toBe(SEGUNDA_07H.toISOString());
  });
});

describe("decidirRitmoDoEnvio", () => {
  it("nunca enviou e é dia útil → libera", () => {
    expect(decidirRitmoDoEnvio({ agora: SEXTA_17H, timezone: TZ, ultimoEnvio: null })).toEqual({ liberado: true });
  });

  it("fim de semana → estaciona até segunda, motivo fim_de_semana", () => {
    const r = decidirRitmoDoEnvio({ agora: SABADO_12H, timezone: TZ, ultimoEnvio: null });
    expect(r).toMatchObject({ liberado: false, motivo: "fim_de_semana" });
    if (!r.liberado) expect(r.liberaEm.toISOString()).toBe(SEGUNDA_07H.toISOString());
  });

  it("envio há menos de 2 min → estaciona até completar 2 min, motivo espacamento", () => {
    const ultimo = new Date(SEXTA_17H.getTime() - 30_000);
    const r = decidirRitmoDoEnvio({ agora: SEXTA_17H, timezone: TZ, ultimoEnvio: ultimo });
    expect(r).toMatchObject({ liberado: false, motivo: "espacamento" });
    if (!r.liberado) expect(r.liberaEm.getTime()).toBe(ultimo.getTime() + INTERVALO_ENTRE_ENVIOS_AUTOMATICOS_MS);
  });

  it("envio há exatamente 2 min → libera", () => {
    const ultimo = new Date(SEXTA_17H.getTime() - INTERVALO_ENTRE_ENVIOS_AUTOMATICOS_MS);
    expect(decidirRitmoDoEnvio({ agora: SEXTA_17H, timezone: TZ, ultimoEnvio: ultimo })).toEqual({ liberado: true });
  });

  it("sábado com envio recente: vale o que libera mais tarde (segunda 07:00)", () => {
    const ultimo = new Date(SABADO_12H.getTime() - 10_000);
    const r = decidirRitmoDoEnvio({ agora: SABADO_12H, timezone: TZ, ultimoEnvio: ultimo });
    expect(r).toMatchObject({ liberado: false, motivo: "fim_de_semana" });
  });
});
