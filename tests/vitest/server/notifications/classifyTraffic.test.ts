/*
 * Purpose: the "Ofertă / Campanie vizualizată" email must say in its title whether
 * a visit came from Google Ads vs organic search vs direct.
 */
import { describe, expect, test } from "vitest";
import { classifyTraffic } from "src/server/notifications/offerViewNotification";

describe("classifyTraffic", () => {
  test("gclid in the URL → Google Ads, even when the referrer is google.com", () => {
    const r = classifyTraffic(
      "https://ancavisuals.ro/oferta/olx?gad_source=1&gad_campaignid=24155613782&gclid=Cj0KCQ",
      "https://www.google.com/",
    );
    expect(r.label).toBe("Google Ads");
    expect(r.detail).toContain("24155613782");
  });

  test("gad_source=1 alone → Google Ads", () => {
    expect(classifyTraffic("https://ancavisuals.ro/oferta/x?gad_source=1", "").label).toBe("Google Ads");
  });

  test("utm_source=google + utm_medium=cpc → Google Ads", () => {
    expect(classifyTraffic("https://ancavisuals.ro/oferta/x?utm_source=google&utm_medium=cpc", "").label).toBe("Google Ads");
  });

  test("plain google.com referrer, no ad params → Google organic", () => {
    expect(classifyTraffic("https://ancavisuals.ro/oferta/x", "https://www.google.com/").label).toBe("Google organic");
  });

  test("facebook referrer → Social", () => {
    expect(classifyTraffic("https://ancavisuals.ro/oferta/x", "https://m.facebook.com/").label).toBe("Social");
  });

  test("no referrer, no params → Direct", () => {
    expect(classifyTraffic("https://ancavisuals.ro/oferta/x", "Acces direct").label).toBe("Direct");
  });

  test("other website referrer → Referral", () => {
    expect(classifyTraffic("https://ancavisuals.ro/oferta/x", "https://nunta-blog.ro/recomandari").label).toBe("Referral");
  });

  test("manual utm campaign (non-google) → Campanie <source>", () => {
    const r = classifyTraffic("https://ancavisuals.ro/oferta/x?utm_source=olx&utm_medium=listing&utm_campaign=vara", "");
    expect(r.label).toBe("Campanie olx");
    expect(r.detail).toContain("vara");
  });
});
