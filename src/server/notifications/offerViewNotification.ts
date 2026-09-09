import type { Request } from "express";
import { adminUser } from "../constants/credentials";
import { APP_BASE_URL } from "../constants/domain";
import { sendEmail } from "./mailer";
import { fetchIpInfo, getClientIp, type IpInfo } from "../utils/ipinfo";

type OfferViewNotificationInput = {
  slug: string;
  viewCount: number;
  request: Request;
  clientName?: string;
  title?: string;
  pageUrl?: string;
  referrer?: string;
  kind?: "offer" | "campaign";
};

export type OfferViewContext = {
  ip: string;
  ipInfo: IpInfo | null;
  userAgent: string;
  pageUrl: string;
  referrer: string;
  time: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function boundedString(value: unknown, fallback: string, maxLength = 2_000): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

function parseDevice(userAgent: string): { device: string; browser: string; os: string } {
  const lower = userAgent.toLowerCase();
  const device = /ipad/.test(lower) ? "Tabletă (iPad)" : /mobile|android|iphone/.test(lower) ? "Mobil" : "Desktop";

  let browser = "Necunoscut";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "Opera";
  else if (lower.includes("chrome/") && !lower.includes("chromium")) browser = "Chrome";
  else if (lower.includes("firefox/")) browser = "Firefox";
  else if (lower.includes("safari/") && !lower.includes("chrome")) browser = "Safari";

  let os = "Necunoscut";
  if (lower.includes("windows nt")) os = "Windows";
  else if (lower.includes("mac os x") && !lower.includes("iphone") && !lower.includes("ipad")) os = "macOS";
  else if (lower.includes("iphone")) os = "iOS (iPhone)";
  else if (lower.includes("ipad")) os = "iOS (iPad)";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("linux")) os = "Linux";

  return { device, browser, os };
}

function locationLabel(ipInfo: IpInfo | null): string {
  return [ipInfo?.city, ipInfo?.region, ipInfo?.country].filter(Boolean).join(", ") || "Necunoscută";
}

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "sem"]);

/** Where did the visit come from — Google Ads, organic search, social, referral, direct. */
export function classifyTraffic(pageUrl: string, referrer: string): { label: string; detail: string } {
  let params = new URLSearchParams();
  try { params = new URL(pageUrl).searchParams; } catch { /* not a full URL */ }

  const gclid = params.get("gclid") || params.get("wbraid") || params.get("gbraid");
  const gadSource = params.get("gad_source");
  const campaign = params.get("gad_campaignid") || params.get("utm_campaign") || "";
  const utmSource = (params.get("utm_source") || "").toLowerCase();
  const utmMedium = (params.get("utm_medium") || "").toLowerCase();

  if (gclid || gadSource === "1" || (utmSource === "google" && PAID_MEDIUMS.has(utmMedium))) {
    return { label: "Google Ads", detail: [campaign && `campanie ${campaign}`, gclid && "gclid ✓"].filter(Boolean).join(" · ") };
  }
  if (utmSource && utmMedium) {
    return { label: `Campanie ${utmSource}`, detail: [utmMedium, campaign].filter(Boolean).join(" · ") };
  }

  let host = "";
  try { host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* not a URL */ }
  if (/(^|\.)google\./.test(host)) return { label: "Google organic", detail: "căutare Google (fără reclamă)" };
  if (/(^|\.)(bing|yahoo|duckduckgo|ecosia|yandex|startpage)\./.test(host)) return { label: "Căutare organică", detail: host };
  if (/(^|\.)(facebook|instagram|fb|t\.co|tiktok|linkedin|pinterest)\./.test(host)) return { label: "Social", detail: host };
  if (/(chatgpt|openai|claude\.ai|perplexity|gemini\.google|grok)/.test(host)) return { label: "AI", detail: host };
  if (host && !host.includes("ancavisuals")) return { label: "Referral", detail: host };
  return { label: "Direct", detail: "link tastat / salvat / din aplicație" };
}

