import { describe, expect, it } from "vitest";

import { veioDeAnuncio } from "./veio-de-anuncio";

describe("veioDeAnuncio", () => {
  it("clique para o WhatsApp e clique do Google são anúncio", () => {
    expect(veioDeAnuncio({ ad_platform: "meta_ads", ad_id: "120252627572370603" })).toBe(true);
    expect(veioDeAnuncio({ ad_platform: "google_ads" })).toBe(true);
    expect(veioDeAnuncio({ ad_platform: " Meta_Ads " })).toBe(true);
  });

  it("site só conta com sinal de mídia paga", () => {
    expect(veioDeAnuncio({ ad_platform: "site" })).toBe(false);
    expect(veioDeAnuncio({ ad_platform: "site", utm_source: "instagram" })).toBe(false);
    expect(veioDeAnuncio({ ad_platform: "site", utm_medium: "organic" })).toBe(false);
    expect(veioDeAnuncio({ ad_platform: "site", utm_campaign: "diagnostico-outubro" })).toBe(true);
    expect(veioDeAnuncio({ ad_platform: "site", utm_ad: "video-01" })).toBe(true);
    expect(veioDeAnuncio({ ad_platform: "site", gclid: "Cj0KCQ" })).toBe(true);
    expect(veioDeAnuncio({ ad_platform: "site", utm_medium: "Paid_Social" })).toBe(true);
    expect(veioDeAnuncio({ utm_medium: "cpc" })).toBe(true);
  });

  it("sem origem, origem vazia ou valor torto: não é anúncio", () => {
    for (const meta of [
      null,
      undefined,
      {},
      [],
      "meta_ads",
      7,
      { ad_platform: "" },
      { ad_platform: 3 },
    ])
      expect(veioDeAnuncio(meta), JSON.stringify(meta)).toBe(false);
    expect(veioDeAnuncio({ waha_lid: "130971101835434", notify_name: "Nah" })).toBe(false);
  });
});
