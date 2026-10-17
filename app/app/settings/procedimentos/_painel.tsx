"use client";

/**
 * O painel de Procedimentos: lista do catálogo + formulário de cadastro/edição.
 *
 * O que a tela diz com todas as letras, porque a mensagem sai SOZINHA para
 * pacientes: quando sai (no vencimento, dentro da janela de envio do WhatsApp),
 * quando NÃO sai (venceu há mais de 7 dias, procedimento pausado, paciente sem
 * telefone) e o que cada variável vira. Excluir pede confirmação.
 */
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import {
  useExcluirProcedimento,
  useProcedimentos,
  useSalvarProcedimento,
  type Procedimento,
} from "@/hooks/procedimentos/useProcedimentos";
import { DIAS_DE_TOLERANCIA, MENSAGEM_MAXIMA, MESES_MAXIMO, montarMensagem } from "@/lib/procedimentos/regras";

export interface EtapaParaEscolher {
  id: string;
  nome: string;
  funilId: string;
  funil: string;
}

const MODELO_DE_MENSAGEM =
  "Oi {nome}! Já faz um tempo desde o seu {procedimento}. Que tal agendarmos a manutenção para manter o resultado? Me responda por aqui que eu te passo os horários 😊";

interface Rascunho {
  id: string | null;
  nome: string;
  meses: string;
  mensagem: string;
  etapa: string;
  ativo: boolean;
}

const VAZIO: Rascunho = { id: null, nome: "", meses: "6", mensagem: MODELO_DE_MENSAGEM, etapa: "", ativo: true };

/**
 * Procedimento novo já vem apontando para a etapa "Retorno", se o funil tem uma:
 * quem recebeu o convite de voltar fica separado dos leads novos e nenhum
 * follow-up dispara por ali. Só uma sugestão, a pessoa troca no seletor.
 */
function etapaSugerida(etapas: EtapaParaEscolher[]): string {
  const semAcento = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return etapas.find((e) => semAcento(e.nome) === "retorno")?.id ?? "";
}

