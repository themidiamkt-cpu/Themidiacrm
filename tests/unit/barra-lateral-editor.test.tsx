/**
 * A lista "Escolher o que fica na barra lateral" do editor de interface.
 *
 * O ponto que este arquivo guarda: abrir a lista sem mexer não muda nada (ela
 * parte do que a barra mostra hoje), e cada clique devolve a lista INTEIRA do
 * que fica fixo — é o que vai para o banco.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { InterfaceEditor } from "@/components/team/InterfaceEditor";
import type { InterfaceSettings } from "@/lib/navigation/interface";

function abrir(value: InterfaceSettings) {
  const onChange = vi.fn();
  render(<InterfaceEditor value={value} onChange={onChange} role="admin" />);
  const lista = within(screen.getByTestId("barra-lateral-escolha"));
  return {
    onChange,
    lista,
    caixa: (nome: string) => lista.getByLabelText(nome) as HTMLInputElement,
  };
}

describe("editor: o que fica na barra lateral", () => {
  it("parte do que a barra mostra hoje", () => {
    const { caixa, lista } = abrir({ preset: "completa" });
    expect(caixa("Funis").checked).toBe(true);
    expect(caixa("Inbox").checked).toBe(true);
    expect(caixa("Prospecção").checked).toBe(false);
    // Sem escolha gravada, não há o que desfazer.
    expect(lista.queryByText("Voltar ao padrão da barra")).toBeNull();
  });

  it("marcar uma área devolve a lista inteira, com a nova dentro", () => {
    const { caixa, onChange } = abrir({ preset: "completa" });
    fireEvent.click(caixa("Prospecção"));
    const enviado = onChange.mock.calls[0]![0] as InterfaceSettings;
    expect(enviado.preset).toBe("completa");
    expect(enviado.barra).toEqual(
      expect.arrayContaining(["/app/prospecting", "/app/kanban", "/app/inbox"]),
    );
    expect(enviado.destinos).toBeUndefined();
  });

  it("desmarcar tira só aquela área e preserva a seleção de áreas visíveis", () => {
    const { caixa, onChange } = abrir({
      preset: "completa",
      destinos: ["/app/inbox", "/app/kanban", "/app/contacts"],
      barra: ["/app/inbox", "/app/kanban"],
    });
    fireEvent.click(caixa("Funis"));
    expect(onChange).toHaveBeenCalledWith({
      preset: "completa",
      destinos: ["/app/inbox", "/app/kanban", "/app/contacts"],
      barra: ["/app/inbox"],
    });
  });

  it("área escondida não aparece na lista da barra", () => {
    const { lista } = abrir({ preset: "completa", destinos: ["/app/inbox", "/app/kanban"] });
    expect(lista.queryByLabelText("Contatos")).toBeNull();
    expect(lista.queryByLabelText("Funis")).not.toBeNull();
  });

  it("voltar ao padrão apaga a escolha da barra e mantém o resto", () => {
    const { lista, onChange } = abrir({
      preset: "completa",
      destinos: ["/app/inbox", "/app/kanban"],
      barra: ["/app/inbox"],
    });
    fireEvent.click(lista.getByText("Voltar ao padrão da barra"));
    expect(onChange).toHaveBeenCalledWith({
      preset: "completa",
      destinos: ["/app/inbox", "/app/kanban"],
    });
  });
});
