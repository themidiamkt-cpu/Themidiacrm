/**
 * Etapas do funil que importam para o fluxo "fechou → procedimento realizado →
 * pós-venda". Puro: recebe as etapas já lidas.
 */
interface EtapaBasica {
  id: string;
  name: string;
  pipeline_id: string;
  position?: number;
  is_won?: boolean;
  is_lost?: boolean;
  is_archived?: boolean;
}

function palavras(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const PALAVRAS_DE_FECHAMENTO = ["fechou", "fechado", "fechada"];
const PALAVRAS_QUE_ANULAM = ["nao", "sem", "perdido", "perdida", "cancelado", "cancelada"];

/**
 * A etapa em que a venda FECHOU: marcada como "ganho" no funil, ou de nome
 * "Fechou procedimento" / "Fechado". "Não fechou" e "Perdido" nunca contam.
 */
export function ehEtapaDeFechamento(etapa: Pick<EtapaBasica, "name" | "is_won" | "is_lost">): boolean {
  if (etapa.is_lost) return false;
  const p = palavras(etapa.name);
  if (p.some((x) => PALAVRAS_QUE_ANULAM.includes(x))) return false;
  return !!etapa.is_won || p.some((x) => PALAVRAS_DE_FECHAMENTO.includes(x));
}

/**
 * A etapa de pós-venda do MESMO funil ("Pós-venda", "Pos venda", "Pós-venda e
 * retorno"…). Arquivada não serve: o cartão não pode ir para uma etapa que o
 * quadro não mostra.
 */
export function acharEtapaPosVenda<T extends EtapaBasica>(etapas: readonly T[], pipelineId: string): T | null {
  return (
    etapas.find((e) => {
      if (e.pipeline_id !== pipelineId || e.is_archived) return false;
      const p = palavras(e.name);
      return p.includes("posvenda") || (p.includes("pos") && p.includes("venda"));
    }) ?? null
  );
}
