/**
 * A chave "Organizar pela conversa (IA)" de cada funil.
 *
 * O que estes testes trancam: a tela abre com o que está gravado no funil, deixa
 * claro que a IA não envia mensagem, e grava SÓ a chave `organizador` (ligar a
 * IA não pode depender do formulário de vocabulário e campos, nem regravá-lo).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/app/actions/settings/updatePipelineConfig", () => ({
  updatePipelineConfig: vi.fn(async () => ({ ok: true })),
}));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { OrganizadorSection } from "./_organizador";

const salvar = () => fireEvent.click(screen.getByRole("button", { name: "Salvar organização pela conversa" }));

describe("OrganizadorSection", () => {
  beforeEach(() => vi.mocked(updatePipelineConfig).mockClear());

  it("funil que nunca ligou abre desligado e diz que a IA não envia mensagem", () => {
    render(<OrganizadorSection pipelineId="p1" pipelineName="Clientes" settings={null} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Ela não envia mensagem nem responde ao cliente/)).toBeInTheDocument();
    expect(screen.getByLabelText("Como reconhecer cada etapa")).toHaveValue("");
  });

  it("abre com o que está gravado no funil", () => {
    render(
      <OrganizadorSection
        pipelineId="p1"
        pipelineName="Clientes"
        settings={{ organizador: { ligado: true, instrucoes: "Agendada: dia e hora combinados." } }}
      />,
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Como reconhecer cada etapa")).toHaveValue("Agendada: dia e hora combinados.");
  });

  it("grava só a chave do organizador, com as instruções aparadas", async () => {
    render(<OrganizadorSection pipelineId="p1" pipelineName="Clientes" settings={{ lost_reasons: ["Mora longe"] }} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText("Como reconhecer cada etapa"), {
      target: { value: "  Em conversa: já respondeu e não marcou.  " },
    });
    salvar();
    await waitFor(() => expect(updatePipelineConfig).toHaveBeenCalledTimes(1));
    expect(updatePipelineConfig).toHaveBeenCalledWith("p1", {
      organizador: { ligado: true, instrucoes: "Em conversa: já respondeu e não marcou." },
    });
  });

  it("desligar também é gravado", async () => {
    render(
      <OrganizadorSection pipelineId="p9" pipelineName="Sites" settings={{ organizador: { ligado: true, instrucoes: "x" } }} />,
    );
    fireEvent.click(screen.getByRole("switch"));
    salvar();
    await waitFor(() => expect(updatePipelineConfig).toHaveBeenCalledTimes(1));
    expect(updatePipelineConfig).toHaveBeenCalledWith("p9", { organizador: { ligado: false, instrucoes: "x" } });
  });
});
