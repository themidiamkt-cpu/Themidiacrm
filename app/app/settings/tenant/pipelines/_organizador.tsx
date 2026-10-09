"use client";

import { useT } from "@/hooks/i18n/useT";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import {
  lerConfigDoOrganizador,
  TAMANHO_MAXIMO_DAS_INSTRUCOES,
} from "@/lib/funil/organizador-config";

/**
 * A chave do organizador de funil (`lib/funil/organizador.ts`), por funil.
 *
 * Salva sozinha, separada de "Vocabulário e campos": ligar a IA neste funil é
 * uma decisão própria, e gravá-la junto com o formulário de baixo faria um
 * campo personalizado inválido lá embaixo impedir de ligar ou desligar aqui.
 */
export function OrganizadorSection({
  pipelineId,
  pipelineName,
  settings,
}: {
  pipelineId: string;
  pipelineName: string;
  settings: Record<string, unknown> | null;
}) {
  const t = useT();
  const inicial = lerConfigDoOrganizador(settings);
  const [ligado, setLigado] = useState(inicial.ligado);
  const [instrucoes, setInstrucoes] = useState(inicial.instrucoes);
  const [isPending, startTransition] = useTransition();
  const idDaChave = `organizador-ligado-${pipelineId}`;
  const idDoTexto = `organizador-instrucoes-${pipelineId}`;

  function salvar() {
    startTransition(async () => {
      const r = await updatePipelineConfig(pipelineId, {
        organizador: { ligado, instrucoes: instrucoes.trim() },
      });
      if (r.ok) toast.success(`${pipelineName} ${t("atualizado.")}`);
      else toast.error(`${t("Erro:")} ${r.error}`);
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-6">
      <h3 className="text-sm font-semibold">{t("Organizar pela conversa (IA)")}</h3>
      <p className="text-xs text-muted-foreground">
        {t(
          "Ligado, a IA lê as conversas de quem é atendido pela equipe e move o cartão para a etapa certa deste funil. Ela não envia mensagem nem responde ao cliente. Não marca ganho e não mexe em negócio já encerrado.",
        )}
      </p>
      <div className="flex items-center gap-2">
        <Switch id={idDaChave} checked={ligado} onCheckedChange={setLigado} />
        <Label htmlFor={idDaChave} className="text-xs">
          {t("A IA organiza as etapas deste funil")}
        </Label>
      </div>
      <div className="space-y-1">
        <Label htmlFor={idDoTexto} className="text-xs">
          {t("Como reconhecer cada etapa")}
        </Label>
        <Textarea
          id={idDoTexto}
          value={instrucoes}
          onChange={(e) => setInstrucoes(e.target.value)}
          maxLength={TAMANHO_MAXIMO_DAS_INSTRUCOES}
          rows={6}
          placeholder={t(
            "Uma linha por etapa. Ex.: Em conversa: a pessoa já respondeu e ainda não marcou horário. Agendada: dia e hora combinados na conversa.",
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Opcional. Sem instruções, a IA se guia pelo nome das etapas. Cada movimento aparece na linha do tempo do cartão, com o motivo.",
          )}
        </p>
      </div>
      <Button onClick={salvar} disabled={isPending} variant="outline" className="w-full sm:w-auto">
        {t("Salvar organização pela conversa")}
      </Button>
    </div>
  );
}
