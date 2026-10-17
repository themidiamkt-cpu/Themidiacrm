"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { apiClient } from "@/lib/api/client";
import { PaperPlaneTilt } from "@/lib/ui/icons";

/**
 * "Enviar" a mensagem pronta direto do cartão do funil.
 *
 * ─── Por que confirma antes ─────────────────────────────────────────────────
 *
 * O cartão é pequeno, arrastável e fica ao lado de outros iguais: um clique
 * perdido mandaria WhatsApp a um cliente de verdade, e mensagem enviada não
 * volta. Por isso o botão abre uma confirmação com o TEXTO que vai sair, e só
 * o segundo clique envia.
 *
 * ─── Mesmo caminho do Inbox ─────────────────────────────────────────────────
 *
 * Envia por `useSendMessage` (o mesmo do Composer): a mensagem sai como envio
 * humano, a IA é silenciada na conversa e o consumo do rascunho segue a mesma
 * rota (`drafts/consume`), fire-and-forget como lá. O texto vem do servidor
 * (rascunho guardado), nunca digitado aqui.
 */
export function EnviarMensagemPronta({
  conversationId,
  rascunho,
}: {
  conversationId: string;
  rascunho: { id: string; texto: string };
}) {
  const t = useT();
  const qc = useQueryClient();
  const send = useSendMessage();
  const [confirmando, setConfirmando] = useState(false);

  // O cartão inteiro arrasta e abre o dossiê: nada daqui pode vazar para ele.
  const isolar = (e: MouseEvent) => e.stopPropagation();

  function enviar() {
    if (send.isPending) return;
    send.mutate(
      { conversation_id: conversationId, body: rascunho.texto, type: "text" },
      {
        onSuccess: () => {
          setConfirmando(false);
          toast.success(t("Mensagem enviada"));
          void apiClient
            .post(`/api/v1/conversations/${conversationId}/drafts/consume`, {
              draft_id: rascunho.id,
            })
            .catch(() => {
              /* a mensagem já saiu; o consumo não pode virar erro de envio */
            })
            .finally(() => {
              void qc.invalidateQueries({ queryKey: ["board"] });
            });
        },
      },
    );
  }

  if (!confirmando) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-1 h-7 w-full gap-1.5 text-[11px]"
        onClick={(e) => {
          isolar(e);
          setConfirmando(true);
        }}
        onPointerDown={isolar}
        data-testid="enviar-mensagem-pronta"
      >
        <PaperPlaneTilt size={12} weight="fill" aria-hidden />
        {t("Enviar mensagem pronta")}
      </Button>
    );
  }

  return (
    <div
      className="mt-1 rounded-md border border-border bg-muted/40 p-2 text-[11px]"
      onClick={isolar}
      onPointerDown={isolar}
      data-testid="confirmar-mensagem-pronta"
    >
      <p className="mb-1 text-text-muted">{t("Esta mensagem será enviada ao cliente agora:")}</p>
      <p className="mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap text-foreground">
        {rascunho.texto}
      </p>
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-7 flex-1 text-[11px]"
          disabled={send.isPending}
          onClick={enviar}
          data-testid="confirmar-envio"
        >
          {send.isPending ? t("Enviando...") : t("Enviar agora")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          disabled={send.isPending}
          onClick={() => setConfirmando(false)}
        >
          {t("Cancelar")}
        </Button>
      </div>
    </div>
  );
}
