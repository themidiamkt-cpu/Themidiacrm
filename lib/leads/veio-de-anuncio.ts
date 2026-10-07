/**
 * "Esta pessoa chegou por um anúncio online?" — uma resposta só, para o
 * roteador de agentes e para o gatilho de follow-up.
 *
 * Lê `contacts.source_metadata`, que a ingestão carimba no PRIMEIRO toque
 * (`fn_estampar_atribuicao_de_anuncio`). São dois caminhos, e cada um deixa uma
 * marca diferente (ver `origem-do-contato.ts`):
 *
 *   - **clique para o WhatsApp** (Meta) e **clique do Google**: `ad_platform`
 *     com o nome da plataforma. É anúncio por definição.
 *   - **site ou página com botão de WhatsApp**: `ad_platform: "site"` e as UTMs
 *     achatadas. Aqui "veio do site" não basta — visita orgânica também passa
 *     pelo botão. Só conta quando a origem traz sinal de mídia paga: o clique do
 *     Google (`gclid`), uma campanha, conjunto ou anúncio nomeados, ou um
 *     `utm_medium` de mídia paga.
 *
 * Módulo puro, de propósito: roda no turno do agente, onde uma dúvida tem de
 * valer "não" em vez de erro.
 */

/** `utm_medium` que quem roda tráfego usa para mídia paga. Comparado sem caixa e sem separador. */
const MEIOS_PAGOS: ReadonlySet<string> = new Set([
  "cpc",
  "ppc",
  "cpm",
  "cpv",
  "paid",
  "paidsocial",
  "paidsearch",
  "ads",
  "ad",
  "anuncio",
  "anuncios",
  "trafegopago",
  "display",
]);

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;

export function veioDeAnuncio(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const meta = metadata as Record<string, unknown>;

  const plataforma = texto(meta.ad_platform)?.toLowerCase() ?? null;
  if (plataforma !== null && plataforma !== "site") return true;

  if (texto(meta.gclid)) return true;
  if (texto(meta.utm_campaign) || texto(meta.utm_adset) || texto(meta.utm_ad)) return true;
  const meio = texto(meta.utm_medium)
    ?.toLowerCase()
    .replace(/[\s_-]+/g, "");
  return meio !== undefined && meio !== null && MEIOS_PAGOS.has(meio);
}
