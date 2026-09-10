import type { Request, Response } from "express";
import { applyCORSpolicy } from "../constants/cors";
import { adminUser } from "../constants/credentials";
import { sendEmail } from "../notifications/mailer";
import { fetchIpInfo, getClientIp } from "../utils/ipinfo";
import { renderTriggerTemplate } from "../notifications/templates/triggerTemplate";
import { logActivity, getNotificationSettings } from "../services/activity.service.js";
import { isNotifiableCountry } from "../utils/geoFilter.js";

interface TypeEvent {
  typeEvent: string;
  url: string;
  browserVersion: string;
  referrer?: string;
  isNewVisitor?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  // Google Ads click identifiers — present only on paid clicks (auto-tagging).
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  // Populated by the phone-reveal widget: first page of the session + any
  // search keyword captured from the landing URL.
  landingPath?: string;
  keyword?: string;
  // Populated by BookingWizard for Lead Rapid / full booking submissions
  subject?: string;
  html?: string;
  to?: string;
}

const COOLDOWN_MS = 18 * 60 * 60 * 1000; // 18 hours
const PHONE_REVEAL_COOLDOWN_MS = 60 * 1000; // debounce accidental double-clicks only

const BOT_UA_PATTERN = /bot|spider|crawl|scraper|wget|curl|python|java\/|go-http|libwww|httrack|scrapy|phantomjs|headless|selenium|puppeteer|lighthouse|prerender|facebookexternalhit|slackbot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|baiduspider|yandexbot|duckduckbot|bingbot|googlebot|semrushbot|ahrefsbot|mj12bot|dotbot|rogerbot|pingdom|uptimerobot|datadog|newrelic|nagios|zabbix|petalbot|bytespider|gptbot|ccbot|claudebot/i;

function isBot(userAgent: string): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT_UA_PATTERN.test(userAgent);
}

// IP + source → timestamp of last sent email. Cleaned up lazily on each request.
const lastSentByIp = new Map<string, number>();

function isOnCooldown(ip: string, source = "generic", cooldownMs = COOLDOWN_MS): boolean {
  const lastSent = lastSentByIp.get(`${ip}:${source}`);
  if (!lastSent) return false;
  return Date.now() - lastSent < cooldownMs;
}

function recordSent(ip: string, source = "generic"): void {
  lastSentByIp.set(`${ip}:${source}`, Date.now());
  // Evict entries older than the longest cooldown to keep memory bounded
  for (const [storedIp, timestamp] of lastSentByIp) {
    if (Date.now() - timestamp >= COOLDOWN_MS) {
      lastSentByIp.delete(storedIp);
    }
  }
}

function detectAiSource(utmSource?: string, referrer?: string): string | null {
  const source = (utmSource ?? "").trim().toLowerCase();
  if (source === "chatgpt.com" || source === "chatgpt") return "ChatGPT";
  if (source === "claude.ai" || source === "claude") return "Claude";
  if (source === "gemini.google.com" || source === "gemini") return "Gemini";
  if (source === "grok.com" || source === "grok") return "Grok";
  if (source === "perplexity.ai" || source === "perplexity") return "Perplexity";
  if (source === "copilot.microsoft.com" || source === "copilot") return "Copilot";

  // Fallback: many AI assistants link out with a plain referrer and no UTM tags.
  const r = (referrer ?? "").toLowerCase();
  if (r.includes("chatgpt.com") || r.includes("chat.openai.com")) return "ChatGPT";
  if (r.includes("claude.ai")) return "Claude";
  if (r.includes("gemini.google.com")) return "Gemini";
  if (r.includes("grok.com")) return "Grok";
  if (r.includes("perplexity.ai")) return "Perplexity";
  if (r.includes("copilot.microsoft.com")) return "Copilot";
  return null;
}

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "sem"]);

/**
 * True when the visit came from a paid Google Ads click. Google auto-tagging
 * appends gclid (Search/Display), wbraid or gbraid (iOS app / web-to-app);
 * manually tagged campaigns use utm_source=google + utm_medium=cpc.
 */
function detectGoogleAds(data: {
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  utmSource?: string;
  utmMedium?: string;
}): boolean {
  if (data.gclid || data.wbraid || data.gbraid) return true;
  const src = (data.utmSource ?? "").toLowerCase();
  const med = (data.utmMedium ?? "").toLowerCase();
  return (src === "google" || src === "adwords") && PAID_MEDIUMS.has(med);
}

function detectSearchEngine(referrer?: string): string | null {
  const r = (referrer ?? "").toLowerCase();
  if (!r || r === "direct") return null;
  if (r.includes("google.")) return "Google";
  if (r.includes("bing.com")) return "Bing";
  if (r.includes("yahoo.")) return "Yahoo";
  if (r.includes("duckduckgo.com")) return "DuckDuckGo";
  return null;
}

export const isLocalIp = (ip: string): boolean => {
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
};

