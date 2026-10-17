import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ data: undefined as unknown, isError: false }));
vi.mock("@/hooks/procedimentos/useRetornos", () => ({
  useRetornosDeProcedimentos: () => ({ data: estado.data, isError: estado.isError }),
}));

import { RetornosNaFila, RetornosNosFluxos } from "./RetornosDeProcedimentos";

const RESUMO = {
  procedimentos: [
    { id: "p1", nome: "Botox", meses_validade: 6, ativo: true, aguardando: 3, proximo_vencimento: "2026-11-05", enviados_30d: 2 },
    { id: "p2", nome: "Peeling", meses_validade: 1, ativo: false, aguardando: 0, proximo_vencimento: null, enviados_30d: 0 },
  ],
  fila: [
    { id: "a", lead_id: "l1", contact_id: "c1", procedimento_id: "p1", paciente: "Maria Silva", procedimento: "Botox", realizado_em: "2026-05-05", vence_em: "2026-11-05", estado: "aguardando", quando: null },
    { id: "b", lead_id: "l2", contact_id: "c2", procedimento_id: "p1", paciente: "Ana", procedimento: "Botox", realizado_em: "2026-04-01", vence_em: "2026-10-01", estado: "enviado", quando: "2026-10-01T15:00:00Z" },
  ],
};

beforeEach(() => {
  estado.data = RESUMO;
  estado.isError = false;
});

describe("Retornos de procedimentos na tela Follow-ups", () => {
  it("Fluxos: um cartão por procedimento com validade, quem aguarda e o estado", () => {
    render(<RetornosNosFluxos canWrite />);
    expect(screen.getByText("Retorno · Botox")).toBeInTheDocument();
    expect(screen.getByText("Retorno · Peeling")).toBeInTheDocument();
    expect(screen.getByText("Pausado")).toBeInTheDocument();
    expect(screen.getByText("6 meses")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const atalhos = screen.getAllByText("Editar mensagem e etapa");
    expect(atalhos).toHaveLength(2); // um por cartão
    expect(atalhos[0]!.closest("a")).toHaveAttribute("href", "/app/settings/procedimentos");
  });

  it("Fluxos: 'Ver pessoas' abre a lista de quem está no retorno daquele procedimento, com link para o contato", () => {
    render(<RetornosNosFluxos canWrite />);
    expect(screen.getAllByText("Pessoas no fluxo").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("ver-pessoas-p1"));
    const janela = screen.getByTestId("pessoas-do-retorno");
    expect(within(janela).getByText("Maria Silva").closest("a")).toHaveAttribute("href", "/app/contacts/c1");
    expect(within(janela).getByText("Ana")).toBeInTheDocument();
    expect(within(janela).getByText("Aguardando o vencimento")).toBeInTheDocument();
    expect(within(janela).getByText("Enviado")).toBeInTheDocument();
  });

  it("Fluxos: procedimento sem ninguém mostra a mensagem vazia", () => {
    render(<RetornosNosFluxos canWrite />);
    fireEvent.click(screen.getByTestId("ver-pessoas-p2"));
    expect(within(screen.getByTestId("pessoas-do-retorno")).getByText("Ninguém neste retorno por enquanto.")).toBeInTheDocument();
  });

  it("Fluxos: quem só lê não vê o atalho de edição", () => {
    render(<RetornosNosFluxos canWrite={false} />);
    expect(screen.queryAllByText("Editar mensagem e etapa")).toHaveLength(0);
  });

  it("Fila: lista os pacientes com a situação", () => {
    render(<RetornosNaFila />);
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText("Aguardando o vencimento")).toBeInTheDocument();
    expect(screen.getByText("Enviado")).toBeInTheDocument();
  });

  it("some sem catálogo, sem fila ou quando o recurso não está ativado", () => {
    estado.data = { procedimentos: [], fila: [] };
    const a = render(<RetornosNosFluxos canWrite />);
    expect(a.container).toBeEmptyDOMElement();
    const b = render(<RetornosNaFila />);
    expect(b.container).toBeEmptyDOMElement();
    estado.data = undefined;
    estado.isError = true;
    const c = render(<RetornosNosFluxos canWrite />);
    expect(c.container).toBeEmptyDOMElement();
  });
});
