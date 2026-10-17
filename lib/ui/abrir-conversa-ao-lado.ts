import type { MouseEvent } from "react";

/**
 * Abre a conversa numa janela estreita ao lado, em vez de trocar de tela.
 *
 * Quem está enviando uma lista de abordagens perdia a posição a cada conversa:
 * ia para o Inbox, voltava, procurava a próxima empresa. A janela tem sempre o
 * mesmo nome, então o clique seguinte reaproveita a mesma janela, venha ele da
 * Prospecção ou do cartão do funil. É uma janela do navegador, e não uma
 * moldura dentro da página, porque o produto proíbe ser emoldurado
 * (`X-Frame-Options: DENY`) — e essa proteção fica.
 *
 * Com Ctrl, Cmd, Shift ou botão do meio o link segue como link comum; e, se o
 * navegador bloquear a janela, a navegação normal acontece.
 */
export const NOME_DA_JANELA_DO_INBOX = "prospeccao-inbox";

export function abrirConversaAoLado(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    return;
  }
  const largura = 520;
  const altura = Math.min(860, window.screen.availHeight - 40);
  const esquerda = Math.max(0, window.screenX + window.outerWidth - largura - 16);
  const topo = Math.max(0, window.screenY + 40);
  const janela = window.open(
    event.currentTarget.href,
    NOME_DA_JANELA_DO_INBOX,
    `popup=yes,width=${largura},height=${altura},left=${esquerda},top=${topo}`,
  );
  if (!janela) return;
  event.preventDefault();
  janela.focus();
}
