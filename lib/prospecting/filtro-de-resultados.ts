/**
 * Filtros da tabela "Acompanhar resultados" da prospecção: por site próprio e
 * por andamento da abordagem. Os dois se combinam.
 *
 * Módulo puro: roda no navegador, sobre a lista que a tela já carregou.
 */
import { temSiteProprio } from "./site-proprio";

export type FiltroDeSite = "all" | "without_site" | "with_site";

/**
 * Ordem dos andamentos no filtro: primeiro o que pede ação de quem atende,
 * depois o que já andou, por fim o que ficou de fora. Um andamento que não
 * esteja aqui (valor novo do servidor) aparece no fim, na ordem em que surgir.
 */
export const ORDEM_DOS_ANDAMENTOS: readonly string[] = [
  "manual_ready",
  "sent",
  "replied",
  "qualified",
  "new",
  "queued",
  "sending",
  "skipped",
  "failed",
];

type Linha = { progress: string; data: { website?: string | null } };

const passaNoSite = (linha: Linha, site: FiltroDeSite) =>
  site === "all" || temSiteProprio(linha.data.website) === (site === "with_site");

const passaNoAndamento = (linha: Linha, andamento: string | null) =>
  !andamento || linha.progress === andamento;

/**
 * Aplica os dois filtros e conta cada botão.
 *
 * A contagem de um grupo respeita o filtro do OUTRO grupo e ignora o próprio:
 * com "Sem site próprio" marcado, "Abordado · 12" diz quantas das sem site
 * foram abordadas — o número que a pessoa vai ver ao clicar.
 *
 * Os botões de andamento saem da lista inteira da campanha, não da filtrada:
 * um botão não some da tela porque o outro filtro zerou a contagem dele.
 */
export function filtrarResultados<T extends Linha>(
  linhas: T[],
  site: FiltroDeSite,
  andamento: string | null,
) {
  const doSite = linhas.filter((l) => passaNoSite(l, site));
  const doAndamento = linhas.filter((l) => passaNoAndamento(l, andamento));
  const presentes = [...new Set(linhas.map((l) => l.progress))];
  const ordenados = [
    ...ORDEM_DOS_ANDAMENTOS.filter((a) => presentes.includes(a)),
    ...presentes.filter((a) => !ORDEM_DOS_ANDAMENTOS.includes(a)),
  ];
  return {
    visiveis: doSite.filter((l) => passaNoAndamento(l, andamento)),
    total: linhas.length,
    semSite: doAndamento.filter((l) => !temSiteProprio(l.data.website)).length,
    comSite: doAndamento.filter((l) => temSiteProprio(l.data.website)).length,
    andamentos: ordenados.map((valor) => ({
      valor,
      quantas: doSite.filter((l) => l.progress === valor).length,
    })),
  };
}
