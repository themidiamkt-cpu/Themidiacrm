import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { InterfaceDaEmpresaForm } from "../tenant/_interface";

export const dynamic = "force-dynamic";

/**
 * Porta própria do menu lateral da empresa.
 *
 * O mesmo formulário mora em Organização, abaixo dos dados da empresa — e ali
 * ninguém o procura: "Organização" promete CNPJ e LGPD, não "o que aparece na
 * barra". Medido com quem usa: pediu para escolher os itens da barra, recebeu a
 * tela, e não achou onde ficava. Esta página é só o endereço que faltava; a
 * regra, a gravação e a auditoria continuam as de `InterfaceDaEmpresaForm`.
 */
export default async function MenuLateralPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("interface_settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Menu lateral", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Escolha o que aparece na navegação e o que fica fixo na barra lateral.",
            idioma,
          )}
        </p>
      </header>
      {data && (
        <InterfaceDaEmpresaForm
          initial={(data as { interface_settings: unknown }).interface_settings}
          role={activeOrg.role}
          barraAberta
        />
      )}
    </div>
  );
}
