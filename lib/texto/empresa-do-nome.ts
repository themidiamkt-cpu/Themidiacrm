/**
 * `{{empresa}}`: o nome do contato como alguém falaria.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * Contato que veio de prospecção traz o nome do PERFIL ou do Maps, com bio e
 * slogan grudados ("Dra Natália Rocha | Harmonização Facial, Botox, Fios de
 * PDO."). `{{nome}}` entregaria isso inteiro, o que denuncia o envio em massa na
 * primeira linha. `{{empresa}}` corta na primeira bio e devolve o nome curto.
 *
 * ─── Por que devolve `null` em vez de um texto ruim ─────────────────────────
 *
 * Nome vazio, ou longo demais mesmo depois do corte, não vira "encontramos a
 * ." nem um parágrafo de bio. Quem chama decide: a Campanha exclui a pessoa
 * antes do envio, o follow-up não envia, o Inbox mantém a marcação visível.
 *
 * Módulo puro, sem imports: a Campanha, o Inbox, o follow-up e a Prospecção
 * usam a mesma régua.
 */

/** Acima disso o nome ainda é bio, não nome. */
export const EMPRESA_MAX = 60;

/** Separadores de bio: pipes (um ou mais), pontos de lista, travessão com espaço e dois-pontos. */
const CORTE = /\s*[|•·]+\s*|\s+[-–—]\s+|:\s+/;

/**
 * O nome como alguém falaria. No Google Maps e no Instagram o nome costuma vir
 * com slogan, bairro e lista de serviços grudados.
 */
export function nomeCurto(name: string): string {
  const primeiro = name.split(CORTE)[0] ?? name;
  const limpo = primeiro.replace(/\s+/g, " ").trim();
  return (limpo.length >= 2 ? limpo : name.trim()).slice(0, 80);
}

/** O valor de `{{empresa}}`, ou `null` quando não há nome utilizável. */
export function empresaDoNome(nome: string | null | undefined): string | null {
  const bruto = (nome ?? "").trim();
  if (bruto === "") return null;
  const curto = nomeCurto(bruto);
  if (curto === "" || curto.length > EMPRESA_MAX) return null;
  return curto;
}

/** As marcações do vocabulário de contato. */
const MARCACAO = /\{\{\s*(nome|primeiro_nome|empresa)\s*\}\}/gi;

/**
 * Troca `{{nome}}`, `{{primeiro_nome}}` e `{{empresa}}` pelos dados do contato.
 * O que não tem valor NÃO é trocado: volta em `faltando` e o texto mantém a
 * marcação, para quem chama recusar o envio.
 */
export function interpolarContato(
  texto: string,
  nome: string | null | undefined,
): { texto: string; faltando: string[] } {
  const cheio = (nome ?? "").trim();
  const faltando = new Set<string>();
  const out = texto.replace(MARCACAO, (literal, bruto: string) => {
    const chave = bruto.toLowerCase();
    const valor =
      chave === "nome"
        ? cheio
        : chave === "primeiro_nome"
          ? (cheio.split(/\s+/)[0] ?? "")
          : (empresaDoNome(cheio) ?? "");
    if (valor === "") {
      faltando.add(chave);
      return literal;
    }
    return valor;
  });
  return { texto: out, faltando: [...faltando] };
}