export const triggerEvent = async (request: Request, response: Response) => {
  applyCORSpolicy(response);

  try {
    const triggerData: TypeEvent = request.body;
    const todayDate = new Date();
    const todayString = `${todayDate.getDate()}/${todayDate.getMonth() + 1}/${todayDate.getFullYear()} ${todayDate.getHours()}:${todayDate.getMinutes()}:${todayDate.getSeconds()}`;

    const clientIp = getClientIp(request);
    const isPhoneReveal = triggerData.typeEvent?.startsWith("📞") ?? false;
    const aiSource = detectAiSource(triggerData.utmSource, triggerData.referrer);
    const cooldownSource = isPhoneReveal ? "phone_reveal" : (aiSource ?? "generic");

    if (isLocalIp(clientIp)) {
      response.status(204).send();
      return;
    }

    if (isOnCooldown(clientIp, cooldownSource, isPhoneReveal ? PHONE_REVEAL_COOLDOWN_MS : COOLDOWN_MS)) {
      response.status(204).send();
      return;
    }

    if (isBot(triggerData.browserVersion ?? "")) {
      response.status(204).send();
      return;
    }

    const ipInfo = await fetchIpInfo(clientIp);

    if (!isNotifiableCountry(ipInfo?.country)) {
      response.status(204).send();
      return;
    }

    const isNew = triggerData.isNewVisitor !== false;
    const visitorLabel = isNew ? "🆕 Vizitator NOU" : "🔁 Vizitator cunoscut";
    const isBookingSubmission = !!triggerData.html && !!triggerData.subject;

    // Detect source for activity metadata
    const referrer = triggerData.referrer ?? "direct";
    const ua = triggerData.browserVersion ?? "";
    const uaLower = ua.toLowerCase();
    const device = /mobile|android|iphone|ipad/.test(uaLower) ? "Mobil" : "Desktop";
    const city = ipInfo?.city ?? "";
    const isGoogleAds = detectGoogleAds({
      gclid: triggerData.gclid,
      wbraid: triggerData.wbraid,
      gbraid: triggerData.gbraid,
      utmSource: triggerData.utmSource,
      utmMedium: triggerData.utmMedium,
    });
    const searchEngine = detectSearchEngine(referrer);
    const source = aiSource ?? (() => {
      if (isGoogleAds) return "Google Ads";
      if (searchEngine === "Google") return "Google (organic)";
      if (searchEngine) return searchEngine;
      const r = referrer.toLowerCase();
      if (r.includes("instagram")) return "Instagram";
      if (r.includes("facebook") || r.includes("fb.com")) return "Facebook";
      if (r.includes("tiktok")) return "TikTok";
      if (r === "direct") return "Direct";
      return referrer;
    })();

    // Always log to activity inbox
    const activityType = isBookingSubmission ? "lead" : "visitor";
    const activityTitle = isBookingSubmission
      ? (triggerData.subject ?? "Lead Rapid")
      : `${isNew ? "🆕 Vizitator nou" : "🔁 Vizitator"} — ${triggerData.url}`;
    const activityDesc = [city, device, source].filter(Boolean).join(" · ");

    const settings = await getNotificationSettings().catch(() => null);

    let shouldEmail = false;
    if (isBookingSubmission) {
      shouldEmail = settings?.email.lead ?? true;
    } else if (isPhoneReveal || aiSource) {
      shouldEmail = true;
    } else if (isNew) {
      shouldEmail = settings?.email.newVisitor ?? true;
    } else {
      shouldEmail = settings?.email.returningVisitor ?? false;
    }

    // Log to Firestore (fire-and-forget, don't block response)
    logActivity({
      type: activityType,
      title: activityTitle,
      description: activityDesc,
      metadata: {
        url: triggerData.url,
        ip: clientIp,
        city,
        device,
        source,
        isNew: String(isNew),
        isGoogleAds: String(isGoogleAds),
        utmSource: triggerData.utmSource ?? "",
        utmMedium: triggerData.utmMedium ?? "",
        utmCampaign: triggerData.utmCampaign ?? "",
        gclid: triggerData.gclid ?? triggerData.wbraid ?? triggerData.gbraid ?? "",
        landingPath: triggerData.landingPath ?? "",
        keyword: triggerData.keyword ?? "",
      },
      emailSent: shouldEmail,
    }).catch((err) => console.error("[activity] log failed:", err));

    if (!shouldEmail) {
      recordSent(clientIp, cooldownSource);
      response.status(204).send();
      return;
    }

    const emailHtml = isBookingSubmission
      ? triggerData.html!
      : renderTriggerTemplate({
          typeEvent: triggerData.typeEvent,
          url: triggerData.url,
          browserVersion: triggerData.browserVersion,
          referrer: triggerData.referrer,
          ipInfo,
          clientIp,
          timestamp: todayString,
          isNewVisitor: isNew,
          aiSource,
          isGoogleAds,
          utmMedium: triggerData.utmMedium,
          utmCampaign: triggerData.utmCampaign,
          gclid: triggerData.gclid ?? triggerData.wbraid ?? triggerData.gbraid,
          landingPath: triggerData.landingPath,
          keyword: triggerData.keyword,
        });

    const subjectPrefix = aiSource
      ? `🤖 ${aiSource}`
      : isGoogleAds
        ? `💰 ${visitorLabel} (Google Ads)`
        : visitorLabel;
    const emailSubject = isBookingSubmission
      ? triggerData.subject!
      : `${subjectPrefix} — ${triggerData.url} — ${todayString} - ${source}`;

    await sendEmail({ to: adminUser.email, subject: emailSubject, html: emailHtml });

    recordSent(clientIp, cooldownSource);
    console.log("Trigger email sent successfully.");
    response.status(200).send("Email sent successfully.");
  } catch (error) {
    console.error("Error sending trigger email:", error);
    response.status(500).send("Server error occurred.");
  }
};
