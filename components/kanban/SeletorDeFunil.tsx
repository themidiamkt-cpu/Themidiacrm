"use client";
import Link from "next/link";
import { useEffect } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { COOKIE_DO_FUNIL_ATUAL } from "@/lib/kanban/funil-atual";
import { CaretDown, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O título da tela do funil, que também TROCA de funil.
 *
 * Quem abre "Funis" no menu cai direto no quadro; o nome do funil vira uma lista
 * suspensa com os outros, e "Gerenciar funis" leva à lista de gestão (renomear,
 * reordenar, arquivar, importar). Escolher um funil grava o cookie que o menu usa
 * para abrir o MESMO funil da próxima vez.
 *
 * Com um funil só e sem permissão de gestão, não há o que escolher: vira só o título.
 */
export function SeletorDeFunil({
  atualId,
  atualNome,
  funis,
  podeGerenciar,
}: {
  atualId: string;
  atualNome: string;
  funis: Array<{ id: string; name: string }>;
  podeGerenciar: boolean;
}) {
  const t = useT();

  useEffect(() => {
    try {
      document.cookie = `${COOKIE_DO_FUNIL_ATUAL}=${encodeURIComponent(atualId)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* sem cookie, o menu abre o funil padrão */
    }
  }, [atualId]);

  const titulo = "min-w-0 truncate text-2xl font-semibold tracking-tight";
  if (funis.length <= 1 && !podeGerenciar) {
    return <h1 className={titulo}>{atualNome}</h1>;
  }

  return (
    <h1 className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            titulo,
            "flex max-w-full items-center gap-2 rounded-md px-2 py-1 -mx-2 text-left hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`${t("Trocar de funil")}: ${atualNome}`}
          data-testid="seletor-de-funil"
        >
          <span className="truncate">{atualNome}</span>
          <CaretDown size={20} className="shrink-0 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {funis.map((f) => (
            <DropdownMenuItem key={f.id} asChild>
              <Link
                href={`/app/pipelines/${f.id}`}
                aria-current={f.id === atualId ? "page" : undefined}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">{f.name}</span>
                {f.id === atualId && <Check size={14} aria-hidden />}
              </Link>
            </DropdownMenuItem>
          ))}
          {podeGerenciar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/kanban?gerenciar=1">{t("Gerenciar funis")}</Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </h1>
  );
}
