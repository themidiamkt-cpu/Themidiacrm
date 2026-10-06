/**
 * A primeira mensagem de uma abordagem manual da prospecção devolve a conversa
 * ao agente da campanha, em vez de deixá-la "assumida" por quem enviou.
 *
 * Exercita a rota real de envio com o banco dublado, como
 * `resposta-humana-assume-conversa-livre.test.ts` — é o mesmo trecho da rota, do
 * outro lado da decisão.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAuthDual } from "@/lib/api/auth-dual";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { devolverAtendimentoAoAgente } from "@/lib/escalacao/retomada";
import { agenteDaAberturaManual } from "@/lib/prospecting/abertura-manual";

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/api/auth-dual", () => ({ resolveAuthDual: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({
  registrarTrocaDeComando: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/prospecting/abertura-manual", () => ({ agenteDaAberturaManual: vi.fn() }));
vi.mock("@/lib/escalacao/retomada", () => ({ devolverAtendimentoAoAgente: vi.fn() }));

const organizationId = "22222222-2222-4222-8222-222222222222";
const conversationId = "44444444-4444-4444-8444-444444444444";
const userId = "11111111-1111-4111-8111-111111111111";
const agenteId = "963a0f8d-e632-47c2-8f21-324615ec082f";
const rpc = vi.fn();
const from = vi.fn(() => {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    // A empresa ligou "a conversa fica com quem atendeu": sem a devolução, a
    // rota assumiria a conversa — é o que os casos abaixo distinguem.
    maybeSingle: async () => ({
      data: { settings: { routing: { mode: "manual", conversation_stays_with_attendant: true } } },
      error: null,
    }),
  };
  return cadeia;
});

function req() {
  return new NextRequest("http://localhost/api/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, type: "text", body: "Oi!" }),
  });
}

function comoSessao(via: "session" | "token" = "session") {
  vi.mocked(resolveAuthDual).mockResolvedValue({
    ok: true,
    via,
    organizationId,
    actor: { type: "user", id: userId },
    supabase: { rpc, from } as never,
    idioma: "pt-BR",
    scopes: [],
  } as never);
}

const assumiu = () => rpc.mock.calls.some(([nome]) => nome === "fn_conversation_assign");

beforeEach(() => {
  vi.clearAllMocks();
  comoSessao();
  vi.mocked(sendMessageHandler).mockResolvedValue({
    id: "message-1",
    conversation_id: conversationId,
    status: "sent",
  } as never);
  rpc.mockResolvedValue({ data: [{ id: conversationId, contact_id: null }], error: null });
  vi.mocked(agenteDaAberturaManual).mockResolvedValue(agenteId);
  vi.mocked(devolverAtendimentoAoAgente).mockResolvedValue({
    ok: true,
    conversationId,
    jaEstavaComOAgente: false,
    continuidade: { houveAtendimentoHumano: false, resumo: "", decisoes: [], notas: [] },
  } as never);
});

describe("POST /messages na abertura de uma prospecção manual", () => {
  it("devolve a conversa ao agente pela regra do botão e não a assume", async () => {
    const { POST } = await import("@/app/api/v1/messages/route");
    const response = await POST(req());
    expect(response.status).toBe(201);
    expect(agenteDaAberturaManual).toHaveBeenCalledWith(
      expect.anything(),
      organizationId,
      conversationId,
    );
    expect(devolverAtendimentoAoAgente).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, actor: { type: "user", id: userId } }),
      { conversationId },
    );
    expect(assumiu()).toBe(false);
  });

  it("a leitura é disparada antes do envio: depende de a conversa ainda não ter saída", async () => {
    const ordem: string[] = [];
    vi.mocked(agenteDaAberturaManual).mockImplementation(async () => {
      ordem.push("leitura");
      return agenteId;
    });
    vi.mocked(sendMessageHandler).mockImplementation(async () => {
      // Dá a vez à leitura, como o envio real dá a cada ida ao banco.
      await new Promise((resolver) => setTimeout(resolver, 0));
      ordem.push("envio");
      return { id: "message-1", conversation_id: conversationId, status: "sent" } as never;
    });
    const { POST } = await import("@/app/api/v1/messages/route");
    await POST(req());
    expect(ordem).toEqual(["leitura", "envio"]);
  });

  it("mensagem comum (não é abertura): vale a regra de sempre e a conversa é assumida", async () => {
    vi.mocked(agenteDaAberturaManual).mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/messages/route");
    expect((await POST(req())).status).toBe(201);
    expect(devolverAtendimentoAoAgente).not.toHaveBeenCalled();
    expect(assumiu()).toBe(true);
  });

  it("se a devolução falha, a conversa não fica sem dono: é assumida", async () => {
    vi.mocked(devolverAtendimentoAoAgente).mockResolvedValue({
      ok: false,
      erro: "assignment_conflict",
    } as never);
    const { POST } = await import("@/app/api/v1/messages/route");
    expect((await POST(req())).status).toBe(201);
    expect(assumiu()).toBe(true);
  });

  it("envio que falhou não devolve nada", async () => {
    vi.mocked(sendMessageHandler).mockResolvedValue({
      id: "message-1",
      conversation_id: conversationId,
      status: "failed",
    } as never);
    const { POST } = await import("@/app/api/v1/messages/route");
    await POST(req());
    expect(devolverAtendimentoAoAgente).not.toHaveBeenCalled();
    expect(assumiu()).toBe(false);
  });

  it("erro na leitura não derruba o envio", async () => {
    vi.mocked(agenteDaAberturaManual).mockRejectedValue(new Error("banco fora do ar"));
    const { POST } = await import("@/app/api/v1/messages/route");
    expect((await POST(req())).status).toBe(201);
    expect(devolverAtendimentoAoAgente).not.toHaveBeenCalled();
    expect(assumiu()).toBe(true);
  });
});