export function PainelDeProcedimentos({ etapas }: { etapas: EtapaParaEscolher[] }) {
  const t = useT();
  const { data: lista, isLoading, isError, error } = useProcedimentos();
  const salvar = useSalvarProcedimento();
  const excluir = useExcluirProcedimento();
  const [form, setForm] = useState<Rascunho | null>(null);
  const [apagando, setApagando] = useState<Procedimento | null>(null);

  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));
  const funis = [...new Map(etapas.map((e) => [e.funilId, e.funil])).entries()];

  if (isError) {
    const naoAtivado = (error as { status?: number } | null)?.status === 404;
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        {naoAtivado
          ? t("Procedimentos ainda não estão ativados nesta instalação.")
          : t("Não foi possível carregar os procedimentos agora. Recarregue a página.")}
      </div>
    );
  }

  const mesesNum = Number(form?.meses);
  const mesesValidos = Number.isInteger(mesesNum) && mesesNum >= 1 && mesesNum <= MESES_MAXIMO;
  const podeSalvar =
    !!form && form.nome.trim().length > 0 && mesesValidos && form.mensagem.trim().length > 0 &&
    form.mensagem.length <= MENSAGEM_MAXIMA;

  function enviarFormulario() {
    if (!form || !podeSalvar) return;
    salvar.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        nome: form.nome.trim(),
        meses_validade: mesesNum,
        mensagem: form.mensagem.trim(),
        etapa_destino_id: form.etapa || null,
        ativo: form.ativo,
      },
      {
        onSuccess: () => {
          toast.success(t("Procedimento salvo"));
          setForm(null);
        },
      },
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="border-border bg-muted/30 p-4 text-sm">
        <p className="mb-1 font-medium">{t("Como funciona o envio")}</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("O prazo conta a partir da data em que o procedimento foi realizado (marcado no lead).")}</li>
          <li>{t("No dia do vencimento a mensagem sai sozinha, dentro do horário de envio do WhatsApp.")}</li>
          <li>
            {t("Se o prazo venceu há mais de")} {DIAS_DE_TOLERANCIA} {t("dias quando o sistema olhar, nada é enviado (não manda mensagem velha).")}
          </li>
          <li>{t("Não envia para contato bloqueado ou sem telefone, e cada retorno sai uma única vez.")}</li>
          <li>{t("Use {nome} e {procedimento} na mensagem: viram o primeiro nome do paciente e o procedimento.")}</li>
        </ul>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t("Procedimentos cadastrados")}</h2>
        {!form && (
          <Button onClick={() => setForm({ ...VAZIO, etapa: etapaSugerida(etapas) })} data-testid="novo-procedimento">
            {t("Novo procedimento")}
          </Button>
        )}
      </div>

      {form && (
        <Card className="flex flex-col gap-4 p-4" data-testid="formulario-de-procedimento">
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proc-nome">{t("Procedimento")}</Label>
              <Input
                id="proc-nome"
                value={form.nome}
                maxLength={120}
                placeholder={t("Ex.: Botox")}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proc-meses">{t("Dura (meses)")}</Label>
              <Input
                id="proc-meses"
                type="number"
                min={1}
                max={MESES_MAXIMO}
                value={form.meses}
                onChange={(e) => setForm({ ...form, meses: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proc-mensagem">{t("Mensagem de retorno")}</Label>
            <Textarea
              id="proc-mensagem"
              rows={5}
              value={form.mensagem}
              maxLength={MENSAGEM_MAXIMA}
              onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("Prévia")}:{" "}
              <span className="whitespace-pre-wrap text-foreground">
                {montarMensagem(form.mensagem, { nome: "Maria da Silva", procedimento: form.nome.trim() || "procedimento" })}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proc-etapa">{t("Depois de enviar, mover o lead para")}</Label>
            <select
              id="proc-etapa"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.etapa}
              onChange={(e) => setForm({ ...form, etapa: e.target.value })}
            >
              <option value="">{t("Não mover (o lead fica onde está)")}</option>
              {funis.map(([funilId, funil]) => (
                <optgroup key={funilId} label={funil}>
                  {etapas
                    .filter((e) => e.funilId === funilId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("O lead só é movido se estiver aberto e no mesmo funil da etapa escolhida.")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="proc-ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            <Label htmlFor="proc-ativo">{t("Envio automático ligado")}</Label>
          </div>

          <div className="flex gap-2">
            <Button onClick={enviarFormulario} disabled={!podeSalvar || salvar.isPending} data-testid="salvar-procedimento">
              {salvar.isPending ? t("Salvando...") : t("Salvar")}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={salvar.isPending}>
              {t("Cancelar")}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carregando...")}</p>
      ) : (lista ?? []).length === 0 && !form ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("Nenhum procedimento cadastrado ainda. Comece pelo seu procedimento mais recorrente, como o botox.")}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {(lista ?? []).map((p) => (
            <li key={p.id}>
              <Card className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.nome}{" "}
                    {!p.ativo && (
                      <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {t("Pausado")}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("Volta a cada")} {p.meses_validade} {p.meses_validade === 1 ? t("mês") : t("meses")}
                    {" · "}
                    {p.etapa_destino_id && etapaPorId.get(p.etapa_destino_id)
                      ? `${t("depois vai para")} ${etapaPorId.get(p.etapa_destino_id)!.nome}`
                      : t("o lead não é movido")}
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm">{p.mensagem}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({
                        id: p.id,
                        nome: p.nome,
                        meses: String(p.meses_validade),
                        mensagem: p.mensagem,
                        etapa: p.etapa_destino_id ?? "",
                        ativo: p.ativo,
                      })
                    }
                  >
                    {t("Editar")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setApagando(p)}>
                    {t("Excluir")}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!apagando} onOpenChange={(aberto) => !aberto && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir procedimento?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Os registros dos pacientes continuam no histórico, mas deixam de gerar mensagem de retorno. Para só parar os envios, use o botão de pausar na edição.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!apagando) return;
                excluir.mutate(apagando.id, { onSuccess: () => toast.success(t("Procedimento excluído")) });
                setApagando(null);
              }}
            >
              {t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
