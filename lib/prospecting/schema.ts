import { z } from "zod";

export const campaignConfigSchema = z
  .object({
    agent_id: z.string().uuid(),
    channel_session_id: z.string().uuid(),
    pipeline_id: z.string().uuid(),
    stage_id: z.string().uuid(),
    qualified_stage_id: z.string().uuid(),
    instruction: z.string().trim().min(10).max(2000),
    qualification: z.string().trim().min(10).max(2000),
    daily_limit: z.number().int().min(1).max(50).default(10),
    interval_minutes: z.number().int().min(5).max(1440).default(15),
    legal_basis_ref: z.string().trim().min(3).max(500),
  })
  .strict();
/**
 * Abordagem MANUAL: a IA só redige a primeira mensagem de cada empresa; quem
 * envia é uma pessoa, pelo Inbox. Mora no mesmo `config` da campanha e se
 * distingue por `mode` — a campanha automática não tem esse campo, então uma
 * nunca passa pelo schema da outra (os dois são `.strict()`).
 *
 * `agent_id` é opcional: quando informado, a conversa nasce ligada a esse
 * agente, que atende as respostas depois que a pessoa devolve a conversa à IA.
 */
export const manualMessageConfigSchema = z
  .object({
    mode: z.literal("manual_message"),
    channel_session_id: z.string().uuid(),
    pipeline_id: z.string().uuid(),
    stage_id: z.string().uuid(),
    agent_id: z.string().uuid().nullable().default(null),
    base_message: z.string().trim().min(10).max(2000),
    personalize: z.boolean().default(true),
    only_without_site: z.boolean().default(false),
    legal_basis_ref: z.string().trim().min(3).max(500),
  })
  .strict();
export type ManualMessageConfig = z.infer<typeof manualMessageConfigSchema>;
export function isManualMessageConfig(config: unknown): config is ManualMessageConfig {
  return (
    !!config &&
    typeof config === "object" &&
    (config as { mode?: unknown }).mode === "manual_message"
  );
}
export const searchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    niche: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(160),
    limit: z.number().int().min(1).max(100).default(20),
    budget_usd: z.number().min(0.5).max(10).default(1),
    enrich: z.boolean().default(true),
    /**
     * Descarta, na importação, a empresa que tem site PRÓPRIO (regra de
     * `site-proprio.ts`: Instagram, Facebook e link de WhatsApp não contam). O
     * filtro do provedor ("withoutWebsite") não serve: ele trata perfil de rede
     * social como site e jogaria fora exatamente o público de uma oferta de site.
     */
    only_without_site: z.boolean().default(false),
  })
  .strict();
export const prospectingInputSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("configure"), api_key: z.string().trim().min(10).max(500) })
    .strict(),
  z
    .object({ action: z.literal("search"), search: searchSchema, request_id: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("start"), id: z.string().uuid(), config: campaignConfigSchema })
    .strict(),
  z
    .object({
      action: z.literal("prepare_manual"),
      id: z.string().uuid(),
      config: manualMessageConfigSchema,
    })
    .strict(),
  z.object({ action: z.literal("pause"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("resume"), id: z.string().uuid() }).strict(),
]);
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export interface Prospect {
  key: string;
  name: string;
  phone: string | null;
  website: string | null;
  category: string | null;
  address: string | null;
  maps_url: string | null;
  rating: number | null;
  reviews: number | null;
  emails: string[];
  socials: string[];
}

/** The existing Maps integrations normalize Brazilian numbers; never guess a foreign country. */
export function normalizeProspect(item: Record<string, unknown>): Prospect | null {
  const str = (key: string, limit = 500) =>
    typeof item[key] === "string" ? (item[key] as string).trim().slice(0, limit) : null;
  const name = str("title", 200);
  const place = str("placeId", 200);
  if (!name || !place || item.permanentlyClosed === true || item.temporarilyClosed === true)
    return null;
  const raw = str("phoneUnformatted") || str("phone") || "";
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && [10, 11].includes(digits.length)) digits = `55${digits}`;
  const phone = /^55\d{10,11}$/.test(digits) ? `+${digits}` : null;
  const urls = (key: string) =>
    Array.isArray(item[key])
      ? (item[key] as unknown[])
          .filter((v): v is string => typeof v === "string" && v.length < 500)
          .slice(0, 5)
      : [];
  return {
    key: place,
    name,
    phone,
    website: str("website"),
    category: str("categoryName"),
    address: str("address"),
    maps_url: str("url"),
    rating: typeof item.totalScore === "number" ? item.totalScore : null,
    reviews: typeof item.reviewsCount === "number" ? item.reviewsCount : null,
    emails: urls("emails"),
    socials: ["instagrams", "facebooks", "linkedIns"].flatMap(urls),
  };
}

export function safePublicLink(value: string | null): string | undefined {
  try {
    const u = new URL(value ?? "");
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Public business context shared by prospecting and the Inbox; no raw provider payload. */
export const prospectEnrichmentSchema = z.object({
  name: z.string().max(200),
  category: z.string().max(500).nullable(),
  address: z.string().max(500).nullable(),
  website: z.string().max(500).nullable(),
  maps_url: z.string().max(500).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviews: z.number().int().nonnegative().nullable(),
  emails: z.array(z.string().max(500)).max(5),
  socials: z.array(z.string().max(500)).max(15),
});
export type ProspectEnrichment = z.infer<typeof prospectEnrichmentSchema>;
