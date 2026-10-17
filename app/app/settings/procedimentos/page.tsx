/**
 * Configurações → Procedimentos. Onde a clínica cadastra o que faz (botox,
 * peeling…), de quantos em quantos meses o paciente deve voltar, a mensagem que o
 * CRM manda sozinho no vencimento e para qual etapa do funil o lead vai depois.
 *
 * `manager`+, pelo mesmo motivo da tela de Tags: o que se escreve aqui sai para
 * pacientes sem ninguém clicar.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import { PainelDeProcedimentos, type EtapaParaEscolher } from "./_painel";

export const metadata = { title: "Procedimentos" };
export const dynamic = "force-dynamic";

export default async function ProcedimentosPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  const supabase = await createClient();
  const [{ data: funis }, { data: etapas }] = await Promise.all([
    supabase
      .from("crm_pipelines")
      .select("id, name, position, is_archived")
      .eq("organization_id", activeOrg.orgId)
      .eq("is_archived", false)
      .order("position", { ascending: true }),
    supabase
      .from("crm_stages")
      .select("id, name, pipeline_id, position, is_archived")
      .eq("organization_id", activeOrg.orgId)
      .eq("is_archived", false)
      .order("position", { ascending: true }),
  ]);

  const nomeDoFunil = new Map((funis ?? []).map((f) => [f.id as string, f.name as string]));
  const ordemDoFunil = new Map((funis ?? []).map((f, i) => [f.id as string, i]));
  const opcoes: EtapaParaEscolher[] = (etapas ?? [])
    .filter((e) => nomeDoFunil.has(e.pipeline_id as string))
    .map((e) => ({
      id: e.id as string,
      nome: e.name as string,
      funilId: e.pipeline_id as string,
      funil: nomeDoFunil.get(e.pipeline_id as string) as string,
    }))
    .sort(
      (a, b) =>
        (ordemDoFunil.get(a.funilId) ?? 0) - (ordemDoFunil.get(b.funilId) ?? 0),
    );

  const t = (texto: string) => traduzir(texto, user.idioma);
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Procedimentos")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "Cadastre cada procedimento com a validade em meses e a mensagem de retorno. Quando um paciente faz o procedimento e o prazo vence, o CRM manda a mensagem no WhatsApp sozinho e leva o lead para a etapa que você escolher.",
          )}
        </p>
      </header>
      <PainelDeProcedimentos etapas={opcoes} />
    </div>
  );
}
