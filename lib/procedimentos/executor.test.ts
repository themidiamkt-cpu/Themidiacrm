import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.hoisted(() => vi.fn());
const mover = vi.hoisted(() => vi.fn());
const janela = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: enviar }));
vi.mock("@/app/api/v1/leads/_handler", () => ({ moveLeadHandler: mover }));
vi.mock("@/lib/automation/janela-do-canal", () => ({ adiarAteAJanelaAbrir: janela }));
vi.mock("@/lib/automation/start-conversation", () => ({
  ensureConversation: vi.fn(async () => "conversa-1"),
}));
vi.mock("@/lib/automation/throttle", () => ({ espacarEnvio: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { tickProcedimentos } from "./executor";

type Linha = Record<string, unknown>;
interface Mundo {
  procedimentos: Linha[];
  contato: Linha | null;
  canal: Linha | null;
  lead: Linha | null;
  etapa: Linha | null;
  erroNaLeitura?: { code: string; message: string };
}
const atualizacoes: Array<{ tabela: string; dados: Linha; filtros: Record<string, unknown> }> = [];

/** Um cliente de mentira que responde por tabela e registra os UPDATEs. */
function bancoDeMentira(m: Mundo) {
  return {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      let dados: Linha | null = null;
      const b: Record<string, unknown> = {};
      const encadeia = () => b;
      for (const nome of ["select", "eq", "is", "lte", "in", "order", "limit"]) {
        b[nome] = (...a: unknown[]) => {
          if (nome === "eq" || nome === "is") filtros[String(a[0])] = a[1];
          return encadeia();
        };
      }
      b.update = (d: Linha) => {
        dados = d;
        return encadeia();
      };
      const resolver = () => {
        if (dados) {
          atualizacoes.push({ tabela, dados, filtros: { ...filtros } });
          // A reserva só vale se `lembrete_enviado_em` ainda é null no filtro.
          return { data: { id: "ok" }, error: null };
        }
        switch (tabela) {
          case "themidia_lead_procedimentos":
            return m.erroNaLeitura
              ? { data: null, error: m.erroNaLeitura }
              : { data: m.procedimentos, error: null };
          case "organizations":
            return { data: [{ id: "org-1", timezone: "America/Sao_Paulo" }], error: null };
          case "contacts":
            return { data: m.contato, error: null };
          case "channel_sessions":
            return { data: m.canal, error: null };
          case "crm_leads":
            return { data: m.lead, error: null };
          case "crm_stages":
            return { data: m.etapa, error: null };
          default:
            return { data: null, error: null };
        }
      };
      b.maybeSingle = async () => resolver();
      b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve(resolver()).then(ok, ko);
      return b;
    },
  };
}

const AGORA = new Date("2026-10-16T15:00:00Z"); // 12h em São Paulo, dia 16/10

function linha(over: Linha = {}): Linha {
  return {
    id: "lp-1",
    organization_id: "org-1",
    lead_id: "lead-1",
    contact_id: "contato-1",
    procedimento_id: "proc-1",
    nome: "Botox",
    vence_em: "2026-10-16",
    lembrete_tentativas: 0,
    procedimento: {
      id: "proc-1",
      nome: "Botox",
      mensagem: "Oi {nome}! Faz 6 meses do seu {procedimento}.",
      etapa_destino_id: "etapa-2",
      ativo: true,
    },
    ...over,
  };
}

function mundo(over: Partial<Mundo> = {}): Mundo {
  return {
    procedimentos: [linha()],
    contato: { id: "contato-1", name: "Maria Silva", phone_number: "+5519999999999", is_blocked: false, is_anonymized: false },
    canal: { id: "canal-1" },
    lead: { id: "lead-1", status: "open", stage_id: "etapa-1", pipeline_id: "pipe-1" },
    etapa: { id: "etapa-2", pipeline_id: "pipe-1", is_archived: false },
    ...over,
  };
}

beforeEach(() => {
  atualizacoes.length = 0;
  enviar.mockReset();
  enviar.mockResolvedValue({});
  mover.mockReset();
  mover.mockResolvedValue({});
  janela.mockReset();
  janela.mockResolvedValue(null); // dentro da janela
});

describe("tickProcedimentos", () => {
  it("vencido hoje: reserva, envia o texto montado, marca enviado e move o cartão", async () => {
    const r = await tickProcedimentos(bancoDeMentira(mundo()) as never, { agora: AGORA });
    expect(r.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    const [, ctx, entrada] = enviar.mock.calls[0]!;
    expect(ctx.requestId).toBe("procedimento-retorno:lp-1");
    expect(entrada.body).toBe("Oi Maria! Faz 6 meses do seu Botox.");
    // a reserva vem ANTES do envio
    expect(atualizacoes[0]!.dados.lembrete_enviado_em).toBe(AGORA.toISOString());
    expect(atualizacoes[0]!.filtros.lembrete_enviado_em).toBeNull();
    expect(atualizacoes.some((a) => a.dados.lembrete_resultado === "enviado")).toBe(true);
    expect(mover).toHaveBeenCalledTimes(1);
    expect(mover.mock.calls[0]![3]).toMatchObject({ to_stage_id: "etapa-2" });
  });

  it("venceu há mais de 7 dias: expira e NÃO envia", async () => {
    const m = mundo({ procedimentos: [linha({ vence_em: "2026-10-01" })] });
    const r = await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    expect(r.expirados).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(atualizacoes[0]!.dados).toEqual({ lembrete_resultado: "expirado" });
  });

  it("ainda não venceu: não faz nada", async () => {
    const m = mundo({ procedimentos: [linha({ vence_em: "2026-10-17" })] });
    const r = await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    expect(r.pulados.ainda_nao).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(atualizacoes).toHaveLength(0);
  });

  it("fora da janela de envio: pula sem reservar", async () => {
    janela.mockResolvedValue("2026-10-17T10:00:00Z");
    const r = await tickProcedimentos(bancoDeMentira(mundo()) as never, { agora: AGORA });
    expect(r.pulados.fora_da_janela).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(atualizacoes).toHaveLength(0);
  });

  it("procedimento pausado: espera, não envia", async () => {
    const m = mundo({ procedimentos: [linha({ procedimento: { id: "p", nome: "Botox", mensagem: "x", etapa_destino_id: null, ativo: false } })] });
    const r = await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    expect(r.pulados.procedimento_pausado).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("cadastro apagado: encerra como sem_procedimento", async () => {
    const m = mundo({ procedimentos: [linha({ procedimento: null })] });
    await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    expect(enviar).not.toHaveBeenCalled();
    expect(atualizacoes[0]!.dados).toEqual({ lembrete_resultado: "sem_procedimento" });
  });

  it("contato sem telefone ou bloqueado: encerra sem enviar", async () => {
    const semTel = mundo({ contato: { id: "c", name: "M", phone_number: null, is_blocked: false, is_anonymized: false } });
    await tickProcedimentos(bancoDeMentira(semTel) as never, { agora: AGORA });
    expect(atualizacoes[0]!.dados).toEqual({ lembrete_resultado: "sem_numero" });
    atualizacoes.length = 0;
    const bloq = mundo({ contato: { id: "c", name: "M", phone_number: "+55", is_blocked: true, is_anonymized: false } });
    await tickProcedimentos(bancoDeMentira(bloq) as never, { agora: AGORA });
    expect(atualizacoes[0]!.dados).toEqual({ lembrete_resultado: "contato_bloqueado" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("envio que falha devolve a reserva e conta a tentativa", async () => {
    enviar.mockRejectedValue(new Error("canal caiu"));
    const r = await tickProcedimentos(bancoDeMentira(mundo()) as never, { agora: AGORA });
    expect(r.enviados).toBe(0);
    expect(r.erros).toBe(1);
    expect(mover).not.toHaveBeenCalled();
    const devolucao = atualizacoes[atualizacoes.length - 1]!;
    expect(devolucao.dados).toEqual({ lembrete_enviado_em: null });
  });

  it("na 3ª falha desiste: resultado falhou", async () => {
    enviar.mockRejectedValue(new Error("canal caiu"));
    const m = mundo({ procedimentos: [linha({ lembrete_tentativas: 2 })] });
    await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    const ultima = atualizacoes[atualizacoes.length - 1]!;
    expect(ultima.dados).toEqual({ lembrete_enviado_em: null, lembrete_resultado: "falhou" });
  });

  it("etapa de outro funil: envia, mas não move o cartão", async () => {
    const m = mundo({ etapa: { id: "etapa-2", pipeline_id: "OUTRO", is_archived: false } });
    const r = await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    expect(r.enviados).toBe(1);
    expect(mover).not.toHaveBeenCalled();
  });

  it("falha ao mover não desfaz nem repete a mensagem", async () => {
    mover.mockRejectedValue(new Error("campo obrigatório"));
    const r = await tickProcedimentos(bancoDeMentira(mundo()) as never, { agora: AGORA });
    expect(r.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("respeita o teto por rodada", async () => {
    const muitas = [linha({ id: "a" }), linha({ id: "b" }), linha({ id: "c" })];
    const r = await tickProcedimentos(bancoDeMentira(mundo({ procedimentos: muitas })) as never, {
      agora: AGORA,
      limite: 2,
    });
    expect(r.enviados).toBe(2);
    expect(r.pulados.teto_da_rodada).toBe(1);
  });

  it("tabela ainda não criada: responde ausente sem lançar", async () => {
    const m = mundo({ erroNaLeitura: { code: "42P01", message: 'relation "themidia_lead_procedimentos" does not exist' } });
    const r = await tickProcedimentos(bancoDeMentira(m) as never, { agora: AGORA });
    expect(r.ausente).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
  });
});
