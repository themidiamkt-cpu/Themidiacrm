/**
 * Ponto de partida do formulário "Mensagem manual": a abordagem manual mais
 * recente da organização.
 *
 * Quem prospecta repete a mesma oferta em várias buscas (um nicho, depois
 * outro). Redigitar a mensagem base, o funil e as etapas a cada campanha é
 * trabalho repetido e é onde a mensagem sai diferente sem querer.
 *
 * Só aproveita o que ainda vale: conexão que caiu, funil arquivado, etapa
 * removida ou agente pausado voltam em branco, para a pessoa escolher de novo
 * em vez de o formulário mandar um identificador que não existe mais.
 *
 * Módulo puro: roda no navegador, sobre o que a tela já carregou.
 */
import { isManualMessageConfig, type ManualMessageConfig } from "./schema";

type Opcoes = {
  agents: { id: string }[];
  channels: { id: string; status: string }[];
  stages: { id: string; pipeline_id: string }[];
};

/**
 * @param campanhas da mais nova para a mais antiga, como a API devolve.
 * @returns a configuração para preencher o formulário, ou null quando a
 *   organização ainda não fez nenhuma abordagem manual.
 */
export function aproveitarUltimaAbordagem(
  campanhas: { config: unknown }[],
  opcoes: Opcoes,
): ManualMessageConfig | null {
  const anterior = campanhas.map((c) => c.config).find(isManualMessageConfig);
  return anterior ? conferir(anterior, opcoes) : null;
}

/**
 * A abordagem mais recente de CADA funil, da mais nova para a mais antiga.
 *
 * Quem prospecta duas ofertas ao mesmo tempo (um funil para cada) alterna entre
 * elas, e "a última abordagem" passa a ser a da oferta errada metade das vezes:
 * mensagem de uma indo para o funil da outra. Com uma por funil o formulário
 * deixa escolher de qual partir.
 *
 * Abordagem cujo funil não existe mais fica de fora: não há como nomeá-la na
 * lista nem para onde mandar as empresas.
 */
export function abordagensPorFunil(
  campanhas: { config: unknown }[],
  opcoes: Opcoes,
): ManualMessageConfig[] {
  const vistos = new Set<string>();
  const lista: ManualMessageConfig[] = [];
  for (const config of campanhas.map((c) => c.config)) {
    if (!isManualMessageConfig(config) || vistos.has(config.pipeline_id)) continue;
    vistos.add(config.pipeline_id);
    const conferida = conferir(config, opcoes);
    if (conferida.pipeline_id) lista.push(conferida);
  }
  return lista;
}

/** Devolve a configuração só com o que ainda existe (ver o cabeçalho do módulo). */
function conferir(anterior: ManualMessageConfig, opcoes: Opcoes): ManualMessageConfig {
  // Etapa só vale dentro do funil da abordagem; funil que sumiu leva as etapas junto.
  const etapa = (id: string | null | undefined) =>
    opcoes.stages.find((s) => s.id === id && s.pipeline_id === anterior.pipeline_id)?.id ?? null;
  const canalAtivo = opcoes.channels.some(
    (c) => c.id === anterior.channel_session_id && c.status === "WORKING",
  );
  return {
    mode: "manual_message",
    channel_session_id: canalAtivo ? anterior.channel_session_id : "",
    pipeline_id: opcoes.stages.some((s) => s.pipeline_id === anterior.pipeline_id)
      ? anterior.pipeline_id
      : "",
    stage_id: etapa(anterior.stage_id) ?? "",
    agent_id: opcoes.agents.find((a) => a.id === anterior.agent_id)?.id ?? null,
    sent_stage_id: etapa(anterior.sent_stage_id),
    replied_stage_id: etapa(anterior.replied_stage_id),
    base_message: anterior.base_message,
    personalize: anterior.personalize ?? true,
    only_without_site: anterior.only_without_site ?? false,
    legal_basis_ref: anterior.legal_basis_ref,
  };
}