function mapsLink(loc?: string): string | null {
  if (!loc || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(loc.replace(/\s/g, ""))) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(loc.replace(/\s/g, ""))}`;
}

function row(label: string, value: unknown): string {
  return `<tr><td style="padding:7px 0;color:#737373;width:145px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:7px 0;color:#171717;word-break:break-word;">${escapeHtml(value || "—")}</td></tr>`;
}

export async function sendOfferViewNotification(input: OfferViewNotificationInput): Promise<OfferViewContext> {
  const { request } = input;
  const ip = getClientIp(request) || "necunoscut";
  const ipInfo = await fetchIpInfo(ip).catch(() => null);
  const userAgent = boundedString(request.headers["user-agent"], "Necunoscut", 1_000);
  const pageUrl = boundedString(input.pageUrl, `${APP_BASE_URL}/oferta/${input.slug}`);
  const referrer = boundedString(
    input.referrer,
    boundedString(request.headers.referer ?? request.headers.referrer, "Acces direct"),
  );
  const time = new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" });
  const subjectTime = new Date().toLocaleString("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", "");
  const { device, browser, os } = parseDevice(userAgent);
  const mapUrl = mapsLink(ipInfo?.loc);
  const kindLabel = input.kind === "campaign" ? "Campanie vizualizată" : "Ofertă vizualizată";
  const traffic = classifyTraffic(pageUrl, referrer);
  const location = locationLabel(ipInfo);
  const locationWithMap = mapUrl
    ? `${escapeHtml(location)} (<a href="${mapUrl}" style="color:#6d28d9;">hartă</a>)`
    : escapeHtml(location);

  await sendEmail({
    to: adminUser.email,
    subject: `👁 ${kindLabel} · ${traffic.label} — /${input.slug} — ${subjectTime}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f5f5f5;padding:24px;color:#171717;">
        <div style="background:#111;color:#fff;border-radius:14px 14px 0 0;padding:24px;">
          <p style="margin:0 0 8px;color:#c4b5fd;font-size:11px;letter-spacing:.18em;text-transform:uppercase;">Ancavisuals · Oferte</p>
          <h1 style="margin:0;font-size:22px;font-weight:500;">${escapeHtml(kindLabel)}</h1>
          <p style="margin:8px 0 0;color:#a3a3a3;font-size:13px;">${escapeHtml(time)}</p>
        </div>
        <div style="background:#fff;padding:22px 24px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${row("Adresă", `/${input.slug}`)}
            ${input.title ? row("Titlu", input.title) : ""}
            ${input.clientName ? row("Client asociat", input.clientName) : ""}
            ${row("IP", ipInfo?.ip ?? ip)}
            <tr><td style="padding:7px 0;color:#737373;width:145px;vertical-align:top;">Locație IP</td><td style="padding:7px 0;color:#171717;word-break:break-word;">${locationWithMap}</td></tr>
            ${row("Furnizor / ISP", ipInfo?.org)}
            ${row("Fus orar", ipInfo?.timezone)}
            ${row("Hostname", ipInfo?.hostname)}
            ${row("Dispozitiv", device)}
            ${row("Browser", browser)}
            ${row("Sistem de operare", os)}
            ${row("Vizualizări totale", input.viewCount)}
          </table>
        </div>
        <div style="background:#fff;padding:0 24px 22px;">
          <p style="margin:0 0 6px;color:#737373;font-size:12px;font-weight:600;">Sursă și navigare</p>
          ${row("Sursă trafic", traffic.detail ? `${traffic.label} — ${traffic.detail}` : traffic.label)}
          ${row("Pagina accesată", pageUrl)}
          ${row("Referrer / reclamă", referrer)}
          <p style="margin:16px 0 6px;color:#737373;font-size:12px;font-weight:600;">User-Agent complet</p>
          <p style="margin:0;color:#525252;font-size:11px;line-height:1.6;word-break:break-all;">${escapeHtml(userAgent)}</p>
        </div>
        <p style="margin:14px 0 0;text-align:center;color:#a3a3a3;font-size:11px;">Notificare automată · ancavisuals.ro</p>
      </div>
    `,
  });

  return { ip, ipInfo, userAgent, pageUrl, referrer, time };
}
