"use client";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { useRetornosDeProcedimentos } from "@/hooks/procedimentos/useRetornos";
import type { ItemDaFila } from "@/lib/procedimentos/retornos";

/** `YYYY-MM-DD` mostrado como dia civil, sem passar por fuso. */
function dia(iso: string | null): string {
  return iso ? new Date(`${iso}T12:00:00`).toLocaleDateString() : "—";
}

const ROTULO_DO_ESTADO: Record<string, { texto: string; tom: "neutral" | "success" | "warning" }> =
  {
    aguardando: { texto: "Aguardando o vencimento", tom: "neutral" },
    aguardando_envio: { texto: "Venceu, aguardando o envio", tom: "warning" },
    enviado: { texto: "Enviado", tom: "success" },
    expirado: { texto: "Vencido, não enviado", tom: "warning" },
    sem_numero: { texto: "Sem telefone", tom: "warning" },
    contato_bloqueado: { texto: "Contato bloqueado", tom: "warning" },
    sem_procedimento: { texto: "Procedimento removido", tom: "warning" },
    falhou: { texto: "Falhou", tom: "warning" },
  };

const ROTULO_DO_ESTADO_FILA = ROTULO_DO_ESTADO;

/** A tabela de pessoas — usada na janela "Pessoas no fluxo" do cartão e na aba Fila. */
function TabelaDePessoas({ itens }: { itens: ItemDaFila[] }) {
  const t = useT();
  const atrasados = itens.some((i) => i.estado === "aguardando_envio");
  return (
    <>
      {atrasados && (
        <p
          className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-text-muted"
          data-testid="aviso-de-envio-parado"
        >
          {t(
            "Quem venceu e ainda não recebeu está esperando o horário de envio do WhatsApp (7h–22h) ou o canal está em modo de teste. Em Conexões › Configurar acesso da IA você libera o canal ou inclui o número na lista de teste.",
          )}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Contato")}</TableHead>
            <TableHead>{t("Procedimento")}</TableHead>
            <TableHead>{t("Feito em")}</TableHead>
            <TableHead>{t("Retorno em")}</TableHead>
            <TableHead>{t("Situação")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => {
            const estado = ROTULO_DO_ESTADO_FILA[item.estado] ?? ROTULO_DO_ESTADO_FILA.aguardando!;
            return (
              <TableRow key={item.id}>
                <TableCell>
                  {item.contact_id ? (
                    <Link className="underline" href={`/app/contacts/${item.contact_id}`}>
                      {item.paciente}
                    </Link>
                  ) : (
                    item.paciente
                  )}
                </TableCell>
                <TableCell>{item.procedimento}</TableCell>
                <TableCell>{dia(item.realizado_em)}</TableCell>
                <TableCell>{dia(item.vence_em)}</TableCell>
                <TableCell>
                  <Badge variant={estado.tom}>{t(estado.texto)}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}

/**
 * "Pessoas no fluxo" de um procedimento: quem está esperando o retorno (primeiro,
 * por vencimento) e o que aconteceu com os últimos envios. Abre pelo cartão.
 */
function PessoasDoRetorno({
  nome,
  itens,
  aberto,
  onFechar,
}: {
  nome: string;
  itens: ItemDaFila[];
  aberto: boolean;
  onFechar: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-3xl" data-testid="pessoas-do-retorno">
        <DialogHeader>
          <DialogTitle>
            {t("Pessoas no fluxo")} · {nome}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Quem espera o retorno deste procedimento e o que aconteceu com os últimos envios (30 dias).",
            )}
          </DialogDescription>
        </DialogHeader>
        {itens.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            {t("Ninguém neste retorno por enquanto.")}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <TabelaDePessoas itens={itens} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aba "Fluxos" da tela Follow-ups: o retorno automático de cada procedimento,
 * no mesmo formato dos fluxos. Não é um fluxo do motor (o envio é o cron de
 * procedimentos), mas responde à mesma pergunta de quem opera: "o que o CRM vai
 * mandar sozinho, e para quantas pessoas?". Some sem catálogo ou sem o recurso.
 */
export function RetornosNosFluxos({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const { data, isError } = useRetornosDeProcedimentos();
  const [aberto, setAberto] = useState<string | null>(null);
  if (isError || !data || data.procedimentos.length === 0) return null;

  return (
    <section className="mb-6" data-testid="retornos-nos-fluxos">
      <h2 className="mb-1 text-sm font-medium">{t("Retorno automático de procedimentos")}</h2>
      <p className="mb-3 text-xs text-text-muted">
        {t("Mensagem enviada sozinha quando o prazo de cada procedimento vence.")}
      </p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.procedimentos.map((p) => (
          <li key={p.id}>
            <Card className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {t("Retorno")} · {p.nome}
                </h3>
                <Badge variant={p.ativo ? "success" : "neutral"}>
                  {p.ativo ? t("Ativo") : t("Pausado")}
                </Badge>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">{t("Validade")}</dt>
                  <dd className="font-mono">
                    {p.meses_validade} {p.meses_validade === 1 ? t("mês") : t("meses")}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("Pessoas no fluxo")}</dt>
                  <dd className="font-mono">{p.aguardando}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("Enviados (30 dias)")}</dt>
                  <dd className="font-mono">{p.enviados_30d}</dd>
                </div>
              </dl>
              <p className="text-xs text-text-muted">
                {t("Próximo retorno")}: {dia(p.proximo_vencimento)}
              </p>
              <div className="mt-auto flex items-center justify-end gap-3 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAberto(p.id)}
                  data-testid={`ver-pessoas-${p.id}`}
                >
                  {t("Ver pessoas")}
                </Button>
                {canWrite && (
                  <Link className="text-xs underline" href="/app/settings/procedimentos">
                    {t("Editar mensagem e etapa")}
                  </Link>
                )}
              </div>
              <PessoasDoRetorno
                nome={p.nome}
                itens={data.fila.filter((i) => i.procedimento_id === p.id)}
                aberto={aberto === p.id}
                onFechar={() => setAberto(null)}
              />
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Aba "Fila" da tela Follow-ups: quem vai receber o retorno e o que aconteceu nos últimos envios. */
export function RetornosNaFila() {
  const t = useT();
  const { data, isError } = useRetornosDeProcedimentos();
  if (isError || !data || data.fila.length === 0) return null;

  return (
    <section className="mb-6" data-testid="retornos-na-fila">
      <h2 className="mb-3 text-sm font-medium">{t("Retornos de procedimentos")}</h2>
      <Card className="overflow-x-auto p-0">
        <TabelaDePessoas itens={data.fila} />
      </Card>
    </section>
  );
}
