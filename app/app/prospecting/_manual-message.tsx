"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import type { ManualMessageConfig } from "@/lib/prospecting/schema";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type Opcoes = {
  agents: { id: string; name: string }[];
  channels: {
    id: string;
    display_name: string | null;
    phone_number: string | null;
    status: string;
  }[];
  stages: { id: string; name: string; pipeline_id: string; pipeline_name: string }[];
};

const vazio: ManualMessageConfig = {
  mode: "manual_message",
  channel_session_id: "",
  pipeline_id: "",
  stage_id: "",
  agent_id: null,
  base_message: "",
  personalize: true,
  only_without_site: false,
  legal_basis_ref: "",
};

type Resultado = { prepared: number; skipped: number; remaining: number; personalized: number };

/**
 * Abordagem manual: o operador escreve UMA mensagem base, a IA adapta para cada
 * empresa e o texto fica pronto no Inbox. Nada é enviado por aqui — o envio é o
 * clique de uma pessoa em "Enviar pelo Inbox", na tabela de resultados.
 *
 * A preparação anda em lotes no servidor; este formulário repete a chamada até
 * não sobrar empresa, mostrando o andamento.
 */
export function ManualMessageForm({
  campaignId,
  saved,
  options,
  onChanged,
}: {
  campaignId: string;
  /** Configuração já gravada (preparação começada): o formulário fica travado nela. */
  saved: ManualMessageConfig | null;
  options: Opcoes;
  onChanged: () => Promise<unknown>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<ManualMessageConfig>(vazio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const config = saved ?? draft;
  const set = <K extends keyof ManualMessageConfig>(field: K, value: ManualMessageConfig[K]) =>
    setDraft((c) => ({ ...c, [field]: value }));
  const funis = [...new Map(options.stages.map((s) => [s.pipeline_id, s.pipeline_name])).entries()];

  async function preparar() {
    setBusy(true);
    setError(null);
    let prontas = 0;
    let puladas = 0;
    try {
      // Cada chamada prepara um lote; para quando não sobra empresa. O teto de
      // voltas existe só para uma resposta inesperada não virar laço sem fim.
      for (let volta = 0; volta < 12; volta++) {
        const { data } = await apiClient.post<{ data: Resultado }>("/api/v1/prospecting", {
          action: "prepare_manual",
          id: campaignId,
          config,
        });
        prontas += data.prepared;
        puladas += data.skipped;
        setProgress(
          `${prontas} ${t("mensagens prontas")}${puladas ? ` · ${puladas} ${t("empresas fora da abordagem")}` : ""}${
            data.remaining ? ` · ${t("preparando mais")} ${data.remaining}…` : ""
          }`,
        );
        await onChanged();
        if (!data.remaining || !data.prepared) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Não foi possível preparar as mensagens."));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void preparar();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {t(
          "Você escreve a mensagem, a IA adapta para cada empresa e deixa pronta no Inbox. Nada é enviado sozinho: quem envia é você, em cada conversa.",
        )}
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm">
          {error}
        </p>
      )}
      {progress && (
        <p role="status" className="rounded-md border bg-muted/30 p-3 text-sm">
          {progress}
        </p>
      )}
      <fieldset disabled={!!saved || busy} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="manual-channel">{t("Conexão de saída")}</Label>
            <select
              id="manual-channel"
              className={`${selectClass} mt-1`}
              value={config.channel_session_id}
              onChange={(e) => set("channel_session_id", e.target.value)}
              required
            >
              <option value="">{t("Escolha uma conexão ativa")}</option>
              {options.channels
                .filter((c) => c.status === "WORKING")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name ?? c.phone_number ?? c.id}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label htmlFor="manual-agent">{t("Agente que continua a conversa (opcional)")}</Label>
            <select
              id="manual-agent"
              className={`${selectClass} mt-1`}
              value={config.agent_id ?? ""}
              onChange={(e) => set("agent_id", e.target.value || null)}
            >
              <option value="">{t("Nenhum: eu mesmo respondo")}</option>
              {options.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Depois de enviar, devolva a conversa para a IA no Inbox para o agente atender a resposta.",
              )}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="manual-pipeline">{t("Funil")}</Label>
            <select
              id="manual-pipeline"
              className={`${selectClass} mt-1`}
              value={config.pipeline_id}
              required
              onChange={(e) =>
                setDraft((c) => ({ ...c, pipeline_id: e.target.value, stage_id: "" }))
              }
            >
              <option value="">{t("Escolha o funil")}</option>
              {funis.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="manual-stage">{t("Etapa inicial")}</Label>
            <select
              id="manual-stage"
              className={`${selectClass} mt-1`}
              value={config.stage_id}
              required
              onChange={(e) => set("stage_id", e.target.value)}
            >
              <option value="">{t("Escolha a etapa")}</option>
              {options.stages
                .filter((s) => s.pipeline_id === config.pipeline_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="manual-message">{t("Mensagem base")}</Label>
          <Textarea
            id="manual-message"
            value={config.base_message}
            onChange={(e) => set("base_message", e.target.value)}
            required
            minLength={10}
            maxLength={2000}
            rows={6}
            className="mt-1"
            placeholder={t(
              "Escreva a primeira mensagem como você mandaria. Ex.: Oi! Aqui é da minha empresa. Encontrei a {{empresa}} no Google e queria entender como vocês atraem clientes hoje.",
            )}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Marcadores aceitos: {{empresa}}, {{bairro}}, {{categoria}}, {{nota}} e {{avaliacoes}}. O aviso para parar de receber mensagens é acrescentado no fim.",
            )}
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={config.personalize}
            onChange={(e) => set("personalize", e.target.checked)}
          />
          <span>
            {t("A IA adapta a mensagem para cada empresa")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Usa só nome, bairro, tipo de negócio, nota e avaliações da busca. Desmarcado, sai a mensagem base com os marcadores trocados.",
              )}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={config.only_without_site}
            onChange={(e) => set("only_without_site", e.target.checked)}
          />
          <span>
            {t("Preparar só para empresas sem site próprio")}
            <span className="block text-xs text-muted-foreground">
              {t("Instagram, Facebook e link de WhatsApp não contam como site.")}
            </span>
          </span>
        </label>
        <div>
          <Label htmlFor="manual-basis">{t("Referência da avaliação de legítimo interesse")}</Label>
          <Input
            id="manual-basis"
            value={config.legal_basis_ref}
            onChange={(e) => set("legal_basis_ref", e.target.value)}
            minLength={3}
            maxLength={500}
            required
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Informe a referência real da avaliação que fundamenta esta prospecção. Isso não registra consentimento dos contatos.",
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Ao preparar, as empresas com telefone entram no funil e ganham uma conversa com a mensagem pronta. Contatos já existentes são preservados. Esta campanha deixa de aceitar a abordagem automática pela IA.",
          )}{" "}
          <Link className="underline" href="/app/connections">
            {t("Ver conexões e proteções de envio")}
          </Link>
        </p>
      </fieldset>
      {!saved && (
        <Button
          type="submit"
          disabled={busy || !options.channels.some((c) => c.status === "WORKING")}
        >
          {busy ? t("Preparando mensagens…") : t("Preparar mensagens")}
        </Button>
      )}
    </form>
  );
}

/** Para campanha que já é manual e ainda tem empresa esperando: continua a preparação. */
export function ContinueManualButton({
  campaignId,
  config,
  onChanged,
  label,
}: {
  campaignId: string;
  config: ManualMessageConfig;
  onChanged: () => Promise<unknown>;
  label: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function continuar() {
    setBusy(true);
    setError(null);
    try {
      for (let volta = 0; volta < 12; volta++) {
        const { data } = await apiClient.post<{ data: Resultado }>("/api/v1/prospecting", {
          action: "prepare_manual",
          id: campaignId,
          config,
        });
        await onChanged();
        if (!data.remaining || !data.prepared) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Não foi possível preparar as mensagens."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="outline" disabled={busy} onClick={() => void continuar()}>
        {busy ? t("Preparando mensagens…") : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
