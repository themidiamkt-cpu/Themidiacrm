import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const salvarMutate = vi.hoisted(() => vi.fn());
const estado = vi.hoisted(() => ({ lista: [] as Array<Record<string, unknown>>, erro: null as unknown }));

vi.mock("@/hooks/procedimentos/useProcedimentos", () => ({
  useProcedimentos: () => ({ data: estado.lista, isLoading: false, isError: !!estado.erro, error: estado.erro }),
  useSalvarProcedimento: () => ({ mutate: salvarMutate, isPending: false }),
  useExcluirProcedimento: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

import { PainelDeProcedimentos } from "./_painel";

const ETAPAS = [
  { id: "e1", nome: "Retorno", funilId: "f1", funil: "Clínicas" },
  { id: "e2", nome: "Cliente", funilId: "f2", funil: "Clientes" },
];

beforeEach(() => {
  salvarMutate.mockReset();
  estado.lista = [];
  estado.erro = null;
});

describe("PainelDeProcedimentos", () => {
  it("avisa quando o recurso ainda não foi ativado (404)", () => {
    estado.erro = { status: 404 };
    render(<PainelDeProcedimentos etapas={ETAPAS} />);
    expect(screen.getByText("Procedimentos ainda não estão ativados nesta instalação.")).toBeInTheDocument();
  });

  it("cadastra: nome, meses, mensagem e etapa de destino", () => {
    render(<PainelDeProcedimentos etapas={ETAPAS} />);
    fireEvent.click(screen.getByTestId("novo-procedimento"));
    fireEvent.change(screen.getByLabelText("Procedimento"), { target: { value: "Botox" } });
    fireEvent.change(screen.getByLabelText("Dura (meses)"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Depois de enviar, mover o lead para"), { target: { value: "e1" } });
    fireEvent.click(screen.getByTestId("salvar-procedimento"));
    expect(salvarMutate).toHaveBeenCalledTimes(1);
    expect(salvarMutate.mock.calls[0]![0]).toMatchObject({
      nome: "Botox",
      meses_validade: 6,
      etapa_destino_id: "e1",
      ativo: true,
    });
  });

  it("não salva sem nome nem com meses inválidos", () => {
    render(<PainelDeProcedimentos etapas={ETAPAS} />);
    fireEvent.click(screen.getByTestId("novo-procedimento"));
    expect(screen.getByTestId("salvar-procedimento")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Procedimento"), { target: { value: "Botox" } });
    fireEvent.change(screen.getByLabelText("Dura (meses)"), { target: { value: "0" } });
    expect(screen.getByTestId("salvar-procedimento")).toBeDisabled();
  });

  it("a prévia mostra as variáveis trocadas", () => {
    render(<PainelDeProcedimentos etapas={ETAPAS} />);
    fireEvent.click(screen.getByTestId("novo-procedimento"));
    fireEvent.change(screen.getByLabelText("Procedimento"), { target: { value: "Botox" } });
    expect(screen.getByText(/Oi Maria!/)).toBeInTheDocument();
    expect(screen.getByText(/seu Botox/)).toBeInTheDocument();
  });

  it("lista o que já está cadastrado com a validade e o destino", () => {
    estado.lista = [{ id: "p1", nome: "Botox", meses_validade: 6, mensagem: "Oi", etapa_destino_id: "e2", ativo: true }];
    render(<PainelDeProcedimentos etapas={ETAPAS} />);
    expect(screen.getByText("Botox")).toBeInTheDocument();
    expect(screen.getByText(/Volta a cada 6 meses/)).toBeInTheDocument();
    expect(screen.getByText(/depois vai para Cliente/)).toBeInTheDocument();
  });
});
