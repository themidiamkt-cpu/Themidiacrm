/**
 * A empresa (ou a pessoa) escolhe o que fica FIXO na barra lateral.
 *
 * `barra` é arrumação, não limite: decide só o que sobe para a barra. O que
 * existe na navegação continua sendo `destinos` + papel, e nada do que é
 * desmarcado aqui deixa de abrir pela página do grupo ou pela busca.
 */
import { describe, expect, it } from "vitest";
import {
  combinarInterfaces,
  fixoNaBarra,
  interfaceSettingsSchema,
  lerInterface,
  type InterfaceSettings,
} from "@/lib/navigation/interface";
import { hubSections, searchable, sidebarGroups } from "@/lib/navigation/registry";

const naBarra = (settings: InterfaceSettings | undefined, role: "admin" | "agent" = "admin") =>
  Object.fromEntries(
    sidebarGroups(false, role, settings).map((g) => [g.group.id, g.items.map((i) => i.href)]),
  );

describe("barra lateral escolhida", () => {
  it("sem escolha, a barra é a de sempre: Prospecção fica só na página do grupo", () => {
    const barra = naBarra(undefined);
    expect(barra.crm).toContain("/app/kanban");
    expect(barra.crm).not.toContain("/app/prospecting");
    expect(barra.atendimento).toContain("/app/inbox");
  });

  it("com escolha, a barra mostra exatamente o que foi marcado, na ordem do catálogo", () => {
    const barra = naBarra({
      preset: "completa",
      barra: ["/app/inbox", "/app/kanban", "/app/prospecting"],
    });
    expect(barra.crm).toEqual(["/app/prospecting", "/app/kanban"]);
    expect(barra.atendimento).toEqual(["/app/inbox"]);
    // Grupo sem página "Ver tudo" e sem nada marcado some da barra.
    expect(barra.canais).toBeUndefined();
    // Grupo com página "Ver tudo" continua, mesmo sem nada marcado.
    expect(barra.ia).toEqual([]);
  });

  it("o que saiu da barra continua na página do grupo e na busca", () => {
    const settings: InterfaceSettings = { preset: "completa", barra: ["/app/inbox"] };
    const doCrm = hubSections("crm", false, "admin", settings).flatMap((s) =>
      s.items.map((i) => i.href),
    );
    expect(doCrm).toEqual(expect.arrayContaining(["/app/kanban", "/app/prospecting"]));
    expect(searchable(false, "admin", settings).map((d) => d.href)).toContain("/app/webhooks");
  });

  it("fixar não abre o que o papel ou a seleção de áreas não deixam ver", () => {
    // Prospecção pede papel de administrador.
    expect(
      naBarra({ preset: "completa", barra: ["/app/prospecting", "/app/kanban"] }, "agent").crm,
    ).toEqual(["/app/kanban"]);
    // Área escondida em `destinos` não volta por estar fixada.
    expect(
      naBarra({
        preset: "completa",
        destinos: ["/app/inbox", "/app/kanban"],
        barra: ["/app/inbox", "/app/kanban", "/app/contacts"],
      }).crm,
    ).toEqual(["/app/kanban"]);
  });

  it("lista vazia é escolha válida: sobram os links de grupo", () => {
    const barra = naBarra({ preset: "completa", barra: [] });
    expect(barra.atendimento).toBeUndefined();
    expect(barra.crm).toEqual([]);
  });

  it("o padrão sem escolha segue valendo para grupo sem página própria", () => {
    const comSelecao: InterfaceSettings = { preset: "completa", destinos: ["/app/webhooks"] };
    const webhooks = { href: "/app/webhooks", group: "canais" as const };
    expect(fixoNaBarra(webhooks, comSelecao)).toBe(true);
    expect(fixoNaBarra(webhooks, { ...comSelecao, barra: [] })).toBe(false);
  });
});

describe("forma e leitura da escolha", () => {
  it("o schema ordena pelo catálogo e recusa área desconhecida", () => {
    const ok = interfaceSettingsSchema.parse({
      preset: "completa",
      barra: ["/app/kanban", "/app/inbox"],
    });
    expect(ok.barra).toEqual(["/app/inbox", "/app/kanban"]);
    expect(
      interfaceSettingsSchema.safeParse({ preset: "completa", barra: ["/app/nao-existe"] }).success,
    ).toBe(false);
  });

  it("a leitura descarta área antiga da barra sem derrubar a escolha", () => {
    const lida = lerInterface({ preset: "completa", barra: ["/app/inbox", "/app/tela-removida"] });
    expect(lida).toEqual({
      settings: { preset: "completa", barra: ["/app/inbox"] },
      needsAdjustment: false,
    });
    expect(lerInterface({ preset: "completa" }).settings).toEqual({ preset: "completa" });
  });

  it("vale a barra da pessoa; na falta dela, a da empresa", () => {
    const empresa = { preset: "completa", barra: ["/app/inbox", "/app/prospecting"] };
    const pessoa = { preset: "completa", barra: ["/app/kanban"] };
    expect(combinarInterfaces(empresa, { preset: "completa" })).toEqual({
      preset: "completa",
      barra: ["/app/prospecting", "/app/inbox"],
    });
    expect(combinarInterfaces(empresa, pessoa).barra).toEqual(["/app/kanban"]);
    expect(combinarInterfaces({ preset: "completa" }, { preset: "completa" })).toEqual({
      preset: "completa",
    });
  });

  it("a barra acompanha a interseção das áreas sem mudar o que cada um vê", () => {
    const combinada = combinarInterfaces(
      { preset: "completa", destinos: ["/app/inbox", "/app/kanban"], barra: ["/app/kanban"] },
      { preset: "simplificada" },
    );
    expect(combinada.destinos).toEqual(["/app/inbox", "/app/kanban"]);
    expect(combinada.barra).toEqual(["/app/kanban"]);
  });
});
