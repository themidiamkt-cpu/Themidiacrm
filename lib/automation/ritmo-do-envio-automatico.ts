/**
 * Ritmo dos envios AUTOMÁTICOS (follow-up, automação): um por vez, e não no fim de semana.
 *
 * ═══ Duas regras, e nenhuma cancela nada ═══
 *
 * 1. Dois envios automáticos do mesmo número ficam separados por 2 minutos.
 *    O envio que chega antes desse intervalo não sai: fica estacionado até o
 *    instante em que o intervalo fecha.
 * 2. Sábado e domingo (no fuso do tenant) não saem. O envio estaciona até a
 *    abertura de segunda-feira, no horário de início da janela do canal.
 *
 * Estacionar NÃO é cancelar. Quem chama deve devolver o adiamento ao
 * enrollment (`completeTurnForEnrollment` com `kind: "deferred"`), que é o
 * sinal de "estou esperando, não morri": sem ele o dead-man da ação mata a
 * inscrição depois de ~11h, e foi exatamente isso que cancelava follow-ups no
 * fim de semana.
 *
 * ═══ O que NÃO entra aqui ═══
 *
 * Respostas do agente a quem escreveu (inbound), e mensagens digitadas por
 * pessoa no Inbox. Essas são respostas a um cliente que está falando agora, e
 * segurá-las seria pior que o problema. A régua de espaçamento do agente
 * (`pacing/engine`) continua valendo para elas, do jeito que já valia.
 *
 * A regra pura (`decidirRitmoDoEnvio`) não toca banco. O adaptador
 * (`decidirRitmoDoEnvioAutomatico`) lê o ledger de envios do número, que é o
 * mesmo `pacing_ledger` que o agente já conta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerEstadoDoPacing, registrarEnvioNoLedger } from "@/lib/agent-engine/pacing/ledger-supabase";
import { knobsDoCanal } from "@/lib/automation/janela-do-canal";

/** Intervalo mínimo entre dois envios automáticos do mesmo número. */
export const INTERVALO_ENTRE_ENVIOS_AUTOMATICOS_MS = 2 * 60_000;

const MINUTO_MS = 60_000;
const DIA_MS = 86_400_000;
/** Granularidade da busca da abertura de segunda. Fuso com meia hora cai certo. */
const PASSO_DA_BUSCA_MS = 15 * MINUTO_MS;
/** Limite da busca: um fim de semana inteiro cabe com folga. */
const HORIZONTE_DA_BUSCA_MS = 8 * DIA_MS;

export type MotivoDeAdiamento = "fim_de_semana" | "espacamento";

export type RitmoDoEnvio =
  | { liberado: true }
  | { liberado: false; motivo: MotivoDeAdiamento; liberaEm: Date };

interface EntradaDaDecisao {
  agora: Date;
  timezone: string;
  /** Último envio do número, em qualquer origem. `null` = nunca enviou. */
  ultimoEnvio: Date | null;
  /** Início e fim da janela do canal, em hora cheia no fuso do tenant. */
  inicioHora?: number;
  fimHora?: number;
}

/** Dia da semana e hora cheia de um instante, lidos no fuso informado. */
function diaEHoraNoFuso(instanteMs: number, timezone: string): { dia: string; hora: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(instanteMs));
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  return { dia, hora };
}

function ehFimDeSemanaNoFuso(dia: string): boolean {
  return dia === "Sat" || dia === "Sun";
}

/** Sábado ou domingo, no fuso do tenant. */
export function ehFimDeSemana(agora: Date, timezone: string): boolean {
  return ehFimDeSemanaNoFuso(diaEHoraNoFuso(agora.getTime(), timezone).dia);
}

/**
 * Primeiro instante depois de `agora` em que o envio pode sair: dia útil e
 * dentro da janela. Anda em passos de 15 min, então a hora devolvida cai no
 * início da janela (ex.: segunda 07:00 no fuso do tenant).
 */
export function proximaAberturaDeEnvio(
  agora: Date,
  timezone: string,
  inicioHora = 7,
  fimHora = 22,
): Date {
  const inicio = Math.floor(agora.getTime() / PASSO_DA_BUSCA_MS) * PASSO_DA_BUSCA_MS + PASSO_DA_BUSCA_MS;
  for (let t = inicio; t < inicio + HORIZONTE_DA_BUSCA_MS; t += PASSO_DA_BUSCA_MS) {
    const { dia, hora } = diaEHoraNoFuso(t, timezone);
    if (!ehFimDeSemanaNoFuso(dia) && hora >= inicioHora && hora < fimHora) return new Date(t);
  }
  return new Date(inicio + HORIZONTE_DA_BUSCA_MS);
}

/**
 * A decisão PURA. Se mais de uma regra segura o envio, vale a que libera mais
 * tarde: não adianta liberar pelo espaçamento se o fim de semana ainda fecha.
 */
export function decidirRitmoDoEnvio(entrada: EntradaDaDecisao): RitmoDoEnvio {
  const candidatos: { motivo: MotivoDeAdiamento; liberaEm: Date }[] = [];

  if (ehFimDeSemana(entrada.agora, entrada.timezone)) {
    candidatos.push({
      motivo: "fim_de_semana",
      liberaEm: proximaAberturaDeEnvio(entrada.agora, entrada.timezone, entrada.inicioHora, entrada.fimHora),
    });
  }

  if (entrada.ultimoEnvio) {
    const liberaEm = new Date(entrada.ultimoEnvio.getTime() + INTERVALO_ENTRE_ENVIOS_AUTOMATICOS_MS);
    if (liberaEm.getTime() > entrada.agora.getTime()) {
      candidatos.push({ motivo: "espacamento", liberaEm });
    }
  }

  if (candidatos.length === 0) return { liberado: true };
  const mais_tarde = candidatos.reduce((a, b) => (b.liberaEm.getTime() > a.liberaEm.getTime() ? b : a));
  return { liberado: false, ...mais_tarde };
}

/**
 * Lê o fuso, a janela e o último envio do número, e decide. Falha de leitura
 * do ledger cai no que `lerEstadoDoPacing` já faz (aberta e nomeada no log).
 */
export async function decidirRitmoDoEnvioAutomatico(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  agora: Date = new Date(),
): Promise<RitmoDoEnvio> {
  const knobs = await knobsDoCanal(admin, organizationId, channelSessionId);
  const estado = await lerEstadoDoPacing(admin, organizationId, channelSessionId, {
    agora,
    timezone: knobs.timezone,
  });
  return decidirRitmoDoEnvio({
    agora,
    timezone: knobs.timezone,
    ultimoEnvio: estado.lastSentAt,
    inicioHora: knobs.windowStartHour,
    fimHora: knobs.windowEndHour,
  });
}

/** Conta um envio automático no ledger, para o próximo ver o intervalo. Nunca lança. */
export async function registrarEnvioAutomatico(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  quando: Date = new Date(),
): Promise<void> {
  await registrarEnvioNoLedger(admin, organizationId, channelSessionId, quando);
}
