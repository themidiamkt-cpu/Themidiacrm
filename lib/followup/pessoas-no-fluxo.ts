/**
 * Quem está em cada passo de um fluxo de follow-up, agora.
 *
 * O construtor mostrava o desenho do fluxo e nada sobre quem o percorre: para
 * saber onde cada pessoa estava era preciso abrir a Fila e ler o `current_node_id`
 * de cada linha. Este módulo agrupa os enrollments do fluxo pelo passo em que
 * estão, para o próprio card do passo responder "quantos estão aqui e quem são".
 *
 * Puro de propósito: a rota lê o banco e entrega as linhas; o agrupamento e a
 * regra de "vivo x encerrado" moram aqui, testáveis sem banco.
 */

/** Estados em que a pessoa AINDA está no fluxo (os mesmos da Fila). */
export const STATUS_VIVOS = [
  "active",
  "waiting_reply",
  "dormente",
  "paused_handoff",
  "paused_manual",
  "coletando",
] as const;

/** Estados terminais: a pessoa saiu do fluxo, e o passo é onde ela saiu. */
export const STATUS_ENCERRADOS = ["completed", "cancelled", "dead"] as const;

/** Janela dos encerrados que o construtor mostra — passado recente, não o histórico inteiro. */
export const JANELA_DOS_ENCERRADOS_DIAS = 30;

export interface LinhaDeEnrollment {
  id: string;
  contact_id: string;
  contact_name: string;
  status: string;
  current_node_id: string;
  proxima_acao_em: string | null;
  updated_at: string;
  outcome: string | null;
}

export interface PessoaNoPasso {
  enrollment_id: string;
  contact: { id: string; name: string };
  status: string;
  /** Quando o motor volta a olhar esta pessoa; `null` = esperando resposta ou ação humana. */
  proxima_acao_em: string | null;
  /** Última mudança do enrollment — na prática, desde quando ela está neste passo. */
  updated_at: string;
  outcome: string | null;
}

export interface PessoasDoPasso {
  /** Quem está neste passo agora, do mais antigo no passo para o mais recente. */
  vivos: PessoaNoPasso[];
  /** Quem saiu do fluxo por este passo na janela recente, do mais recente para o mais antigo. */
  encerrados: PessoaNoPasso[];
}

export interface PessoasNoFluxo {
  /** `current_node_id` → pessoas. Passo sem ninguém não aparece. */
  passos: Record<string, PessoasDoPasso>;
  total_vivos: number;
  total_encerrados: number;
}

const vivos: ReadonlySet<string> = new Set(STATUS_VIVOS);

function pessoa(l: LinhaDeEnrollment): PessoaNoPasso {
  return {
    enrollment_id: l.id,
    contact: { id: l.contact_id, name: l.contact_name },
    status: l.status,
    proxima_acao_em: l.proxima_acao_em,
    updated_at: l.updated_at,
    outcome: l.outcome,
  };
}

export function agruparPessoasNoFluxo(linhas: readonly LinhaDeEnrollment[]): PessoasNoFluxo {
  const passos: Record<string, PessoasDoPasso> = {};
  let totalVivos = 0;
  let totalEncerrados = 0;
  for (const l of linhas) {
    const passo = (passos[l.current_node_id] ??= { vivos: [], encerrados: [] });
    if (vivos.has(l.status)) {
      passo.vivos.push(pessoa(l));
      totalVivos += 1;
    } else {
      passo.encerrados.push(pessoa(l));
      totalEncerrados += 1;
    }
  }
  for (const passo of Object.values(passos)) {
    passo.vivos.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    passo.encerrados.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  return { passos, total_vivos: totalVivos, total_encerrados: totalEncerrados };
}
