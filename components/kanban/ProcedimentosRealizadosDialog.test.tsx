import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const registrar = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/procedimentos/useProcedimentos", () => ({
  useProcedimentos: () => ({
    data: [
      { id: "p1", nome: "Botox", meses_validade: 6, mensagem: "x", etapa_destino_id: null, ativo: true },
      { id: "p2", nome: "Preenchimento", meses_validade: 12, mensagem: "y", etapa_destino_id: null, ativo: true },
      { id: "p3", nome: "Peeling", meses_validade: 3, mensagem: "z", etapa_destino_id: null, ativo: false },
    ],
  }),
}));
vi.mock("@/hooks/procedimentos/useProcedimentosDoLead", () => ({
  useRegistrarProcedimentoDoLead: () => ({ mutateAsync: registrar }),
}));

import { ProcedimentosRealizadosDialog } from "./ProcedimentosRealizadosDialog";

const LEAD = { id: "lead-1", title: "Camila" };

function abrir(over: Partial<React.ComponentProps<typeof ProcedimentosRealizadosDialog>> = {}) {
  const onClose = vi.fn();
  const onRegistrado = vi.fn();
  render(
    <ProcedimentosRealizadosDialog
      lead={LEAD}
      posVenda={{ id: "s6", name: "Pós-venda" }}
      onClose={onClose}
      onRegistrado={onRegistrado}
      {...over}
    />,
  );
  return { onClose, onRegistrado };
}

beforeEach(() => {
  registrar.mockReset();
  registrar.mockResolvedValue({});
});

describe("ProcedimentosRealizadosDialog", () => {
  it("lista só os procedimentos ativos e nada vem marcado", () => {
    abrir();
    expect(screen.getByLabelText(/Botox/)).not.toBeChecked();
    expect(screen.getByLabelText(/Preenchimento/)).not.toBeChecked();
    expect(screen.queryByText("Peeling")).toBeNull();
    expect(screen.getByTestId("salvar-procedimentos-realizados")).toBeDisabled();
  });

  it("salva vários como REALIZADOS sem data (servidor usa hoje) e depois avisa o quadro", async () => {
    const { onRegistrado } = abrir();
    fireEvent.click(screen.getByLabelText(/Botox/));
    fireEvent.click(screen.getByLabelText(/Preenchimento/));
    const salvar = screen.getByTestId("salvar-procedimentos-realizados");
    expect(salvar).toHaveTextContent("Salvar e ir para Pós-venda");
    fireEvent.click(salvar);
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar.mock.calls.map((c) => c[0])).toEqual([
      { procedimento_id: "p1", status: "realizado" },
      { procedimento_id: "p2", status: "realizado" },
    ]);
  });

  it("com data escolhida, manda a data", async () => {
    const { onRegistrado } = abrir();
    fireEvent.click(screen.getByLabelText(/Botox/));
    fireEvent.change(screen.getByLabelText(/Data em que foi feito/), { target: { value: "2026-10-10" } });
    fireEvent.click(screen.getByTestId("salvar-procedimentos-realizados"));
    await waitFor(() => expect(onRegistrado).toHaveBeenCalled());
    expect(registrar.mock.calls[0]![0]).toEqual({ procedimento_id: "p1", status: "realizado", realizado_em: "2026-10-10" });
  });

  it("sem pós-venda no funil o botão só diz Salvar", () => {
    abrir({ posVenda: null });
    expect(screen.getByTestId("salvar-procedimentos-realizados")).toHaveTextContent(/^Salvar$/);
  });

  it("falha ao salvar: não move o cartão e a janela continua aberta", async () => {
    registrar.mockRejectedValueOnce(new Error("422"));
    const { onRegistrado, onClose } = abrir();
    fireEvent.click(screen.getByLabelText(/Botox/));
    fireEvent.click(screen.getByTestId("salvar-procedimentos-realizados"));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(onRegistrado).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("procedimentos-realizados")).toBeInTheDocument();
  });

  it("'Agora não' fecha sem registrar nem mover", () => {
    const { onClose, onRegistrado } = abrir();
    fireEvent.click(screen.getByText("Agora não"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRegistrado).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });
});
