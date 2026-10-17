/**
 * Seção "Procedimentos" do dossiê: registrar, marcar como realizado e a regra
 * de "realizado sem data = hoje, decidido pelo servidor".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const registrarMutate = vi.hoisted(() => vi.fn());
const atualizarMutate = vi.hoisted(() => vi.fn());
const registros = vi.hoisted(() => ({
  valor: [] as Array<Record<string, unknown>>,
  erro: false,
}));

vi.mock("@/hooks/procedimentos/useProcedimentos", () => ({
  useProcedimentos: () => ({
    data: [
      { id: "p1", nome: "Botox", meses_validade: 6, mensagem: "x", etapa_destino_id: null, ativo: true },
      { id: "p2", nome: "Peeling", meses_validade: 3, mensagem: "y", etapa_destino_id: null, ativo: false },
    ],
  }),
}));
vi.mock("@/hooks/procedimentos/useProcedimentosDoLead", () => ({
  useProcedimentosDoLead: () => ({ data: registros.valor, isLoading: false, isError: registros.erro }),
  useRegistrarProcedimentoDoLead: () => ({ mutate: registrarMutate, isPending: false }),
  useAtualizarProcedimentoDoLead: () => ({ mutate: atualizarMutate, isPending: false }),
  useExcluirProcedimentoDoLead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

import { ProcedimentosDoNegocio } from "./ProcedimentosDoNegocio";

beforeEach(() => {
  registrarMutate.mockReset();
  atualizarMutate.mockReset();
  registros.valor = [];
  registros.erro = false;
});

describe("ProcedimentosDoNegocio", () => {
  it("some quando o recurso não está ativado (erro de leitura)", () => {
    registros.erro = true;
    const { container } = render(<ProcedimentosDoNegocio leadId="l1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("só oferece procedimentos ativos e registra 'já foi feito' SEM data (o servidor usa hoje)", () => {
    render(<ProcedimentosDoNegocio leadId="l1" />);
    fireEvent.click(screen.getByText("Adicionar"));
    const select = screen.getByLabelText("Procedimento") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Escolha o procedimento", "Botox (6 meses)"]);
    fireEvent.change(select, { target: { value: "p1" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(registrarMutate).toHaveBeenCalledTimes(1);
    expect(registrarMutate.mock.calls[0]![0]).toEqual({ procedimento_id: "p1", status: "realizado" });
  });

  it("agendado exige a data", () => {
    render(<ProcedimentosDoNegocio leadId="l1" />);
    fireEvent.click(screen.getByText("Adicionar"));
    fireEvent.change(screen.getByLabelText("Procedimento"), { target: { value: "p1" } });
    fireEvent.click(screen.getByLabelText("Agendado"));
    fireEvent.click(screen.getByText("Salvar"));
    expect(registrarMutate).not.toHaveBeenCalled();
  });

  it("mostra quando o retorno vence e deixa marcar um agendado como realizado", () => {
    registros.valor = [
      { id: "r1", nome: "Botox", status: "realizado", realizado_em: "2026-04-15", vence_em: "2026-10-15", agendado_para: null, lembrete_enviado_em: null, lembrete_resultado: null },
      { id: "r2", nome: "Peeling", status: "agendado", realizado_em: null, vence_em: null, agendado_para: "2026-11-01", lembrete_enviado_em: null, lembrete_resultado: null },
    ];
    render(<ProcedimentosDoNegocio leadId="l1" />);
    expect(screen.getByText(/retorno em/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Marcar como realizado"));
    expect(atualizarMutate).toHaveBeenCalledWith({ id: "r2", status: "realizado" });
  });
});
