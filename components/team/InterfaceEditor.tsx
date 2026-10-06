"use client";
import { useT } from "@/hooks/i18n/useT";
import { useId } from "react";
import type { Role } from "@/lib/auth/types";
import { NAV_GROUPS, type NavDestinationId } from "@/lib/navigation/catalogo";
import {
  combinarInterfaces,
  destinosDaInterface,
  essencial,
  fixoNaBarra,
  interfaceTemDestino,
  lerInterface,
  permitidos,
  podeIrParaABarra,
  type InterfaceSettings,
} from "@/lib/navigation/interface";

export function InterfaceEditor({
  value,
  onChange,
  role,
  disabled = false,
}: {
  value: InterfaceSettings;
  onChange: (value: InterfaceSettings) => void;
  role: Role;
  disabled?: boolean;
}) {
  const t = useT();
  const id = useId();
  const selected = new Set<string>(
    value.destinos ?? destinosDaInterface(value, false, role).map((d) => d.href),
  );
  const options = permitidos(false, role).filter((d) => !essencial(d, role));
  // Barra lateral: só entra na lista o que está visível e não é do rodapé. O
  // ponto de partida é o que a barra mostra HOJE, então abrir a lista sem mexer
  // não muda nada. A pergunta é feita à escolha já COMBINADA, como a barra faz:
  // é ela que transforma "simplificada" na lista de áreas que a regra lê.
  const candidatosDaBarra = options.filter((d) => selected.has(d.href) && podeIrParaABarra(d));
  const comoABarraLe = combinarInterfaces(value, null);
  const fixos = new Set<string>(
    candidatosDaBarra.filter((d) => fixoNaBarra(d, comoABarraLe)).map((d) => d.href),
  );
  const semBarra: InterfaceSettings = {
    preset: value.preset,
    ...(value.destinos ? { destinos: value.destinos } : {}),
  };
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">{t("Interface")}</legend>
      <p className="text-xs text-muted-foreground">{t("Define quais áreas aparecem na navegação. As permissões continuam sendo determinadas pelo papel. Links de conversas e avisos podem abrir áreas autorizadas que estejam ocultas.")}</p>
      <label htmlFor={id} className="block text-sm">{t("Perfil de interface")}</label>
      <select
        id={id}
        value={value.preset}
        onChange={(e) => onChange({ preset: e.target.value as InterfaceSettings["preset"] })}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="completa">{t("Completa")}</option>
        <option value="simplificada">{t("Simplificada")}</option>
      </select>
      <p className="text-xs text-muted-foreground">{t("Trocar o perfil restaura sua seleção padrão. Perfil, segurança e acesso à equipe de quem administra continuam disponíveis.")}</p>
      {lerInterface(value).needsAdjustment && (
        <p role="status" className="text-sm">{t("A seleção contém áreas antigas. Confira e salve novamente.")}</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("Personalizar áreas visíveis")}{value.destinos ? t(" (personalizada)") : ""}
        </summary>
        <div className="mt-3 max-h-64 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = options.filter((d) => d.group === group.id);
            if (!items.length) return null;
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                  {t(group.label)}
                </legend>
                {items.map((d) => (
                  <label key={d.href} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(d.href)}
                      onChange={(e) => {
                        const next = new Set(
                          options
                            .filter((option) => selected.has(option.href))
                            .map((option) => option.href),
                        );
                        if (e.target.checked) next.add(d.href);
                        else next.delete(d.href);
                        onChange({
                          preset: value.preset,
                          destinos: [...next] as NavDestinationId[],
                          ...(value.barra ? { barra: value.barra } : {}),
                        });
                      }}
                      className="mt-1"
                    />
                    {t(d.label)}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </details>
      <details data-testid="barra-lateral-escolha">
        <summary className="cursor-pointer text-sm font-medium">
          {t("Escolher o que fica na barra lateral")}{value.barra ? t(" (personalizada)") : ""}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Marque as áreas que ficam fixas na barra. As desmarcadas continuam na busca e, nos grupos com “Ver tudo”, na página do grupo.",
          )}
        </p>
        <div className="mt-3 max-h-64 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = candidatosDaBarra.filter((d) => d.group === group.id);
            if (!items.length) return null;
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                  {t(group.label)}
                </legend>
                {items.map((d) => (
                  <label key={d.href} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={fixos.has(d.href)}
                      onChange={(e) => {
                        const next = new Set(fixos);
                        if (e.target.checked) next.add(d.href);
                        else next.delete(d.href);
                        onChange({ ...semBarra, barra: [...next] as NavDestinationId[] });
                      }}
                      className="mt-1"
                    />
                    {t(d.label)}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
        {value.barra && (
          <button
            type="button"
            className="mt-3 text-xs underline"
            onClick={() => onChange(semBarra)}
          >
            {t("Voltar ao padrão da barra")}
          </button>
        )}
      </details>
      {!interfaceTemDestino(value, role) || value.destinos?.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">{t("Selecione ao menos uma área de trabalho permitida ao papel.")}</p>
      ) : null}
    </fieldset>
  );
}
