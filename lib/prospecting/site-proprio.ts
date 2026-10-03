/**
 * A empresa da busca tem site PRÓPRIO? Regra única, usada na preparação da
 * abordagem manual (servidor) e no filtro da tabela de resultados (tela).
 *
 * Módulo puro de propósito: `manual-message.ts` puxa a camada de IA, que não
 * pode ir para o navegador; esta regra precisa ir.
 */

/**
 * Marcas que aparecem no campo "site" do Google Maps e NÃO são site da empresa:
 * rede social, link de conversa, vitrine e agregador. A comparação é com o
 * RÓTULO do domínio (o trecho entre os pontos), não com o endereço inteiro — é o
 * que faz valer para qualquer terminação de país e mantém este arquivo sem
 * endereço de terceiro escrito.
 */
const MARCAS_QUE_NAO_SAO_SITE: ReadonlySet<string> = new Set([
  "instagram",
  "facebook",
  "fb",
  "whatsapp",
  "wa",
  "linktr",
  "linktree",
  "tiktok",
  "youtube",
  "youtu",
  "twitter",
  "linkedin",
  "olx",
  "ifood",
  "goo",
]);

/**
 * A empresa tem um site DELA? Perfil em rede social, link de WhatsApp e
 * agregadores não contam: quem só tem Instagram no campo "site" é exatamente o
 * público de uma oferta de site.
 */
export function temSiteProprio(website: string | null | undefined): boolean {
  if (!website) return false;
  let rotulos: string[];
  try {
    rotulos = new URL(website).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .split(".");
  } catch {
    return false;
  }
  if (rotulos.length < 2 || rotulos.some((r) => !r)) return false;
  if (rotulos.some((r) => MARCAS_QUE_NAO_SAO_SITE.has(r))) return false;
  // A rede que virou uma letra só: vale apenas como domínio inteiro.
  if (rotulos.length === 2 && rotulos[0] === "x") return false;
  // Do Google, só o construtor de sites é página da empresa; e-mail, mapa e a
  // página curta do perfil não são. A vitrine antiga do perfil ("business" +
  // "site") também era só o espelho do Maps.
  if (rotulos.includes("google") && rotulos[0] !== "sites") return false;
  if (rotulos.at(-1) === "page" && rotulos.includes("g")) return false;
  if (rotulos.at(-1) === "site" && rotulos.at(-2) === "business") return false;
  return true;
}
