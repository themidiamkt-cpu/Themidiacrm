/**
 * Regras do painel de saúde da instalação: transformam números crus em alertas.
 *
 * Sem acesso a banco. A rota `GET /api/v1/admin/saude` coleta e este módulo
 * decide o que é problema. Existe porque a IA já ficou parada por dias (conta
 * sem saldo no provedor) sem nenhuma tela dizer isso.
 */

export type Gravidade = "critico" | "atencao";

export interface Alerta {
  codigo:
    | "ia_sem_saldo"
    | "ia_com_erros"
    | "canal_fora_do_ar"
    | "canal_ia_aberta"
    | "mensagens_falhas"
    | "fila_parada"
    | "jobs_mortos"
    | "followups_mortos";
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
}

export interface ProvedorIA {
  provider: string;
  ok: number;
  erros: number;
  ultimo_erro_code: string | null;
  ultimo_erro_em: string | null;
  ultimo_ok_em: string | null;
}

export interface CanalSaude {
  id: string;
  organizacao: string;
  nome: string;
  status: string;
  falhas_seguidas: number;
  ia_aberta: boolean;
}

export interface DadosDeSaude {
  provedores: ProvedorIA[];
  canais: CanalSaude[];
  mensagens_falhas_24h: number;
  jobs_pendentes_atrasados: number;
  jobs_mortos_24h: number;
  followups_mortos: number;
}

/** Códigos de erro de `llm_calls.error_code` que significam "pagar o provedor". */
const CODIGOS_DE_SALDO = new Set(["limite_ou_saldo"]);

export function avaliarSaude(d: DadosDeSaude): Alerta[] {
  const alertas: Alerta[] = [];

  for (const p of d.provedores) {
    const erroDepoisDoOk =
      p.ultimo_erro_em !== null && (p.ultimo_ok_em === null || p.ultimo_erro_em > p.ultimo_ok_em);
    if (erroDepoisDoOk && p.ultimo_erro_code && CODIGOS_DE_SALDO.has(p.ultimo_erro_code)) {
      alertas.push({
        codigo: "ia_sem_saldo",
        gravidade: "critico",
        titulo: `IA parada: ${p.provider} sem saldo ou no limite`,
        detalhe: `A última chamada falhou por saldo/limite e nenhuma deu certo depois. Recarregue o crédito de ${p.provider}.`,
      });
      continue;
    }
    const total = p.ok + p.erros;
    if (total >= 5 && p.erros / total >= 0.3) {
      alertas.push({
        codigo: "ia_com_erros",
        gravidade: erroDepoisDoOk ? "critico" : "atencao",
        titulo: `${p.provider}: ${p.erros} de ${total} chamadas falharam`,
        detalhe: `Último erro: ${p.ultimo_erro_code ?? "sem código"}. Veja Agente de IA › Provedores.`,
      });
    }
  }

  const fora = d.canais.filter((c) => c.status !== "WORKING" || c.falhas_seguidas >= 3);
  for (const c of fora) {
    alertas.push({
      codigo: "canal_fora_do_ar",
      gravidade: "critico",
      titulo: `WhatsApp fora do ar: ${c.organizacao} / ${c.nome}`,
      detalhe: `Status ${c.status}, ${c.falhas_seguidas} falhas seguidas de verificação.`,
    });
  }

  for (const c of d.canais.filter((x) => x.ia_aberta)) {
    alertas.push({
      codigo: "canal_ia_aberta",
      gravidade: "atencao",
      titulo: `IA aberta ao público: ${c.organizacao} / ${c.nome}`,
      detalhe:
        "Qualquer contato, inclusive cliente antigo, pode ser atendido pela IA se houver agente ativo.",
    });
  }

  if (d.mensagens_falhas_24h > 0) {
    alertas.push({
      codigo: "mensagens_falhas",
      gravidade: d.mensagens_falhas_24h >= 10 ? "critico" : "atencao",
      titulo: `${d.mensagens_falhas_24h} mensagem(ns) com falha de envio em 24 h`,
      detalhe: "Mensagens ficaram em 'failed'. Conferir a Central e a conexão do canal.",
    });
  }

  if (d.jobs_pendentes_atrasados > 0) {
    alertas.push({
      codigo: "fila_parada",
      gravidade: "critico",
      titulo: `${d.jobs_pendentes_atrasados} job(s) esperando há mais de 10 min`,
      detalhe: "O worker pode estar parado ou lento. Conferir o contêiner do worker.",
    });
  }

  if (d.jobs_mortos_24h > 0) {
    alertas.push({
      codigo: "jobs_mortos",
      gravidade: "atencao",
      titulo: `${d.jobs_mortos_24h} job(s) esgotaram as tentativas em 24 h`,
      detalhe: "Turnos de IA que falharam de vez; o cliente pode ter ficado sem resposta.",
    });
  }

  if (d.followups_mortos > 0) {
    alertas.push({
      codigo: "followups_mortos",
      gravidade: "atencao",
      titulo: `${d.followups_mortos} inscrição(ões) de follow-up travadas (dead)`,
      detalhe: "Ver Follow-ups › Fila, filtro por status.",
    });
  }

  return alertas.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === "critico" ? -1 : 1));
}

export function centavosParaDolar(cents: number): string {
  return `US$ ${(cents / 100).toFixed(2)}`;
}
