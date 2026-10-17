/**
 * Botão "Enviar mensagem pronta" do cartão do funil.
 * O contrato que importa: um clique só ABRE a confirmação (nada sai), o
 * segundo clique envia pelo mesmo caminho do Inbox, e o rascunho é consumido.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mutate = vi.fn();
const post = vi.fn(() => Promise.resolve({}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate, isPending: false }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...a: unknown[]) => post(...(a as [])) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { EnviarMensagemPronta } from "./EnviarMensagemPronta";

const RASCUNHO = { id: "d1", texto: "Oi, tudo bem? Vi seu perfil." };

function montar() {
  const pai = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <div onClick={pai}>
        <EnviarMensagemPronta conversationId="c1" rascunho={RASCUNHO} />
      </div>
    </QueryClientProvider>,
  );
  return pai;
}

describe("EnviarMensagemPronta", () => {
  beforeEach(() => {
    mutate.mockReset();
    post.mockClear();
  });

  it("o primeiro clique só abre a confirmação com o texto, sem enviar", () => {
    const pai = montar();
    fireEvent.click(screen.getByTestId("enviar-mensagem-pronta"));
    expect(screen.getByText(RASCUNHO.texto)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    expect(pai).not.toHaveBeenCalled(); // não vaza para o cartão (dossiê)
  });

  it("confirmar envia o texto do rascunho como mensagem de texto", () => {
    montar();
    fireEvent.click(screen.getByTestId("enviar-mensagem-pronta"));
    fireEvent.click(screen.getByTestId("confirmar-envio"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      conversation_id: "c1",
      body: RASCUNHO.texto,
      type: "text",
    });
  });

  it("depois do envio consome o rascunho", () => {
    montar();
    fireEvent.click(screen.getByTestId("enviar-mensagem-pronta"));
    fireEvent.click(screen.getByTestId("confirmar-envio"));
    const opcoes = mutate.mock.calls[0]![1] as { onSuccess: () => void };
    opcoes.onSuccess();
    expect(post).toHaveBeenCalledWith("/api/v1/conversations/c1/drafts/consume", {
      draft_id: "d1",
    });
  });

  it("cancelar volta ao botão sem enviar", () => {
    montar();
    fireEvent.click(screen.getByTestId("enviar-mensagem-pronta"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.getByTestId("enviar-mensagem-pronta")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
