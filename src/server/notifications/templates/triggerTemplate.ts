import type { IpInfo } from "../../utils/ipinfo";

interface TriggerTemplateData {
  typeEvent: string;
  url: string;
  browserVersion: string;
  referrer?: string;
  ipInfo: IpInfo | null;
  clientIp: string;
  timestamp: string;
  isNewVisitor?: boolean;
  aiSource?: string | null;
  isGoogleAds?: boolean;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;
  landingPath?: string;
  keyword?: string;
}

function detectSource(referrer: string): { label: string; color: string; emoji: string } {
  if (!referrer || referrer === "direct") return { label: "Direct / Unknown", color: "#6b7280", emoji: "🔗" };
  const r = referrer.toLowerCase();
  if (r.includes("instagram.com") || r.includes("l.instagram")) return { label: "Instagram", color: "#e1306c", emoji: "📸" };
  if (r.includes("facebook.com") || r.includes("fb.com") || r.includes("m.facebook")) return { label: "Facebook", color: "#1877f2", emoji: "👍" };
  if (r.includes("google.com") || r.includes("google.ro")) return { label: "Google", color: "#4285f4", emoji: "🔍" };
  if (r.includes("tiktok.com")) return { label: "TikTok", color: "#010101", emoji: "🎵" };
  if (r.includes("youtube.com") || r.includes("youtu.be")) return { label: "YouTube", color: "#ff0000", emoji: "▶️" };
  if (r.includes("pinterest.com")) return { label: "Pinterest", color: "#e60023", emoji: "📌" };
  if (r.includes("twitter.com") || r.includes("t.co") || r.includes("x.com")) return { label: "X / Twitter", color: "#1da1f2", emoji: "🐦" };
  if (r.includes("whatsapp.com") || r.includes("wa.me")) return { label: "WhatsApp", color: "#25d366", emoji: "💬" };
  return { label: referrer, color: "#6b7280", emoji: "🌐" };
}

function parseDevice(ua: string): { device: string; browser: string; os: string } {
  if (!ua) return { device: "Unknown", browser: "Unknown", os: "Unknown" };
  const uaLower = ua.toLowerCase();

  const device = /mobile|android|iphone|ipad/.test(uaLower)
    ? /ipad/.test(uaLower) ? "Tabletă (iPad)" : "Mobil"
    : "Desktop";

  let browser = "Unknown";
  if (uaLower.includes("edg/")) browser = "Edge";
  else if (uaLower.includes("opr/") || uaLower.includes("opera")) browser = "Opera";
  else if (uaLower.includes("chrome/") && !uaLower.includes("chromium")) browser = "Chrome";
  else if (uaLower.includes("firefox/")) browser = "Firefox";
  else if (uaLower.includes("safari/") && !uaLower.includes("chrome")) browser = "Safari";

  let os = "Unknown";
  if (uaLower.includes("windows nt")) os = "Windows";
  else if (uaLower.includes("mac os x") && !uaLower.includes("iphone") && !uaLower.includes("ipad")) os = "macOS";
  else if (uaLower.includes("iphone")) os = "iOS (iPhone)";
  else if (uaLower.includes("ipad")) os = "iOS (iPad)";
  else if (uaLower.includes("android")) os = "Android";
  else if (uaLower.includes("linux")) os = "Linux";

  return { device, browser, os };
}

