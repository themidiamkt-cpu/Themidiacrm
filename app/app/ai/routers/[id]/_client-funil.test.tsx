/**
 * O cartão "Quem está em um funil" do roteador (`config.pipeline_agents`).
 *
 * O que a tela precisa garantir: a regra gravada aparece, uma linha pela metade
 * não é salva, e tirar a linha grava a lista vazia (é assim que a regra é
 * desligada, e o agente volta a não ter trava de funil).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { atualizar } = vi.hoisted(() => ({ atualizar: vi.fn(async (_patch: unknown) => undefined) }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { modulos_ligados: [] } }),
  usePermission: () => true,
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/followup/useFollowupFlows", () => ({ useFollowupFlows: () => ({ data: undefined }) }));
vi.mock("@/hooks/ai/useRouters", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useRouter: () => ({ data: undefined }),
    useUpdateRouter: () => ({ mutate: vi.fn(), mutateAsync: atualizar, isPending: false }),
    useDeleteRouter: mut,
    useSaveMembers: mut,
    useTestRouter: () => ({ ...mut(), data: undefined }),
  };
});

import { RouterEditorClient } from "./_client";

const FUNIL = "66666666-6666-4666-8666-666666666666";
const AGENTE = "77777777-7777-4777-8777-777777777777";

beforeEach(() => atualizar.mockClear());
afterEach(cleanup);

function renderizar(config: Record<string, unknown>) {
  return render(
    <RouterEditorClient
      routerId="r1"
      initialState={{
        router: {
          id: "r1",
          name: "Roteador",
          channel_session_id: "s1",
          is_active: true,
          config,
          fallback_agent_id: null,
        },
        members: [],
      }}
      agents={[{ id: AGENTE, name: "Atendente Anúncios" }]}
      pipelines={[{ id: FUNIL, name: "Clínicas de Estética" }]}
      channelSessions={[]}
      classifierModels={[]}
    />,
  );
}

const salvar = () => screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;

describe('roteador: cartão "Quem está em um funil"', () => {
  it("sem regra gravada: o cartão diz que o funil não decide, e nada está por salvar", () => {
    renderizar({});
    const cartao = screen.getByTestId("roteador-funil");
    expect(within(cartao).getByText("Nenhum funil escolhido. O funil do contato não decide quem atende.")).toBeTruthy();
    expect(screen.queryAllByTestId("roteador-funil-regra")).toHaveLength(0);
    expect(salvar().disabled).toBe(true);
  });

  it("regra gravada aparece com o funil e o agente pelo nome", () => {
    renderizar({ pipeline_agents: [{ pipeline_id: FUNIL, agent_id: AGENTE }] });
    const linhas = screen.getAllByTestId("roteador-funil-regra");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.textContent).toContain("Clínicas de Estética");
    expect(linhas[0]!.textContent).toContain("Atendente Anúncios");
    // Igual ao que está gravado: nada por salvar.
    expect(salvar().disabled).toBe(true);
  });

  it("linha pela metade avisa e não deixa salvar", () => {
    renderizar({});
    fireEvent.click(within(screen.getByTestId("roteador-funil")).getByRole("button", { name: "Funil" }));
    expect(screen.getAllByTestId("roteador-funil-regra")).toHaveLength(1);
    expect(screen.getByText("Escolha o funil e o agente de cada linha.")).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("tirar a linha grava a lista vazia, sem mexer no agente de anúncio", async () => {
    renderizar({ pipeline_agents: [{ pipeline_id: FUNIL, agent_id: AGENTE }], ad_origin_agent_id: AGENTE });
    fireEvent.click(screen.getByRole("button", { name: "Remover funil" }));
    expect(screen.queryAllByTestId("roteador-funil-regra")).toHaveLength(0);
    expect(salvar().disabled).toBe(false);
    fireEvent.click(salvar());
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    const enviado = atualizar.mock.calls[0]![0] as { config: Record<string, unknown> };
    expect(enviado.config.pipeline_agents).toEqual([]);
    expect(enviado.config.ad_origin_agent_id).toBe(AGENTE);
  });
});
