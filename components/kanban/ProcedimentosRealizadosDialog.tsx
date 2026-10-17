"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { useProcedimentos } from "@/hooks/procedimentos/useProcedimentos";
import { useRegistrarProcedimentoDoLead } from "@/hooks/procedimentos/useProcedimentosDoLead";

/**
 * "Procedimento realizado" — abre quando o negócio é movido para a etapa em que
 * a venda FECHOU. É o mesmo cadastro da seção "Procedimentos" do dossiê (procedimento
 * do catálogo + data), em formato de janela, e com uma diferença útil: dá para
 * marcar VÁRIOS procedimentos de uma vez (a venda costuma ter mais de um), todos
 * com a mesma data.
 *
 * Salvar começa a contar a validade de cada um (data realizada + meses do
 * catálogo) e, se o funil tem "Pós-venda", leva o cartão para lá — quem move é o
 * quadro, que recebe `onRegistrado`. "Agora não" fecha sem registrar e sem mover:
 * o cartão fica onde o operador o soltou.
 */
export function ProcedimentosRealizadosDialog({
  lead,
  posVenda,
  onClose,
  onRegistrado,
}: {
  lead: { id: string; title: string } | null;
  posVenda: { id: string; name: string } | null;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const t = useT();
  const { data: catalogo } = useProcedimentos();
  const registrar = useRegistrarProcedimentoDoLead(lead?.id ?? "");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [data, setData] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ativos = (catalogo ?? []).filter((p) => p.ativo);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function fechar() {
    setMarcados(new Set());
    setData("");
    onClose();
  }

  async function salvar() {
    if (marcados.size === 0 || salvando) return;
    setSalvando(true);
    try {
      // Um por vez: se um falhar o erro já foi mostrado e a janela continua aberta
      // com o que falta; os já salvos não são reenviados (saem de `marcados`).
      for (const id of [...marcados]) {
        await registrar.mutateAsync({
          procedimento_id: id,
          status: "realizado",
          // Sem data = HOJE, resolvido pelo servidor no fuso da organização.
          ...(data ? { realizado_em: data } : {}),
        });
        setMarcados((atual) => {
          const novo = new Set(atual);
          novo.delete(id);
          return novo;
        });
      }
      setData("");
      onRegistrado();
    } catch {
      /* o toast do erro já saiu pelo hook */
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!lead} onOpenChange={(aberto) => !aberto && !salvando && fechar()}>
      <DialogContent data-testid="procedimentos-realizados">
        <DialogHeader>
          <DialogTitle>{t("Procedimento realizado")}</DialogTitle>
          <DialogDescription>
            {lead?.title ? `${lead.title}: ` : ""}
            {t("marque o que foi feito. O prazo de retorno de cada procedimento começa a contar na data escolhida.")}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label={t("Procedimentos")}>
          {ativos.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={marcados.has(p.id)} onChange={() => alternar(p.id)} disabled={salvando} />
                <span>{p.nome}</span>
                <span className="ml-auto text-xs text-text-muted">
                  {p.meses_validade} {p.meses_validade === 1 ? t("mês") : t("meses")}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <label className="flex flex-col gap-1 text-sm">
          {t("Data em que foi feito (vazio = hoje)")}
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-2"
            value={data}
            onChange={(e) => setData(e.target.value)}
            disabled={salvando}
          />
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={salvando}>
            {t("Agora não")}
          </Button>
          <Button onClick={salvar} disabled={marcados.size === 0 || salvando} data-testid="salvar-procedimentos-realizados">
            {salvando
              ? t("Salvando...")
              : posVenda
                ? `${t("Salvar e ir para")} ${posVenda.name}`
                : t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
