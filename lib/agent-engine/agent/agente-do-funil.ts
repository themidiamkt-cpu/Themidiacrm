/**
 * Quem atende quem ESTÁ NUM FUNIL.
 *
 * Irmão de `agente-da-campanha.ts` e de `agente-da-origem.ts`. Lá a pergunta é
 * de onde a conversa veio; aqui é onde o contato está hoje: se ele tem negócio
 * ABERTO num funil para o qual o roteador declarou um agente, é esse agente que
 * atende, antes de o assunto ser avaliado.
 *
 * A regra é declarada no roteador (`ai_routers.config.pipeline_agents`) e tem
 * dois lados, de propósito:
 *
 *   1. quem está no funil é atendido pelo agente do funil;
 *   2. o agente do funil não atende mais ninguém por este roteador. Se a origem
 *      de anúncio, uma intenção ou a reserva apontarem para ele num contato de
 *      fora do funil, o turno sai sem resposta.
 *
 * O segundo lado é o que a regra promete a quem a configura: "este agente só
 * fala com quem está neste funil". Sem ele, bastava apontar a reserva do
 * roteador para o agente e ele passava a responder a qualquer contato do
 * número, inclusive cliente antigo. Medido em produção em 09/10/2026.
 *
 * ═══ O que fica de fora ═══
 *
 * A campanha que criou a conversa continua acima (degrau 0): ela declara o
 * agente por decisão de quem disparou, e é resolvida antes de o roteador ser
 * lido. Negócio ganho ou perdido não conta: só `status = 'open'`.
 */
import type pg from 'pg';

import type { PublishedAgentConfig } from './agent-config';

/** Uma linha de `config.pipeline_agents`: quem tem negócio aberto neste funil é atendido por este agente. */
export interface RegraDeFunil {
  pipelineId: string;
  agentId: string;
}

/** Quantas regras de funil um roteador lê. O que passar disto é ignorado. */
export const MAX_REGRAS_DE_FUNIL = 10;

/** Mesmo teto e mesmo motivo de `agente-da-campanha.ts`: roteamento não segura o turno. */
const TETO_MS = 500;

/**
 * Os funis em que o contato desta conversa tem negócio aberto.
 *
 * `null` quando não deu para saber (erro de consulta ou banco lento). Quem
 * chama trata a dúvida nos dois sentidos: a regra não ROTEIA na dúvida, e o
 * agente restrito não RESPONDE na dúvida.
 */
export async function funisAbertosDoContatoDaConversa(
  db: pg.Pool,
  tenantId: string,
  conversationId: string,
): Promise<ReadonlySet<string> | null> {
  try {
    const consulta = db.query<{ pipeline_id: string }>(
      `select distinct l.pipeline_id
         from conversations v
         join crm_leads l on l.organization_id = v.organization_id and l.contact_id = v.contact_id
        where v.organization_id = $1
          and v.id = $2
          and l.status = 'open'`,
      [tenantId, conversationId],
    );
    const resultado = await Promise.race([
      consulta,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TETO_MS)),
    ]);
    if (resultado === null) return null;
    return new Set(resultado.rows.map((r) => r.pipeline_id));
  } catch {
    return null;
  }
}

/** O agente da primeira regra cujo funil o contato ocupa. `null` = nenhuma regra vale (ou não deu para saber). */
export function agenteDoFunil(
  regras: readonly RegraDeFunil[],
  funis: ReadonlySet<string> | null,
): string | null {
  if (funis === null) return null;
  return regras.find((r) => funis.has(r.pipelineId))?.agentId ?? null;
}

/**
 * `true` quando o agente tem regra de funil e o contato não está em nenhum dos
 * funis dele. Agente sem regra nunca é barrado. Na dúvida (`funis === null`) o
 * agente restrito fica de fora: responder a quem não devia é pior que calar.
 */
export function foraDoFunilDoAgente(
  regras: readonly RegraDeFunil[],
  funis: ReadonlySet<string> | null,
  agentId: string,
): boolean {
  const dele = regras.filter((r) => r.agentId === agentId);
  if (dele.length === 0) return false;
  if (funis === null) return true;
  return !dele.some((r) => funis.has(r.pipelineId));
}

/**
 * A mesma configuração, pausada SÓ NESTE TURNO.
 *
 * O turno tem um único jeito de sair sem responder depois de escolhido o
 * agente: o agente pausado (`inbound-turn.ts`, nos dois pontos que consomem o
 * resolvedor). Devolver `config: null` faria o contrário do que se quer, porque
 * `null` é "atende o genérico". Marcar a pausa na cópia reaproveita o caminho
 * que já existe e já é testado, sem abrir um terceiro desfecho no turno.
 *
 * `operationMode` volta para automático porque o modo assistido é lido ANTES da
 * pausa e geraria rascunho para um contato que este agente não atende.
 */
export function caladoNesteTurno(config: PublishedAgentConfig, agora: Date = new Date()): PublishedAgentConfig {
  return { ...config, operationMode: 'automatic', pausedAt: config.pausedAt ?? agora.toISOString() };
}