function buildMapsLink(loc: string | undefined): string | null {
  if (!loc) return null;
  const [lat, lng] = loc.split(",");
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat.trim()},${lng.trim()}`;
}

function row(label: string, value: string, valueColor = "#111827"): string {
  return `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;white-space:nowrap;width:140px;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:${valueColor};font-weight:500;">${value}</td>
    </tr>`;
}

export function renderTriggerTemplate(data: TriggerTemplateData): string {
  const {
    typeEvent,
    url,
    browserVersion,
    referrer = "direct",
    ipInfo,
    clientIp,
    timestamp,
    isNewVisitor = true,
    aiSource,
    isGoogleAds = false,
    utmMedium,
    utmCampaign,
    gclid,
    landingPath,
    keyword,
  } = data;
  const source = aiSource
    ? { label: aiSource, color: "#7c3aed", emoji: "🤖" }
    : isGoogleAds
      ? { label: "Google Ads (plătit)", color: "#188038", emoji: "💰" }
      : (() => {
          const s = detectSource(referrer);
          return s.label === "Google" ? { ...s, label: "Google (organic)" } : s;
        })();
  const { device, browser, os } = parseDevice(browserVersion);
  const mapsLink = buildMapsLink(ipInfo?.loc);
  const visitorBadge = isNewVisitor
    ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:20px;text-transform:uppercase;">🆕 Vizitator NOU</span>`
    : `<span style="display:inline-block;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:20px;text-transform:uppercase;">🔁 Vizitator cunoscut</span>`;

  const locationStr = [ipInfo?.city, ipInfo?.region, ipInfo?.country].filter(Boolean).join(", ") || "—";
  const coordsStr = ipInfo?.loc
    ? `<a href="${mapsLink}" style="color:#4f46e5;text-decoration:none;">${ipInfo.loc} ↗</a>`
    : "—";

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="google" content="notranslate" />
  <title>Vizitator nou — AncaVisuals</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:#111827;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;">AncaVisuals</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#ffffff;">${typeEvent}</h1>
              <p style="margin:6px 0 0;">${visitorBadge}</p>
              <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${timestamp}</p>
            </td>
          </tr>

          <!-- SOURCE BANNER -->
          <tr>
            <td style="background:${source.color}18;border-left:4px solid ${source.color};padding:14px 32px;">
              <p style="margin:0;font-size:14px;color:${source.color};font-weight:600;">
                ${source.emoji}&nbsp;&nbsp;Sursă: ${source.label}
              </p>
              ${aiSource ? `<p style="margin:5px 0 0;font-size:12px;color:#374151;">UTM AI detectat: <strong>${aiSource}</strong>${utmMedium ? ` · medium: ${utmMedium}` : ""}${utmCampaign ? ` · campanie: ${utmCampaign}` : ""}</p>` : ""}
              ${isGoogleAds ? `<p style="margin:5px 0 0;font-size:12px;color:#374151;">Click plătit din Google Ads${utmCampaign ? ` · campanie: <strong>${utmCampaign}</strong>` : ""}${gclid ? ` · gclid: ${gclid.slice(0, 16)}…` : ""}</p>` : ""}
              ${referrer && referrer !== "direct"
                ? `<p style="margin:4px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">${referrer}</p>`
                : ""}
            </td>
          </tr>

          <!-- PAGINA VIZITATA -->
          <tr>
            <td style="background:#ffffff;padding:20px 32px 4px;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Pagina vizitată</p>
              <p style="margin:0;font-size:14px;color:#4f46e5;word-break:break-all;font-weight:500;">${url}</p>
            </td>
          </tr>

          ${landingPath || keyword ? `
          <!-- SECTIUNE: PRIMA PAGINA & CAUTARE -->
          <tr>
            <td style="background:#ffffff;padding:16px 32px 4px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #f3f4f6;padding-bottom:8px;">
                🔎 Intrare pe site
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${landingPath && landingPath !== url ? row("Prima pagină vizitată", landingPath) : ""}
                ${keyword ? row("Termen de căutare", keyword) : ""}
              </table>
            </td>
          </tr>` : ""}

          <!-- SECTIUNE: VIZITATOR -->
          <tr>
            <td style="background:#ffffff;padding:20px 32px 4px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #f3f4f6;padding-bottom:8px;">
                🧑‍💻 Dispozitiv & Browser
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${row("Dispozitiv", device)}
                ${row("Browser", browser)}
                ${row("Sistem de operare", os)}
              </table>
            </td>
          </tr>

          <!-- SECTIUNE: LOCATIE -->
          <tr>
            <td style="background:#ffffff;padding:20px 32px 4px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #f3f4f6;padding-bottom:8px;">
                📍 Locație
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${row("IP", ipInfo?.ip ?? clientIp ?? "—")}
                ${row("Localitate", locationStr)}
                ${row("Coordonate", coordsStr)}
                ${row("Fus orar", ipInfo?.timezone ?? "—")}
                ${row("Furnizor (ISP)", ipInfo?.org ?? "—")}
                ${row("Hostname", ipInfo?.hostname ?? "—")}
              </table>
            </td>
          </tr>

          <!-- USER AGENT BRUT -->
          <tr>
            <td style="background:#ffffff;padding:16px 32px 28px;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">User Agent</p>
              <p style="margin:0;font-size:11px;color:#9ca3af;word-break:break-all;line-height:1.6;">${browserVersion}</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#d1d5db;">ancavisuals.ro &mdash; notificare automată</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}
