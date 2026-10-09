/**
 * A configuração do organizador de funil, lida de `crm_pipelines.settings.organizador`.
 *
 * Mora num arquivo só dela porque a TELA também lê (Configurações › Etapas do
 * funil), e `organizador.ts` importa banco e chamada de modelo: uma tela que o
 * importasse levaria o servidor para o navegador.
 */

export interface ConfigDoOrganizador {
  ligado: boolean;
  /** Texto livre de quem configura: como reconhecer cada etapa deste funil. */
  instrucoes: string;
}

export const TAMANHO_MAXIMO_DAS_INSTRUCOES = 4000;

/** Qualquer coisa fora do formato é "desligado": funil que ninguém ligou fica como sempre foi. */
export function lerConfigDoOrganizador(settings: unknown): ConfigDoOrganizador {
  const bruto =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).organizador
      : null;
  if (!bruto || typeof bruto !== "object") return { ligado: false, instrucoes: "" };
  const o = bruto as Record<string, unknown>;
  return {
    ligado: o.ligado === true,
    instrucoes:
      typeof o.instrucoes === "string" ? o.instrucoes.slice(0, TAMANHO_MAXIMO_DAS_INSTRUCOES) : "",
  };
}
