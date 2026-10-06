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
  if (!anterior) return null;
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
