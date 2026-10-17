/**
 * Procedimentos com retorno automático — as regras que não dependem de banco.
 *
 * Datas são TEXTO `YYYY-MM-DD` (o dia civil que a clínica vê), nunca instante:
 * "botox feito em 15/04, volta em 15/10" não pode mudar de dia por causa de
 * fuso. O dia de HOJE vem do fuso da organização (`hojeNoFuso`).
 *
 * Módulo puro de propósito (zero import de runtime): a tela e o cron usam as
 * MESMAS contas, e os testes falam com elas sem montar nada.
 */

/** Passou disto depois do vencimento, o sistema NÃO manda mais (ver `estadoDoVencimento`). */
export const DIAS_DE_TOLERANCIA = 7;

/** Tentativas de envio antes de desistir e marcar `falhou`. */
export const MAX_TENTATIVAS = 3;

/** Teto de envios por rodada do cron (roda a cada minuto). O ritmo fino é do `espacarEnvio`. */
export const LIMITE_POR_RODADA = 20;

export const MESES_MAXIMO = 120;
export const MENSAGEM_MAXIMA = 1000;

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehDataISO(valor: string): boolean {
  const m = DATA.exec(valor);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function diasNoMes(ano: number, mes0: number): number {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

/**
 * Soma meses ao dia civil, sem estourar o fim do mês: 31/01 + 1 mês = 28/02 (ou
 * 29/02 em ano bissexto), e não 03/03.
 */
export function somarMeses(dataISO: string, meses: number): string {
  const m = DATA.exec(dataISO);
  if (!m || !ehDataISO(dataISO)) throw new Error(`data inválida: ${dataISO}`);
  const ano = Number(m[1]);
  const mes0 = Number(m[2]) - 1;
  const dia = Number(m[3]);
  const total = mes0 + meses;
  const anoFinal = ano + Math.floor(total / 12);
  const mesFinal = ((total % 12) + 12) % 12;
  const diaFinal = Math.min(dia, diasNoMes(anoFinal, mesFinal));
  return `${String(anoFinal).padStart(4, "0")}-${String(mesFinal + 1).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

/** Quando o retorno vence: o dia em que foi realizado + a validade do procedimento. */
export function venceEm(realizadoEm: string, mesesValidade: number): string {
  return somarMeses(realizadoEm, mesesValidade);
}

function diaParaNumero(dataISO: string): number {
  const m = DATA.exec(dataISO)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Diferença em dias civis: positivo quando `a` é depois de `b`. */
export function diasEntre(a: string, b: string): number {
  return Math.round(diaParaNumero(a) - diaParaNumero(b));
}

export type EstadoDoVencimento = "ainda_nao" | "no_prazo" | "expirado";

/**
 * - `ainda_nao`: vence hoje ou depois? Não: ainda_nao é só ANTES de hoje no calendário.
 * - `no_prazo`: venceu hoje ou há até 7 dias — pode mandar.
 * - `expirado`: venceu há mais de 7 dias. NÃO manda: é o caso de cadastrar hoje um
 *   procedimento feito há dois anos, e a mensagem "faz 6 meses do seu botox" sairia
 *   para centenas de pacientes de uma vez. Fica registrado como `expirado`.
 */
export function estadoDoVencimento(vence: string, hoje: string): EstadoDoVencimento {
  const atraso = diasEntre(hoje, vence);
  if (atraso < 0) return "ainda_nao";
  if (atraso <= DIAS_DE_TOLERANCIA) return "no_prazo";
  return "expirado";
}

/** O dia de hoje (`YYYY-MM-DD`) no fuso da organização. */
export function hojeNoFuso(timezone: string | null | undefined, agora: Date = new Date()): string {
  const fuso = timezone || "America/Sao_Paulo";
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
    if (ehDataISO(partes)) return partes;
  } catch {
    /* fuso inválido: cai no padrão */
  }
  return hojeNoFuso("America/Sao_Paulo", agora);
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Preenche o modelo da mensagem. Variáveis: `{nome}` (primeiro nome do paciente)
 * e `{procedimento}`. Sem nome, a variável some e o espaço/pontuação em volta é
 * arrumado ("Oi {nome}, tudo bem?" → "Oi, tudo bem?"), em vez de sair "Oi , tudo bem?".
 */
export function montarMensagem(
  modelo: string,
  dados: { nome: string | null | undefined; procedimento: string },
): string {
  const nome = primeiroNome(dados.nome);
  let texto = modelo
    .replace(/\{\s*nome\s*\}/gi, nome)
    .replace(/\{\s*procedimento\s*\}/gi, dados.procedimento);
  if (!nome) {
    texto = texto.replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ");
  }
  return texto.trim();
}
