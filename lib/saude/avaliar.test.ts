import { describe, expect, it } from "vitest";
import { avaliarSaude, type DadosDeSaude } from "./avaliar";

const limpo: DadosDeSaude = {
  provedores: [],
  canais: [],
  mensagens_falhas_24h: 0,
  jobs_pendentes_atrasados: 0,
  jobs_mortos_24h: 0,
  followups_mortos: 0,
};

describe("avaliarSaude", () => {
  it("instalação saudável não gera alerta", () => {
    expect(avaliarSaude(limpo)).toEqual([]);
  });

  it("erro de saldo sem chamada ok depois é crítico e fala o provedor", () => {
    const a = avaliarSaude({
      ...limpo,
      provedores: [
        {
          provider: "openai",
          ok: 3,
          erros: 4,
          ultimo_erro_code: "limite_ou_saldo",
          ultimo_erro_em: "2026-10-08T18:41:00Z",
          ultimo_ok_em: "2026-10-08T18:30:00Z",
        },
      ],
    });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ codigo: "ia_sem_saldo", gravidade: "critico" });
    expect(a[0]!.titulo).toContain("openai");
  });

  it("saldo recarregado (ok depois do erro) não alerta saldo", () => {
    const a = avaliarSaude({
      ...limpo,
      provedores: [
        {
          provider: "openai",
          ok: 10,
          erros: 1,
          ultimo_erro_code: "limite_ou_saldo",
          ultimo_erro_em: "2026-10-08T18:41:00Z",
          ultimo_ok_em: "2026-10-08T19:00:00Z",
        },
      ],
    });
    expect(a).toEqual([]);
  });

  it("canal parado é crítico e IA aberta é atenção; crítico vem primeiro", () => {
    const a = avaliarSaude({
      ...limpo,
      canais: [
        { id: "1", organizacao: "The Mídia", nome: "principal", status: "WORKING", falhas_seguidas: 0, ia_aberta: true },
        { id: "2", organizacao: "Cliente", nome: "wpp", status: "STOPPED", falhas_seguidas: 0, ia_aberta: false },
      ],
    });
    expect(a.map((x) => x.codigo)).toEqual(["canal_fora_do_ar", "canal_ia_aberta"]);
  });

  it("fila atrasada e mensagens falhas aparecem", () => {
    const a = avaliarSaude({ ...limpo, jobs_pendentes_atrasados: 2, mensagens_falhas_24h: 12 });
    expect(a.map((x) => x.codigo).sort()).toEqual(["fila_parada", "mensagens_falhas"]);
    expect(a.every((x) => x.gravidade === "critico")).toBe(true);
  });
});
