"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { useFollowupFlowPeople } from "@/hooks/followup/useFollowupFlowPeople";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { rotuloDoStatus, tomDoStatus } from "@/lib/followup/eventos-legiveis";
import type { PessoaNoPasso, PessoasDoPasso } from "@/lib/followup/pessoas-no-fluxo";
import { X } from "@/lib/ui/icons";

/**
 * Quem está em cada passo do fluxo — UMA leitura para todos os cards do canvas.
 *
 * O construtor desenhava o fluxo e não dizia quem o percorre. Cada card mostra
 * quantas pessoas estão nele; o clique abre a lista, com atalho para o dossiê de
 * cada uma. Os números vêm dos enrollments reais, que seguem a versão PUBLICADA:
 * um passo que só existe no rascunho aparece vazio até publicar.
 */
interface Valor {
  doPasso: (nodeId: string) => PessoasDoPasso | null;
  /** Passo cuja lista está aberta. */
  aberto: string | null;
  abrir: (nodeId: string | null) => void;
  totalVivos: number;
  truncado: boolean;
  janelaDosEncerradosDias: number;
}

const VAZIO: Valor = {
  doPasso: () => null,
  aberto: null,
  abrir: () => {},
  totalVivos: 0,
  truncado: false,
  janelaDosEncerradosDias: 30,
};

const Contexto = createContext<Valor>(VAZIO);

export function PessoasDoFluxoProvider({
  flowId,
  children,
}: {
  flowId: string;
  children: ReactNode;
}) {
  const { data } = useFollowupFlowPeople(flowId);
  const [aberto, abrir] = useState<string | null>(null);
  const valor = useMemo<Valor>(
    () => ({
      doPasso: (nodeId) => data?.passos[nodeId] ?? null,
      aberto,
      abrir,
      totalVivos: data?.total_vivos ?? 0,
      truncado: data?.truncado ?? false,
      janelaDosEncerradosDias: data?.janela_dos_encerrados_dias ?? 30,
    }),
    [data, aberto],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePessoasDoFluxo(): Valor {
  return useContext(Contexto);
}

function LinhaDaPessoa({ pessoa, vivo }: { pessoa: PessoaNoPasso; vivo: boolean }) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const desde = new Date(pessoa.updated_at);
  const proximo = pessoa.next_eval_at ? new Date(pessoa.next_eval_at) : null;
  return (
    <li className="border-t border-border/60 px-3 py-2 first:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/app/ai/followups/enrollments/${pessoa.enrollment_id}`}
          className="min-w-0 truncate text-sm font-medium text-text underline-offset-2 hover:underline"
          title={pessoa.contact.name}
        >
          {pessoa.contact.name}
        </Link>
        <Badge variant={tomDoStatus(pessoa.status)} className="shrink-0">
          {rotuloDoStatus(pessoa.status, t)}
        </Badge>
      </div>
      <p
        className="mt-0.5 text-xs text-text-muted"
        title={format(desde, "dd/MM/yyyy HH:mm", { locale: localeDaData })}
      >
        {vivo ? t("Neste passo") : t("Saiu")}{" "}
        {formatDistanceToNowStrict(desde, { addSuffix: true, locale: localeDaData })}
        {vivo && proximo && (
          <>
            {" · "}
            {t("próxima ação")}{" "}
            {formatDistanceToNowStrict(proximo, { addSuffix: true, locale: localeDaData })}
          </>
        )}
      </p>
    </li>
  );
}

/**
 * A lista de pessoas do passo aberto, flutuando sobre o canvas. Fica por cima do
 * desenho, não no painel de configuração: quem quer ver gente não quer editar o nó.
 */
export function PainelDePessoas({ rotuloDoNo }: { rotuloDoNo: (nodeId: string) => string }) {
  const t = useT();
  const { aberto, abrir, doPasso, truncado, janelaDosEncerradosDias } = usePessoasDoFluxo();
  if (!aberto) return null;
  const pessoas = doPasso(aberto);
  const vivos = pessoas?.vivos ?? [];
  const encerrados = pessoas?.encerrados ?? [];
  return (
    <aside
      className="absolute top-3 right-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      data-testid="flow-people-panel"
      aria-label={t("Pessoas neste passo")}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{t("Pessoas neste passo")}</p>
          <p className="truncate text-sm font-semibold text-text" title={rotuloDoNo(aberto)}>
            {rotuloDoNo(aberto)}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-text-muted hover:bg-muted hover:text-text"
          onClick={() => abrir(null)}
          aria-label={t("Fechar")}
        >
          <X size={14} aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {vivos.length === 0 && encerrados.length === 0 && (
          <p className="px-3 py-4 text-sm text-text-muted">{t("Ninguém neste passo agora.")}</p>
        )}
        {vivos.length > 0 && (
          <section>
            <p className="bg-muted/40 px-3 py-1 text-xs font-medium text-text-muted">
              {t("Aqui agora")} · {vivos.length}
            </p>
            <ul>
              {vivos.map((p) => (
                <LinhaDaPessoa key={p.enrollment_id} pessoa={p} vivo />
              ))}
            </ul>
          </section>
        )}
        {encerrados.length > 0 && (
          <section>
            <p className="bg-muted/40 px-3 py-1 text-xs font-medium text-text-muted">
              {t("Saíram por aqui")} · {encerrados.length} ({t("últimos")} {janelaDosEncerradosDias}{" "}
              {t("dias")})
            </p>
            <ul>
              {encerrados.map((p) => (
                <LinhaDaPessoa key={p.enrollment_id} pessoa={p} vivo={false} />
              ))}
            </ul>
          </section>
        )}
      </div>
      {truncado && (
        <p className="border-t border-border px-3 py-2 text-xs text-text-muted">
          {t("Há mais pessoas do que esta lista mostra. A Fila tem a lista inteira.")}
        </p>
      )}
    </aside>
  );
}
