"use client";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

/** `YYYY-MM-DD` mostrado como dia civil, sem passar por fuso. */
function dia(iso: string | null): string {
  return iso ? new Date(`${iso}T12:00:00`).toLocaleDateString() : "—";
}

const ROTULO_DO_ESTADO: Record<string, { texto: string; tom: "neutral" | "success" | "warning" }> = {
  aguardando: { texto: "Aguardando o vencimento", tom: "neutral" },
  enviado: { texto: "Enviado", tom: "success" },
  expirado: { texto: "Vencido, não enviado", tom: "warning" },
  sem_numero: { texto: "Sem telefone", tom: "warning" },
  contato_bloqueado: { texto: "Contato bloqueado", tom: "warning" },
  sem_procedimento: { texto: "Procedimento removido", tom: "warning" },
  falhou: { texto: "Falhou", tom: "warning" },
};

/**
 * Aba "Fluxos" da tela Follow-ups: o retorno automático de cada procedimento,
 * no mesmo formato dos fluxos. Não é um fluxo do motor (o envio é o cron de
 * procedimentos), mas responde à mesma pergunta de quem opera: "o que o CRM vai
 * mandar sozinho, e para quantas pessoas?". Some sem catálogo ou sem o recurso.
 */
export function RetornosNosFluxos({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const { data, isError } = useRetornosDeProcedimentos();
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
                <Badge variant={p.ativo ? "success" : "neutral"}>{p.ativo ? t("Ativo") : t("Pausado")}</Badge>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">{t("Validade")}</dt>
                  <dd className="font-mono">
                    {p.meses_validade} {p.meses_validade === 1 ? t("mês") : t("meses")}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("Aguardando")}</dt>
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
              {canWrite && (
                <div className="mt-auto flex justify-end border-t border-border pt-3">
                  <Link className="text-xs underline" href="/app/settings/procedimentos">
                    {t("Editar mensagem e etapa")}
                  </Link>
                </div>
              )}
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
            {data.fila.map((item) => {
              const estado = ROTULO_DO_ESTADO[item.estado] ?? ROTULO_DO_ESTADO.aguardando!;
              return (
                <TableRow key={item.id}>
                  <TableCell>{item.paciente}</TableCell>
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
      </Card>
    </section>
  );
}
