/**
 * Qual funil abre quando a pessoa clica em "Funis" no menu.
 *
 * Antes o menu levava a uma LISTA de funis e só dali se chegava ao quadro: um
 * clique a mais em todo acesso, para uma organização que quase sempre tem um
 * funil que importa. Agora o menu abre o quadro direto; a lista (que também é
 * onde se renomeia, reordena e arquiva) continua em `/app/kanban?gerenciar=1`,
 * pelo link "Gerenciar funis" do seletor.
 *
 * A escolha: o último funil que a pessoa abriu (cookie), se ele ainda existe e
 * não está arquivado; senão o funil padrão; senão o primeiro. O cookie NUNCA
 * decide sozinho: o id é conferido contra a lista da organização ativa, então um
 * valor velho ou de outra organização cai no padrão.
 */
export const COOKIE_DO_FUNIL_ATUAL = "funil_atual";

export interface FunilEscolhivel {
  id: string;
  is_default?: boolean | null;
}

export function funilDeEntrada<T extends FunilEscolhivel>(
  funis: readonly T[],
  idDoCookie: string | null | undefined,
): T | null {
  if (funis.length === 0) return null;
  const doCookie = idDoCookie ? funis.find((f) => f.id === idDoCookie) : undefined;
  return doCookie ?? funis.find((f) => f.is_default) ?? funis[0] ?? null;
}
