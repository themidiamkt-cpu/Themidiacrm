/**
 * Quem atende quem CHEGOU POR ANÚNCIO.
 *
 * Irmão de `agente-da-campanha.ts`, um degrau abaixo: lá a conversa nasceu de
 * uma campanha que a empresa disparou; aqui a pessoa veio sozinha, clicando num
 * anúncio. O roteador do número classifica ASSUNTO, e origem não é assunto — a
 * primeira mensagem de quem clica num anúncio costuma ser "Olá, tenho
 * interesse", que não casa com intenção nenhuma e cairia na reserva.
 *
 * A regra é declarada no roteador (`ai_routers.config.ad_origin_agent_id`). Este
 * arquivo só responde a pergunta de fato: o contato desta conversa chegou por
 * anúncio, e chegou há pouco?
 *
 * ═══ Por que "há pouco" ═══
 *
 * A origem é de primeiro toque e nunca muda. Sem prazo, quem clicou num anúncio
 * e virou cliente continuaria, um ano depois, sendo atendido por um agente cujo
 * roteiro é o de quem acabou de chegar. Passado o prazo a conversa volta para a
 * régua comum do número (assunto, reserva).
 */
import type pg from "pg";

import { veioDeAnuncio } from "@/lib/leads/veio-de-anuncio";

/** Por quantos dias, a contar da chegada do contato, a origem decide quem atende. */
export const DIAS_DA_ORIGEM = 30;

/** Mesmo teto e mesmo motivo de `agente-da-campanha.ts`: enfeite de roteamento não segura o turno. */
const TETO_MS = 500;

/**
 * `true` só com certeza: contato desta conversa, da organização, com origem de
 * anúncio e criado dentro do prazo. Erro de consulta, banco lento ou conversa
 * sem contato valem `false` — o turno segue pela régua do número.
 */
export async function contatoDaConversaVeioDeAnuncio(
  db: pg.Pool,
  tenantId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const consulta = db.query<{ source_metadata: unknown }>(
      `select c.source_metadata
         from conversations v
         join contacts c on c.id = v.contact_id and c.organization_id = v.organization_id
        where v.organization_id = $1
          and v.id = $2
          and c.created_at > now() - make_interval(days => $3)
        limit 1`,
      [tenantId, conversationId, DIAS_DA_ORIGEM],
    );
    const resultado = await Promise.race([
      consulta,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TETO_MS)),
    ]);
    if (resultado === null) return false;
    return veioDeAnuncio(resultado.rows[0]?.source_metadata);
  } catch {
    return false;
  }
}
