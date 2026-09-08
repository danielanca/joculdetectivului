/*
 * Purpose: verifies that the visitor trigger email template renders device,
 * location, source detection and page URL correctly.
 */
import { describe, expect, test } from "vitest";
import { renderTriggerTemplate } from "src/server/notifications/templates/triggerTemplate";

const base = {
  typeEvent: "Pagină vizitată",
  url: "https://ancavisuals.ro/contact",
  browserVersion: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
  referrer: "direct",
  ipInfo: null,
  clientIp: "1.2.3.4",
  timestamp: "11/4/2026 10:30:00",
};

describe("renderTriggerTemplate", () => {
  describe("core content", () => {
    test("includes the event type in the header", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("Pagină vizitată");
    });

    test("includes the visited URL", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("https://ancavisuals.ro/contact");
    });

    test("includes the timestamp", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("11/4/2026 10:30:00");
    });

    test("returns a full HTML document", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("</html>");
    });
  });

  describe("browser and device detection", () => {
    test("detects Chrome browser from user agent", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("Chrome");
    });

    test("detects Desktop device from user agent", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("Desktop");
    });

    test("detects Windows OS from user agent", () => {
      const html = renderTriggerTemplate(base);
      expect(html).toContain("Windows");
    });

    test("detects Edge browser from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Edg/120.0" });
      expect(html).toContain("Edge");
    });

    test("detects Opera browser from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 OPR/105.0" });
      expect(html).toContain("Opera");
    });

    test("detects Firefox browser from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" });
      expect(html).toContain("Firefox");
    });

    test("detects Safari browser from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15" });
      expect(html).toContain("Safari");
    });

    test("detects macOS from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Version/17 Safari/605.1.15" });
      expect(html).toContain("macOS");
    });

    test("detects Linux OS from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
      expect(html).toContain("Linux");
    });

    test("detects Android OS from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36" });
      expect(html).toContain("Android");
    });

    test("detects Mobile device from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15" });
      expect(html).toContain("Mobil");
    });

    test("detects iPad (tablet) device from user agent", () => {
      const html = renderTriggerTemplate({ ...base, browserVersion: "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15" });
      expect(html).toContain("Tabletă (iPad)");
    });
  });

  describe("traffic source detection", () => {
    test("detects Instagram as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://l.instagram.com/?u=ancavisuals.ro" });
      expect(html).toContain("Instagram");
    });

    test("detects Facebook as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://www.facebook.com/share" });
      expect(html).toContain("Facebook");
    });

    test("detects Google as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://www.google.ro/search?q=fotograf" });
      expect(html).toContain("Google");
    });

    test("detects TikTok as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://www.tiktok.com/@ancavisuals" });
      expect(html).toContain("TikTok");
    });

    test("detects YouTube as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://youtu.be/abc123" });
      expect(html).toContain("YouTube");
    });

    test("detects Pinterest as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://pinterest.com/pin/123" });
      expect(html).toContain("Pinterest");
    });

    test("detects X / Twitter as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://t.co/abc" });
      expect(html).toContain("X / Twitter");
    });

    test("detects WhatsApp as traffic source", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://wa.me/40745000000" });
      expect(html).toContain("WhatsApp");
    });

    test("shows raw referrer as label when source is unrecognised", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://example-unknown.com" });
      expect(html).toContain("https://example-unknown.com");
    });

    test("labels a Google referrer as organic when it is not a paid click", () => {
      const html = renderTriggerTemplate({ ...base, referrer: "https://www.google.com/" });
      expect(html).toContain("Google (organic)");
      expect(html).not.toContain("Google Ads");
    });

    test("labels the visit as Google Ads when isGoogleAds is set", () => {
      const html = renderTriggerTemplate({
        ...base,
        referrer: "https://www.google.com/",
        isGoogleAds: true,
        utmCampaign: "nunta-cluj",
        gclid: "EAIaIQobChMlonggclidvalue123",
      });
      expect(html).toContain("Google Ads");
      expect(html).toContain("Click plătit din Google Ads");
      expect(html).toContain("nunta-cluj");
      expect(html).not.toContain("Google (organic)");
    });
  });

  describe("location rendering", () => {
    test("shows location info when ipInfo is provided", () => {
      const html = renderTriggerTemplate({
        ...base,
        ipInfo: { ip: "1.2.3.4", city: "Cluj-Napoca", region: "Cluj", country: "RO", loc: undefined, timezone: "Europe/Bucharest", org: "RDS", hostname: "" },
      });
      expect(html).toContain("Cluj-Napoca");
      expect(html).toContain("Europe/Bucharest");
    });

    test("renders a Google Maps link when valid coordinates are provided", () => {
      const html = renderTriggerTemplate({
        ...base,
        ipInfo: { ip: "1.2.3.4", city: "Cluj-Napoca", region: "Cluj", country: "RO", loc: "46.77,23.60", timezone: "Europe/Bucharest", org: "RDS", hostname: "" },
      });
      expect(html).toContain("google.com/maps");
      expect(html).toContain("46.77,23.60");
    });

    test("shows — for coordinates when loc is malformed (no comma)", () => {
      const html = renderTriggerTemplate({
        ...base,
        ipInfo: { ip: "1.2.3.4", city: "Cluj-Napoca", region: "Cluj", country: "RO", loc: "46.77", timezone: "Europe/Bucharest", org: "RDS", hostname: "" },
      });
      expect(html).not.toContain("google.com/maps");
    });

    test("shows client IP in the location row when ipInfo has no ip field", () => {
      const html = renderTriggerTemplate({
        ...base,
        ipInfo: { city: "Iași", region: "Iași", country: "RO", loc: undefined, timezone: "Europe/Bucharest", org: undefined, hostname: undefined },
        clientIp: "5.5.5.5",
      });
      expect(html).toContain("5.5.5.5");
    });

    test("shows client IP when ipInfo is null", () => {
      const html = renderTriggerTemplate({ ...base, ipInfo: null, clientIp: "9.8.7.6" });
      expect(html).toContain("9.8.7.6");
    });
  });
});
