import { destination } from "./address";

interface EventsTrigger {
  typeEvent: string;
  url: string;
  isNewVisitor?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPath?: string;
  keyword?: string;
  // Google Ads click identifiers — present only on paid clicks (auto-tagging).
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
}

const sanitizeInput = (input: string): string =>
  input.replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const sendTriggerEmail = async ({
  typeEvent,
  url,
  isNewVisitor,
  utmSource,
  utmMedium,
  utmCampaign,
  landingPath,
  keyword,
  gclid,
  wbraid,
  gbraid,
}: EventsTrigger) => {
  if (!typeEvent || !url) {
    throw new Error("Invalid input: typeEvent and url are required.");
  }

  const response = await fetch(`${destination}/triggerEvent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    mode: "cors",
    body: JSON.stringify({
      typeEvent: sanitizeInput(typeEvent),
      url: sanitizeInput(url),
      browserVersion: navigator.userAgent,
      referrer: sanitizeInput(document.referrer || "direct"),
      isNewVisitor: isNewVisitor ?? true,
      utmSource: utmSource ? sanitizeInput(utmSource) : undefined,
      utmMedium: utmMedium ? sanitizeInput(utmMedium) : undefined,
      utmCampaign: utmCampaign ? sanitizeInput(utmCampaign) : undefined,
      landingPath: landingPath ? sanitizeInput(landingPath) : undefined,
      keyword: keyword ? sanitizeInput(keyword) : undefined,
      gclid: gclid ? sanitizeInput(gclid) : undefined,
      wbraid: wbraid ? sanitizeInput(wbraid) : undefined,
      gbraid: gbraid ? sanitizeInput(gbraid) : undefined,
    }),
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Server error: ${response.statusText}`);
  }

  return response;
};
