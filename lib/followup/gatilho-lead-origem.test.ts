/**
 * Gatilho "Lead criado" com o filtro "só quem chegou por anúncio online".
 *
 * Arquivo próprio, ao lado de `gatilho-lead.test.ts`: aquele mede o gatilho sem
 * filtro e continua valendo inteiro; este mede só o que o filtro acrescenta.
 */
import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { triggerConfigSchema } from "./api-schemas";
import type { FollowupGateDb } from "./agent-followup-gate";
import {
  EVENTO_DE_LEAD_CRIADO,
  aplicaGatilhoDeLead,
  type GatilhoLeadDb,
  type PointerDeLead,
} from "./gatilho-lead";

const ORG = "11111111-1111-1111-1111-111111111111";
const CONTATO = "55555555-5555-5555-5555-555555555555";
const VERSION = "99999999-9999-9999-9999-999999999999";

const pointer = (id: string, soDeAnuncio: boolean): PointerDeLead => ({
  id,
  organization_id: ORG,
  active_version_id: VERSION,
  so_de_anuncio: soDeAnuncio,
});
const SO_ANUNCIO = pointer("22222222-2222-2222-2222-222222222222", true);
const TODO_LEAD = pointer("66666666-6666-6666-6666-666666666666", false);

function banco(opts: {
  pointers: PointerDeLead[];
  origem?: unknown;
  semLeituraDeOrigem?: boolean;
}) {
  const inscritos: string[] = [];
  let leiturasDaOrigem = 0;
  const db: GatilhoLeadDb = {
    carregaPointersDeLead: async () => opts.pointers,
    carregaContatoDoNegocio: async () => CONTATO,
    carregaNoDeGatilho: async () => ({ id: "t1", pedeAgente: false }),
    insereEnrollment: async (input) => {
      inscritos.push(input.pointer_id);
      return { inserted: true, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    },
    insereEventoDoEnrollment: async () => undefined,
    ...(opts.semLeituraDeOrigem
      ? {}
      : {
          carregaOrigemDoContato: async (orgId: string, contactId: string) => {
            expect([orgId, contactId]).toEqual([ORG, CONTATO]);
            leiturasDaOrigem++;
            return opts.origem ?? null;
          },
        }),
  };
  return { db, inscritos, leituras: () => leiturasDaOrigem };
}

const gate: FollowupGateDb = { loadEnabledPublishedFollowupAgents: async () => [] };
const deps = (db: GatilhoLeadDb) => ({
  db,
  gateDb: gate,
  clock: () => new Date("2026-10-07T12:00:00Z"),
});

const evento: EventRow = {
  id: "e0000000-0000-4000-8000-000000000001",
  organization_id: ORG,
  event_type: EVENTO_DE_LEAD_CRIADO,
  entity_kind: "crm_lead",
  entity_id: "44444444-4444-4444-4444-444444444444",
  payload: {},
  metadata: {},
  consumed_by: [],
  attempts: 0,
};

describe("gatilho Lead criado: só quem chegou por anúncio", () => {
  it("contato que veio de anúncio entra no fluxo", async () => {
    const b = banco({ pointers: [SO_ANUNCIO], origem: { ad_platform: "meta_ads" } });
    const s = await aplicaGatilhoDeLead(deps(b.db), evento);
    expect(s.enrolled).toBe(1);
    expect(s.fora_da_origem).toBeUndefined();
    expect(b.inscritos).toEqual([SO_ANUNCIO.id]);
  });

  it("contato que não veio de anúncio fica de fora, e isso é contado", async () => {
    const b = banco({ pointers: [SO_ANUNCIO], origem: { ad_platform: "site" } });
    const s = await aplicaGatilhoDeLead(deps(b.db), evento);
    expect(s).toMatchObject({ enrolled: 0, fora_da_origem: 1, pointers_armados: 1 });
    expect(b.inscritos).toEqual([]);
  });

  it("o filtro é de cada fluxo: o fluxo sem filtro continua inscrevendo todo lead", async () => {
    const b = banco({ pointers: [SO_ANUNCIO, TODO_LEAD], origem: null });
    const s = await aplicaGatilhoDeLead(deps(b.db), evento);
    expect(s).toMatchObject({ enrolled: 1, fora_da_origem: 1 });
    expect(b.inscritos).toEqual([TODO_LEAD.id]);
    // Uma leitura da origem por evento, não uma por fluxo.
    expect(b.leituras()).toBe(1);
  });

  it("sem fluxo que peça a origem, ela nem é lida", async () => {
    const b = banco({ pointers: [TODO_LEAD], origem: { ad_platform: "meta_ads" } });
    await aplicaGatilhoDeLead(deps(b.db), evento);
    expect(b.leituras()).toBe(0);
    expect(b.inscritos).toEqual([TODO_LEAD.id]);
  });

  it("sem como provar a origem, o fluxo filtrado não inscreve ninguém", async () => {
    const b = banco({ pointers: [SO_ANUNCIO], semLeituraDeOrigem: true });
    const s = await aplicaGatilhoDeLead(deps(b.db), evento);
    expect(s).toMatchObject({ enrolled: 0, fora_da_origem: 1 });
  });
});

describe("forma do gatilho", () => {
  it("aceita o filtro de anúncio e continua aceitando o gatilho sem filtro", () => {
    expect(
      triggerConfigSchema.safeParse({ kind: "lead_created", params: { origem: "anuncio" } })
        .success,
    ).toBe(true);
    expect(triggerConfigSchema.safeParse({ kind: "lead_created" }).success).toBe(true);
    expect(triggerConfigSchema.safeParse({ kind: "lead_created", params: {} }).success).toBe(true);
  });
  it("recusa origem que o motor não conhece", () => {
    expect(
      triggerConfigSchema.safeParse({ kind: "lead_created", params: { origem: "indicacao" } })
        .success,
    ).toBe(false);
  });
});
