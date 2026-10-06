/**
 * A ABERTURA de uma abordagem manual: a primeira mensagem que uma pessoa envia
 * numa conversa preparada pelo modo "Mensagem manual" da prospecção.
 *
 * Enviar pelo Inbox é, em regra, sinal de que uma pessoa está atendendo: a IA
 * se cala e, onde a empresa ligou "a conversa fica com quem atendeu", a conversa
 * é assumida. Para a abertura da prospecção esse sinal é falso. Quem enviou só
 * apertou o botão de uma mensagem que a IA redigiu; quem deve atender a
 * resposta é o agente que a campanha escolheu para continuar a conversa. Medido
 * em uso real: 23 conversas abordadas ficaram "assumidas" por quem enviou, e a
 * empresa que respondeu ficou sem resposta até alguém clicar em "Devolver ao
 * automático" em cada uma.
 *
 * Só a PRIMEIRA saída da conversa conta. Da segunda em diante, quem escreve
 * está de fato atendendo, e vale a regra de sempre.
 *
 * E só quando a campanha tem agente no ar: devolver "para ninguém" tiraria a
 * conversa de quem enviou sem pôr ninguém no lugar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isManualMessageConfig } from "./schema";

/** A decisão, sem banco: o agente que continua a conversa, ou null. */
export function agenteQueContinua(dados: {
  /** `prospecting_campaigns.config` da campanha da conversa. */
  config: unknown;
  /** `conversations.last_outbound_at` ANTES do envio. */
  ultimaSaida: string | null;
  /** O agente existe, está publicado e não está pausado nem arquivado. */
  agenteNoAr: boolean;
}): string | null {
  if (!isManualMessageConfig(dados.config)) return null;
  if (!dados.config.agent_id) return null;
  if (dados.ultimaSaida !== null) return null;
  return dados.agenteNoAr ? dados.config.agent_id : null;
}

/**
 * Lê o que a decisão precisa.
 *
 * A leitura de `last_outbound_at` sai na PRIMEIRA ida ao banco, junto com a do
 * candidato: a rota dispara esta função antes do envio e não espera por ela
 * (o envio não pode ficar mais lento por causa disto), então a pergunta "a
 * conversa já teve saída?" precisa chegar ao banco antes de o envio gravar a
 * resposta. Se chegar depois, a conversa parece já ter saída e o resultado é
 * null — o caminho de sempre, nunca uma devolução indevida.
 *
 * `admin` é o client de service role: as tabelas da prospecção não têm grant
 * para a sessão. Toda leitura filtra `organization_id` na mão.
 *
 * Conversa que não nasceu da prospecção para na primeira ida.
 */
export async function agenteDaAberturaManual(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
): Promise<string | null> {
  const [{ data: candidato }, { data: conversa }] = await Promise.all([
    admin
      .from("prospecting_candidates")
      .select("campaign_id")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("conversations")
      .select("last_outbound_at")
      .eq("organization_id", organizationId)
      .eq("id", conversationId)
      .maybeSingle(),
  ]);
  const campanhaId = (candidato as { campaign_id?: string } | null)?.campaign_id;
  const ultimaSaida = (conversa as { last_outbound_at: string | null } | null)?.last_outbound_at;
  if (!campanhaId || !conversa || ultimaSaida) return null;

  const { data: campanha } = await admin
    .from("prospecting_campaigns")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .maybeSingle();
  const config = (campanha as { config?: unknown } | null)?.config;
  if (!isManualMessageConfig(config) || !config.agent_id) return null;

  const { data: agente } = await admin
    .from("ai_agents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", config.agent_id)
    .not("published_version_id", "is", null)
    .is("paused_at", null)
    .is("archived_at", null)
    .maybeSingle();

  return agenteQueContinua({ config, ultimaSaida: ultimaSaida ?? null, agenteNoAr: !!agente });
}
