import { useState, useCallback, type CSSProperties, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { isBrowser } from "../../utils/functions";
import { getLandingMeta } from "../../utils/sessionAttribution";
import { sendTriggerEmail } from "../../utils/triggers";

interface PhoneNumberRevealProps {
  /** Digits only, e.g. "0745469907" — used to build the tel: link. */
  phone: string;
  /** Formatted number shown once revealed, e.g. "0745 469 907". Defaults to `phone`. */
  display?: string;
  /** Label shown before the number once revealed, e.g. "Sună — ". */
  revealedPrefix?: string;
  /** Text shown on the hidden-state button. */
  buttonLabel?: string;
  /** Where on the site this instance lives — shows up in the notification email. */
  context: string;
  className?: string;
  style?: CSSProperties;
  icon?: ReactNode;
  onRevealed?: () => void;
}

function toTelHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.startsWith("0")) return `tel:+40${digits.slice(1)}`;
  return `tel:${digits}`;
}

function notifyPhoneReveal(context: string) {
  if (!isBrowser()) return;
  const landing = getLandingMeta();
  sendTriggerEmail({
    typeEvent: `📞 Număr afișat — ${context}`,
    url: window.location.pathname + window.location.search,
    isNewVisitor: true,
    utmSource: landing?.utmSource,
    utmMedium: landing?.utmMedium,
    utmCampaign: landing?.utmCampaign,
    landingPath: landing?.landingPath,
    keyword: landing?.utmTerm ?? landing?.keyword,
  }).catch(() => {});
}

export default function PhoneNumberReveal({
  phone,
  display,
  revealedPrefix = "",
  buttonLabel = "AFIȘEAZĂ NUMĂRUL",
  context,
  className,
  style,
  icon,
  onRevealed,
}: PhoneNumberRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    notifyPhoneReveal(context);
    onRevealed?.();
  }, [context, onRevealed]);

  const handleCopy = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const text = display ?? phone;
      const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {});
      } else {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done();
        } catch { /* clipboard unavailable */ }
      }
    },
    [display, phone],
  );

  if (!revealed) {
    return (
      <button type="button" className={className} style={style} onClick={handleReveal}>
        {icon}
        {buttonLabel}
      </button>
    );
  }

  return (
    <a href={toTelHref(phone)} className={className} style={style}>
      {icon}
      {revealedPrefix}
      {display ?? phone}
      <span
        role="button"
        tabIndex={0}
        aria-label={copied ? "Număr copiat" : "Copiază numărul"}
        title={copied ? "Copiat!" : "Copiază numărul"}
        onClick={handleCopy}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCopy(e as unknown as ReactMouseEvent); }}
        style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", cursor: "pointer", opacity: 0.85 }}
      >
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </span>
    </a>
  );
}
