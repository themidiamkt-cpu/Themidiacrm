"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useProcedimentos } from "@/hooks/procedimentos/useProcedimentos";
import {
  useAtualizarProcedimentoDoLead,
  useExcluirProcedimentoDoLead,
  useProcedimentosDoLead,
  useRegistrarProcedimentoDoLead,
  type ProcedimentoDoLead,
} from "@/hooks/procedimentos/useProcedimentosDoLead";

/** `YYYY-MM-DD` mostrado como dia civil, sem passar por fuso (meio-dia evita virar o dia). */
function dia(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString();
}

/**
 * Seção "Procedimentos" do dossiê: o que o paciente agendou ou já fez. É daqui
 * que nasce o retorno automático — marcar como REALIZADO começa a contar a
 * validade do procedimento; no vencimento o CRM manda a mensagem cadastrada em
 * Configurações → Procedimentos.
 *
 * Some sozinha quando o recurso não está ativado (404): mesmo critério de
 * `PropostasDoNegocio`.
 */
export function ProcedimentosDoNegocio({ leadId }: { leadId: string }): React.ReactElement | null {
  const t = useT();
  const { data: registros, isLoading, isError } = useProcedimentosDoLead(leadId);
  const { data: catalogo } = useProcedimentos();
  const registrar = useRegistrarProcedimentoDoLead(leadId);
  const atualizar = useAtualizarProcedimentoDoLead(leadId);
  const excluir = useExcluirProcedimentoDoLead(leadId);

  const [adicionando, setAdicionando] = useState(false);
  const [procedimentoId, setProcedimentoId] = useState("");
  const [status, setStatus] = useState<"agendado" | "realizado">("realizado");
  const [data, setData] = useState("");

  if (isError || isLoading) return null;
  const ativos = (catalogo ?? []).filter((p) => p.ativo);

  function rotulo(r: ProcedimentoDoLead): string {
    if (r.status === "cancelado") return t("Cancelado");
    if (r.status === "agendado") {
      return r.agendado_para ? `${t("Agendado para")} ${dia(r.agendado_para)}` : t("Agendado");
    }
    const feito = r.realizado_em ? `${t("Feito em")} ${dia(r.realizado_em)}` : t("Feito");
    if (r.lembrete_resultado === "enviado" && r.lembrete_enviado_em) {
      return `${feito} · ${t("retorno enviado em")} ${new Date(r.lembrete_enviado_em).toLocaleDateString()}`;
    }
    if (r.lembrete_resultado === "expirado") return `${feito} · ${t("retorno vencido, não enviado")}`;
    if (r.lembrete_resultado) return `${feito} · ${t("retorno não enviado")}`;
    return r.vence_em ? `${feito} · ${t("retorno em")} ${dia(r.vence_em)}` : feito;
  }

  function salvar() {
    if (!procedimentoId) return;
    if (status === "agendado" && !data) {
      toast.info(t("Informe a data do agendamento."));
      return;
    }
    registrar.mutate(
      {
        procedimento_id: procedimentoId,
        status,
        // Realizado sem data = HOJE, resolvido pelo servidor no fuso da organização.
        ...(status === "agendado" ? { agendado_para: data } : data ? { realizado_em: data } : {}),
      },
      {
        onSuccess: () => {
          setAdicionando(false);
          setProcedimentoId("");
          setData("");
        },
      },
    );
  }

  return (
    <section className="border-t border-border py-3" data-testid="procedimentos-do-negocio">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">{t("Procedimentos")}</h3>
        {!adicionando && ativos.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAdicionando(true)}>
            {t("Adicionar")}
          </Button>
        )}
      </div>

      {(registros ?? []).length === 0 && !adicionando && (
        <p className="text-xs text-text-muted">
          {ativos.length === 0
            ? t("Cadastre procedimentos em Configurações → Procedimentos.")
            : t("Nenhum procedimento registrado.")}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {(registros ?? []).map((r) => (
          <li key={r.id} className="rounded-md border border-border p-2 text-xs">
            <p className="font-medium">{r.nome}</p>
            <p className="text-text-muted">{rotulo(r)}</p>
            <div className="mt-1 flex gap-1">
              {r.status === "agendado" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  disabled={atualizar.isPending}
                  onClick={() => atualizar.mutate({ id: r.id, status: "realizado" })}
                >
                  {t("Marcar como realizado")}
                </Button>
              )}
              {r.status !== "cancelado" && !(r.status === "realizado" && r.lembrete_resultado === "enviado") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  disabled={atualizar.isPending}
                  onClick={() => atualizar.mutate({ id: r.id, status: "cancelado" })}
                >
                  {t("Cancelar")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                disabled={excluir.isPending}
                onClick={() => excluir.mutate(r.id)}
              >
                {t("Remover")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {adicionando && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs" data-testid="registrar-procedimento">
          <select
            className="h-8 rounded-md border border-input bg-background px-2"
            value={procedimentoId}
            onChange={(e) => setProcedimentoId(e.target.value)}
            aria-label={t("Procedimento")}
          >
            <option value="">{t("Escolha o procedimento")}</option>
            {ativos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.meses_validade} {p.meses_validade === 1 ? t("mês") : t("meses")})
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <label className="flex items-center gap-1">
              <input type="radio" checked={status === "realizado"} onChange={() => setStatus("realizado")} />
              {t("Já foi feito")}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={status === "agendado"} onChange={() => setStatus("agendado")} />
              {t("Agendado")}
            </label>
          </div>
          <label className="flex flex-col gap-1">
            {status === "agendado" ? t("Data do agendamento") : t("Data em que foi feito (vazio = hoje)")}
            <input
              type="date"
              className="h-8 rounded-md border border-input bg-background px-2"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={!procedimentoId || registrar.isPending} onClick={salvar}>
              {registrar.isPending ? t("Salvando...") : t("Salvar")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdicionando(false)}>
              {t("Cancelar")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
