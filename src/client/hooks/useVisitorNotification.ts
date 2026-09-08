import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getCookie, setCookie, isBrowser } from "../utils/functions";
import { sendTriggerEmail } from "../utils/triggers";
import { captureLandingMeta, getLandingMeta } from "../utils/sessionAttribution";

const SKIP_PREFIXES = ["/admin", "/login", "/revin", "/wedding-hub", "/colaborator"];
const ADMIN_COOKIE = "av_admin";
const VISITOR_COOKIE = "av_visitor";
const VISITOR_COOKIE_DAYS = 180; // 6 luni
const SESSION_KEY = "av_notified";
const AI_ATTRIBUTION_KEY = "av_ai_attribution";
const AI_NOTIFICATION_KEY = "av_ai_source_notified";
const OFFER_PATH = "/oferta/olx";

const AI_SOURCES: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  chatgpt: "ChatGPT",
  "claude.ai": "Claude",
  claude: "Claude",
  "gemini.google.com": "Gemini",
  gemini: "Gemini",
  "grok.com": "Grok",
  grok: "Grok",
};

interface AiAttribution {
  source: string;
  medium?: string;
  campaign?: string;
  landingPath: string;
}

function getAiAttribution(): AiAttribution | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const rawSource = params.get("utm_source")?.trim().toLowerCase();
    const source = rawSource ? AI_SOURCES[rawSource] : undefined;
    const existing = sessionStorage.getItem(AI_ATTRIBUTION_KEY);

    if (source) {
      const attribution: AiAttribution = {
        source,
        medium: params.get("utm_medium")?.trim() || undefined,
        campaign: params.get("utm_campaign")?.trim() || undefined,
        landingPath: window.location.pathname,
      };
      sessionStorage.setItem(AI_ATTRIBUTION_KEY, JSON.stringify(attribution));
      return attribution;
    }

    return existing ? JSON.parse(existing) as AiAttribution : null;
  } catch {
    return null;
  }
}

function getNotifiedUrls(): Set<string> {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markUrlNotified(url: string): void {
  try {
    const notified = getNotifiedUrls();
    notified.add(url);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...notified]));
  } catch {
    // sessionStorage unavailable — silently skip
  }
}

export function useVisitorNotification() {
  const location = useLocation();

  useEffect(() => {
    if (!isBrowser()) return;
    if (getCookie(ADMIN_COOKIE) === "1") return;
    if (SKIP_PREFIXES.some((prefix) => location.pathname.startsWith(prefix))) return;

    // Snapshot the landing referrer/UTM/gclid before any of it can be lost — the
    // effect order in App.tsx doesn't guarantee this ran elsewhere first.
    captureLandingMeta();

    const isOfferVisit = location.pathname === OFFER_PATH;
    // Oferta are deja notificarea proprie din /api/oferte/:slug/view.
    if (isOfferVisit) return;

    const aiAttribution = getAiAttribution();
    const aiNotificationSent = sessionStorage.getItem(AI_NOTIFICATION_KEY) === "1";

    // AI referrals are high-intent attribution signals. Notify once per browser
    // session, even if the visitor has already been seen before.
    if (aiAttribution && !aiNotificationSent) {
      sessionStorage.setItem(AI_NOTIFICATION_KEY, "1");
      sendTriggerEmail({
        typeEvent: `Vizitator din ${aiAttribution.source}`,
        url: `${aiAttribution.landingPath}${window.location.search}`,
        isNewVisitor: true,
        utmSource: aiAttribution.source,
        utmMedium: aiAttribution.medium,
        utmCampaign: aiAttribution.campaign,
      }).catch(() => {});
      return;
    }

    const notified = getNotifiedUrls();
    if (notified.has(location.pathname)) return;

    markUrlNotified(location.pathname);

    const isNewVisitor = getCookie(VISITOR_COOKIE) === null;
    if (isNewVisitor) {
      setCookie(VISITOR_COOKIE, "1", VISITOR_COOKIE_DAYS);
    }

    // Forward the landing attribution so the server can tell Google Ads (gclid /
    // wbraid / gbraid, or utm_medium=cpc) apart from organic Google search.
    const landing = getLandingMeta();
    sendTriggerEmail({
      typeEvent: "Vizitator",
      url: location.pathname,
      isNewVisitor,
      utmSource: landing?.utmSource,
      utmMedium: landing?.utmMedium,
      utmCampaign: landing?.utmCampaign,
      keyword: landing?.keyword,
      gclid: landing?.gclid,
      wbraid: landing?.wbraid,
      gbraid: landing?.gbraid,
    }).catch(() => {});
  }, [location.pathname]);
}
