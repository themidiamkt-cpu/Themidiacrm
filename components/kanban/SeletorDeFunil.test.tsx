import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SeletorDeFunil } from "./SeletorDeFunil";

const FUNIS = [
  { id: "f1", name: "Pacientes" },
  { id: "f2", name: "Pós-venda" },
];

beforeEach(() => {
  document.cookie = "funil_atual=; path=/; max-age=0";
});

describe("SeletorDeFunil", () => {
  it("o título é o nome do funil atual e abre a lista com os outros", async () => {
    const user = userEvent.setup();
    render(<SeletorDeFunil atualId="f1" atualNome="Pacientes" funis={FUNIS} podeGerenciar />);
    const gatilho = screen.getByTestId("seletor-de-funil");
    expect(gatilho).toHaveTextContent("Pacientes");
    await user.click(gatilho);
    expect(screen.getByRole("menuitem", { name: /Pós-venda/ })).toHaveAttribute("href", "/app/pipelines/f2");
    expect(screen.getByRole("menuitem", { name: /Pacientes/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("menuitem", { name: "Gerenciar funis" })).toHaveAttribute(
      "href",
      "/app/kanban?gerenciar=1",
    );
  });

  it("quem não gerencia não vê 'Gerenciar funis'", async () => {
    const user = userEvent.setup();
    render(<SeletorDeFunil atualId="f1" atualNome="Pacientes" funis={FUNIS} podeGerenciar={false} />);
    await user.click(screen.getByTestId("seletor-de-funil"));
    expect(screen.queryByRole("menuitem", { name: "Gerenciar funis" })).toBeNull();
  });

  it("um funil só e sem permissão de gestão: é só o título, sem lista", () => {
    render(<SeletorDeFunil atualId="f1" atualNome="Pacientes" funis={[FUNIS[0]!]} podeGerenciar={false} />);
    expect(screen.queryByTestId("seletor-de-funil")).toBeNull();
    expect(screen.getByRole("heading", { name: "Pacientes" })).toBeInTheDocument();
  });

  it("grava o funil aberto no cookie que o menu usa para abrir o mesmo funil da próxima vez", () => {
    render(<SeletorDeFunil atualId="f2" atualNome="Pós-venda" funis={FUNIS} podeGerenciar />);
    expect(document.cookie).toContain("funil_atual=f2");
  });
});
