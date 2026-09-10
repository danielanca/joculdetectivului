import React, { useEffect, useRef, useState } from "react";
import { measureOaiq } from "../../utils/oaiq";
import { getCookie } from "../../utils/functions";
import { reportAvailabilityCheck, sendLiveEvent } from "../../utils/liveEvent";
import PhoneNumberReveal from "../../components/PhoneReveal/PhoneNumberReveal";

const MONTHS_RO = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
const MONTHS_RO_CAP = MONTHS_RO.map((m) => m[0].toUpperCase() + m.slice(1));
function formatDateRo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_RO[Number(m[2]) - 1]} ${m[1]}`;
}
const daysInMonth = (year: number, monthZeroBased: number) => new Date(year, monthZeroBased + 1, 0).getDate();
const toIso = (day: number, monthZeroBased: number, year: number) =>
  `${year}-${String(monthZeroBased + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export interface CampaignPackage {
  id: string;
  name: string;
  price: string;
  features: string[];
  highlighted?: boolean;
}

export interface CampaignTestimonial {
  id: string;
  name: string;
  eventType: string;
  text: string;
}

export interface CampaignGalleryItem {
  url: string;
  bunnyPath: string;
}

export interface CampaignPage {
  slug: string;
  title: string;
  subtitle: string;
  ctaText: string;
  whatsappNumber: string;
  phoneNumber: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  videoUrl?: string;
  gallery: CampaignGalleryItem[];
  packages: CampaignPackage[];
  testimonials: CampaignTestimonial[];
  active: boolean;
  viewCount?: number;
  videoThumbnailUrl?: string;
}

interface CampaignLandingPageProps {
  page: CampaignPage;
}

function WhatsAppIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.115 1.527 5.845L.057 23.455a.5.5 0 00.614.614l5.61-1.47A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.673-.497-5.21-1.367l-.374-.218-3.878 1.016 1.016-3.878-.218-.374A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

const journeySteps = [
  {
    number: "01",
    title: "Descoperă stilul nostru",
    text: "Privește momente reale și vezi dacă felul în care spunem o poveste vă reprezintă.",
  },
  {
    number: "02",
    title: "Alege ce vi se potrivește",
    text: "Compară simplu pachetele și păstrează doar serviciile care contează pentru evenimentul vostru.",
  },
  {
    number: "03",
    title: "Verificăm împreună data",
    text: "Trimite-ne câteva detalii, iar noi revenim cu disponibilitatea și următorii pași.",
  },
];

export default function CampaignLandingPage({ page }: CampaignLandingPageProps) {
  const whatsappLink = `https://wa.me/${page.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent("Bună! Am văzut oferta voastră și aș dori mai multe detalii.")}`;
  const defaultDate = (() => {
    const now = new Date();
    let month = now.getMonth() + 1; // next month
    let year = now.getFullYear();
    if (month > 11) { month = 0; year += 1; }
    return { day: 1, month, year };
  })();
  const [dateParts, setDateParts] = useState(defaultDate);
  const [form, setForm] = useState({
    name: "", phone: "", eventType: "Nuntă", location: "",
    eventDate: toIso(defaultDate.day, defaultDate.month, defaultDate.year),
  });
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [availStatus, setAvailStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [leaveNumber, setLeaveNumber] = useState(false);

  const setDatePart = (patch: Partial<typeof dateParts>) => {
    setDateParts((prev) => {
      const next = { ...prev, ...patch };
      const maxDay = daysInMonth(next.year, next.month);
      if (next.day > maxDay) next.day = maxDay;
      setForm((f) => ({ ...f, eventDate: toIso(next.day, next.month, next.year) }));
      return next;
    });
    setAvailStatus("idle");
    setLeaveNumber(false);
  };

  useEffect(() => {
    fetch("/api/booked-dates")
      .then((r) => r.json())
      .then((d: { dates?: string[] }) => setBookedDates(d.dates ?? []))
      .catch(() => setBookedDates([]));
  }, []);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const GALLERY_INITIAL = 16;
  const [spinCount, setSpinCount] = useState(0);
  const [spinResult, setSpinResult] = useState<"idle" | "spinning" | "lost" | "won">("idle");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [promoSeconds, setPromoSeconds] = useState(15 * 60 * 60);
  const promoOpen = true;
  const [isAdmin, setIsAdmin] = useState(() => {
    const hasAdminCookie = getCookie("av_admin") === "1";
    try {
      if (hasAdminCookie) localStorage.setItem("av_admin_device", "1");
      return hasAdminCookie || localStorage.getItem("av_admin_device") === "1";
    } catch { return hasAdminCookie; }
  });
  const [adminNotice, setAdminNotice] = useState(false);
  useEffect(() => {
    if (getCookie("av_admin") !== "1") return;
    try { localStorage.setItem("av_admin_device", "1"); } catch { /* storage indisponibil */ }
    setIsAdmin(true);
  }, []);
  const formStarted = useRef(false);
  const interactionKeys = useRef(new Set<string>());
  const notifyInteraction = (interaction: "spinner" | "form" | "form_action") => {
    if (isAdmin) {
      setAdminNotice(true);
      window.setTimeout(() => setAdminNotice(false), 2800);
      return;
    }
    const key = `${page.slug}:${interaction}`;
    if (interaction !== "spinner") {
      if (interactionKeys.current.has(key)) return;
      try {
        if (sessionStorage.getItem(`av_campaign_interaction_${key}`)) return;
        sessionStorage.setItem(`av_campaign_interaction_${key}`, "1");
      } catch { /* sessionStorage poate fi indisponibil în mod privat */ }
      interactionKeys.current.add(key);
    }
    fetch(`/api/campaign/${page.slug}/interaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interaction }),
    }).catch(() => {});
  };
  const trackFormAction = () => notifyInteraction("form_action");
  const trackFormStart = () => {
    if (formStarted.current) return;
    formStarted.current = true;
    notifyInteraction("form");
    measureOaiq("form_started", { page_path: `/oferta/${page.slug}` });
  };
  const trackClick = (eventName: "click_whatsapp" | "click_phone", position: string) => measureOaiq(eventName, { cta_position: position, page_path: `/oferta/${page.slug}` });

  useEffect(() => {
    if (promoSeconds <= 0) return;
    const timer = window.setInterval(() => setPromoSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [promoSeconds]);

  const spinPromo = () => {
    if (spinCount >= 3 || promoSeconds <= 0 || spinResult === "won" || spinResult === "spinning") return;
    notifyInteraction("spinner");
    const nextSpin = spinCount + 1;
    // wedge centres (deg from top, clockwise): FOTOCABINĂ 0 · VIDEOBOOTH 120 · MAI ÎNCEARCĂ 240
    const targetAngle = nextSpin === 1 ? 240 : 0;
    const currentAngle = ((wheelRotation % 360) + 360) % 360;
    const correction = (targetAngle - currentAngle + 360) % 360;
    setSpinCount(nextSpin);
    setSpinResult("spinning");
    setWheelRotation((rotation) => rotation + 1440 + correction);
    window.setTimeout(() => setSpinResult(nextSpin === 1 ? "lost" : "won"), 2300);
  };
  const timerLabel = `${String(Math.floor(promoSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((promoSeconds % 3600) / 60)).padStart(2, "0")}:${String(promoSeconds % 60).padStart(2, "0")}`;

  const checkAvailability = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.eventType || !form.eventDate) return;
    trackFormStart();
    trackFormAction();
    setAvailStatus("checking");
    const available = !bookedDates.includes(form.eventDate);
    window.setTimeout(() => setAvailStatus(available ? "available" : "unavailable"), 400);
    reportAvailabilityCheck(formatDateRo(form.eventDate), form.eventDate, available, form.eventType);
    measureOaiq("availability_checked", { page_path: `/oferta/${page.slug}` });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setFormStatus("sending");
    try {
      const res = await fetch(`/api/campaign/${page.slug}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setFormStatus(res.ok ? "sent" : "error");
      if (res.ok) {
        measureOaiq("lead_created", { type: "customer_action", page_path: `/oferta/${page.slug}` });
        // Panel live only — the lead email is sent by /api/campaign/:slug/contact.
        sendLiveEvent("form_submitted", {
          priority: "critical",
          label: "🎯 Un client a trimis formularul de contact — vrea să-l suni",
          meta: {
            kind: "contact",
            name: form.name.trim(),
            phone: form.phone.trim(),
            eventType: form.eventType,
            eventDate: form.eventDate,
            emailedElsewhere: true,
          },
        });
      }
    } catch {
      setFormStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <style>{`@keyframes promoRainbow { 0%, 24.99% { color: #ef4444; } 25%, 49.99% { color: #facc15; } 50%, 74.99% { color: #22c55e; } 75%, 99.99% { color: #3b82f6; } } .promo-rainbow-text { animation: promoRainbow 2.8s steps(1, end) infinite; }`}</style>
      {adminNotice && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-amber-300/40 bg-neutral-900/95 px-4 py-2 text-xs font-semibold text-amber-200 shadow-xl shadow-black/30">Ești admin — notificările sunt dezactivate.</div>}

      <header className="absolute top-0 inset-x-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <a href="#acasa" className="text-xs tracking-[0.28em] uppercase font-medium text-white">Anca Visuals</a>
          <a
            href="#verifica-data"
            className="hidden sm:inline-flex items-center gap-2 text-xs tracking-wide text-white/80 hover:text-white transition-colors"
          >
            Verifică disponibilitatea <ArrowIcon />
          </a>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section id="acasa" className="relative min-h-[85vh] flex items-end overflow-hidden">
        {page.heroVideoUrl ? (
          <video
            src={page.heroVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : page.heroImageUrl ? (
          <img
            src={page.heroImageUrl}
            alt={page.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        <div className="relative w-full max-w-6xl mx-auto px-6 pb-16 pt-32">
          <p className="text-amber-200 text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            Foto & video pentru povești reale
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light leading-tight text-white mb-4 max-w-2xl">
            {page.title}
          </h1>
          {page.subtitle && (
            <p className="text-neutral-300 text-lg font-light max-w-xl mb-10 leading-relaxed">
              {page.subtitle}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="#verifica-data"
              className="inline-flex items-center justify-center gap-2.5 bg-green-500 hover:bg-green-400 text-white font-semibold px-7 py-4 rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-green-900/40"
            >
              Verifică dacă data ta este disponibilă <ArrowIcon />
            </a>
            <PhoneNumberReveal
              phone={page.phoneNumber}
              buttonLabel="AFIȘEAZĂ NUMĂRUL"
              context={`campanie ${page.slug} · hero`}
              onRevealed={() => trackClick("click_phone", "hero")}
              className="inline-flex items-center justify-center gap-2.5 bg-white/10 hover:bg-white/20 backdrop-blur text-white font-medium px-7 py-4 rounded-xl text-sm border border-white/20 transition-all active:scale-[0.98]"
              icon={<PhoneIcon />}
            />
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/65">
            <span>✓ Peste 50 de evenimente fotografiate și filmate</span>
            <span>✓ Echipă foto-video pentru nunți în Transilvania</span>
            <span>✓ Răspuns personalizat</span>
          </div>
        </div>
      </section>

      {/* ── PORTFOLIO (imediat după hero) ──────────────────────────── */}
      {page.gallery.length > 0 && (
        <section className="py-20 sm:py-24 px-6 max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <div>
              <p className="text-amber-200 text-xs tracking-[0.25em] uppercase mb-3">Portofoliu</p>
              <h2 className="text-3xl font-light">Mai mult decât imagini frumoase.</h2>
            </div>
            <a href="#verifica-data" className="inline-flex items-center gap-2 text-sm text-white hover:text-amber-100 transition-colors">Verifică data ta <ArrowIcon /></a>
          </div>
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 sm:gap-3">
            {(galleryExpanded ? page.gallery : page.gallery.slice(0, GALLERY_INITIAL)).map((item, index) => (
              <div key={index} className="mb-2 sm:mb-3 break-inside-avoid overflow-hidden rounded-xl">
                <img
                  src={item.url}
                  alt={`Ancavisuals ${index + 1}`}
                  loading="lazy"
                  className="w-full object-cover hover:scale-[1.02] transition-transform duration-500"
                />
              </div>
            ))}
          </div>
          {page.gallery.length > GALLERY_INITIAL && <button type="button" onClick={() => setGalleryExpanded((expanded) => !expanded)} className="mx-auto mt-7 block rounded-full border border-white/20 px-5 py-2.5 text-xs font-semibold tracking-[0.14em] text-white transition-colors hover:border-amber-200 hover:text-amber-100">{galleryExpanded ? "Ascunde galeria" : "Vezi galeria completă"}</button>}
        </section>
      )}

      {/* ── ROATA SURPRIZELOR ──────────────────────────────────────── */}
      <section className="bg-[#f6f2ea] px-6 py-16 sm:py-20 text-[#2f2a24]">
        <div className="mx-auto max-w-lg text-center">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#a98d5f]">Un mic dar pentru voi</p>
          <h2 className="font-serif text-4xl leading-tight sm:text-5xl">Învârte roata surprizelor</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#6b6154]">Pentru amintiri și mai frumoase împreună.</p>

          {promoOpen && (
            <div className="mx-auto mt-8 rounded-[28px] border border-[#e3d8c4] bg-[#fbf8f2] p-6 shadow-[0_20px_50px_-24px_rgba(120,95,55,0.35)] sm:p-8">
              {/* wheel */}
              <div className="relative mx-auto h-[300px] w-[300px] max-w-full">
                {/* pointer */}
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-1 z-20 h-0 w-0 -translate-x-1/2"
                  style={{ borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderTop: "20px solid #c9a96e", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.18))" }}
                />
                {/* rotating wheel */}
                <div
                  aria-label="Roata surprizelor"
                  style={{
                    background: "conic-gradient(from -60deg, #aebd9d 0deg 120deg, #e7d0c9 120deg 240deg, #d8cbb7 240deg 360deg)",
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: spinResult === "spinning" ? "transform 2300ms cubic-bezier(0.12, 0.8, 0.18, 1)" : "none",
                  }}
                  className="absolute inset-2 overflow-hidden rounded-full border-[6px] border-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.5),0_16px_40px_-16px_rgba(90,70,40,0.5)]"
                >
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 240 240" aria-hidden="true">
                    {/* dividers */}
                    <g stroke="#fbf8f2" strokeWidth="3">
                      <line x1="120" y1="120" x2="120" y2="6" transform="rotate(60 120 120)" />
                      <line x1="120" y1="120" x2="120" y2="6" transform="rotate(180 120 120)" />
                      <line x1="120" y1="120" x2="120" y2="6" transform="rotate(300 120 120)" />
                    </g>
                    <g fill="#3a352e" stroke="#3a352e" strokeLinecap="round" strokeLinejoin="round">
                      {/* FOTOCABINĂ GRATUITĂ — top */}
                      <g transform="translate(120 40)" fill="none" strokeWidth="2.4">
                        <rect x="-13" y="-6" width="26" height="18" rx="3" />
                        <circle cx="0" cy="3" r="5.5" />
                        <path d="M-6 -6 l2 -4 h8 l2 4" />
                        <path d="M9 -10 l2 -3 M12 -8 l3 -1 M11 -4 l3 1" strokeWidth="1.8" />
                      </g>
                      <text x="120" y="66" textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="0.4" stroke="none">FOTOCABINĂ</text>
                      <text x="120" y="80" textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="0.4" stroke="none">GRATUITĂ</text>

                      {/* VIDEOBOOTH 360 — bottom right */}
                      <g transform="translate(168 138)" fill="none" strokeWidth="2.2">
                        <rect x="-7" y="-9" width="14" height="12" rx="2.5" />
                        <circle cx="0" cy="-3" r="3.2" />
                        <path d="M-13 4 a13 6 0 0 0 26 0" />
                        <path d="M-13 4 l3 -2 M-13 4 l1 3" strokeWidth="1.8" />
                        <path d="M13 4 l-3 -2 M13 4 l-1 3" strokeWidth="1.8" />
                      </g>
                      <text x="168" y="162" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="0.3" stroke="none">VIDEOBOOTH</text>
                      <text x="168" y="176" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="0.3" stroke="none">360</text>

                      {/* MAI ÎNCEARCĂ — bottom left */}
                      <g transform="translate(72 138)" fill="none" strokeWidth="2.4">
                        <path d="M8 -3 a9 9 0 1 0 2 7" />
                        <path d="M8 -9 v6 h-6" />
                      </g>
                      <text x="72" y="162" textAnchor="middle" fontSize="11.5" fontWeight="700" letterSpacing="0.3" stroke="none">MAI</text>
                      <text x="72" y="176" textAnchor="middle" fontSize="11.5" fontWeight="700" letterSpacing="0.3" stroke="none">ÎNCEARCĂ</text>
                    </g>
                  </svg>
                </div>
                {/* centre spin button (does not rotate) */}
                <button
                  type="button"
                  onClick={spinPromo}
                  disabled={spinCount >= 3 || promoSeconds <= 0 || spinResult === "spinning" || spinResult === "won"}
                  aria-label="Învârte roata"
                  className="absolute left-1/2 top-1/2 z-10 h-[86px] w-[86px] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#2b2b2b] text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                >
                  {spinResult === "spinning" ? "…" : "ÎNVÂRTE"}
                </button>
              </div>

              {/* result / hint */}
              {spinResult === "won" ? (
                <div className="mt-6 rounded-2xl border border-[#e3d8c4] p-5 sm:p-6">
                  <p className="mb-3 text-center text-lg" aria-hidden="true">🌿</p>
                  <p className="font-serif text-2xl leading-snug text-[#2f2a24] sm:text-3xl">Ai câștigat fotocabina gratuită!</p>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#6b6154]">Menționează acest câștig când ne trimiți cererea de disponibilitate.</p>
                </div>
              ) : (
                <p className="mt-6 text-sm text-[#6b6154]">
                  {spinResult === "spinning"
                    ? "Roata se oprește…"
                    : spinCount === 0
                      ? "Apasă ÎNVÂRTE și vezi ce câștigi."
                      : `Șanse rămase: ${3 - spinCount}`}
                </p>
              )}

              <div className="mt-6 flex items-center justify-center gap-2 border-t border-[#e9e0d0] pt-5 text-xs font-medium text-[#8a7c67]">
                <span aria-hidden="true">🕐</span> Oferta expiră în {timerLabel}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── AVAILABILITY CHECK ─────────────────────────────────────── */}
      <section id="verifica-data" className="scroll-mt-6 border-b border-white/10 bg-neutral-900 px-6 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:items-center">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.25em] text-amber-200">Verifică disponibilitatea</p>
            <h2 className="max-w-xl text-3xl font-light leading-tight sm:text-4xl">Spune-ne tipul evenimentului și data.</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-400">Îți spunem pe loc dacă suntem liberi. Fără să lași date de contact.</p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 sm:p-6">
            <form onSubmit={checkAvailability} data-live-track="off" className="space-y-3">
              <select
                value={form.eventType}
                onChange={(e) => { setForm((c) => ({ ...c, eventType: e.target.value })); setAvailStatus("idle"); }}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3.5 text-sm text-white outline-none focus:border-amber-500"
              >
                <option>Nuntă</option>
                <option>Botez</option>
                <option>Majorat</option>
                <option>Cununie civilă</option>
                <option>Alt eveniment</option>
              </select>
              <div className="grid grid-cols-[80px_1fr_100px] gap-2">
                <select
                  aria-label="Ziua"
                  value={dateParts.day}
                  onChange={(e) => setDatePart({ day: Number(e.target.value) })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-3.5 text-sm text-white outline-none focus:border-amber-500"
                >
                  {Array.from({ length: daysInMonth(dateParts.year, dateParts.month) }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  aria-label="Luna"
                  value={dateParts.month}
                  onChange={(e) => setDatePart({ month: Number(e.target.value) })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-3.5 text-sm text-white outline-none focus:border-amber-500"
                >
                  {MONTHS_RO_CAP.map((label, index) => (
                    <option key={label} value={index}>{label}</option>
                  ))}
                </select>
                <select
                  aria-label="Anul"
                  value={dateParts.year}
                  onChange={(e) => setDatePart({ year: Number(e.target.value) })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-3.5 text-sm text-white outline-none focus:border-amber-500"
                >
                  {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={availStatus === "checking" || !form.eventDate}
                className="w-full rounded-xl bg-amber-600 py-4 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:bg-neutral-700"
              >
                {availStatus === "checking" ? "Se verifică…" : "Verifică disponibilitatea"}
              </button>
            </form>

            {availStatus === "available" && formStatus !== "sent" && (
              <div className="mt-4 rounded-xl border border-green-700/40 bg-green-900/25 p-4">
                <p className="text-sm font-medium text-green-300">🎉 Suntem disponibili pe {formatDateRo(form.eventDate)}!</p>
                <p className="mt-1 text-xs text-neutral-400">Alege cum continuăm:</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setLeaveNumber((v) => !v); trackFormAction(); }}
                    className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/20"
                  >
                    Lasă-ne numărul — te sunăm noi
                  </button>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackClick("click_whatsapp", "avail_ok")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-400"
                  >
                    <WhatsAppIcon /> Scrie-ne pe WhatsApp
                  </a>
                </div>
              </div>
            )}

            {availStatus === "unavailable" && formStatus !== "sent" && (
              <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
                <p className="text-sm font-medium text-amber-200">Data {formatDateRo(form.eventDate)} pare deja rezervată.</p>
                <p className="mt-1 text-xs text-neutral-400">Uneori se eliberează sau găsim o soluție. Lasă-ne numărul sau scrie-ne.</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setLeaveNumber((v) => !v); trackFormAction(); }}
                    className="rounded-xl border border-neutral-600 bg-neutral-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-neutral-400"
                  >
                    Lasă-ne numărul — revenim dacă se poate
                  </button>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackClick("click_whatsapp", "avail_no")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-400"
                  >
                    <WhatsAppIcon /> Scrie-ne pe WhatsApp
                  </a>
                </div>
              </div>
            )}

            {leaveNumber && formStatus !== "sent" && (
              <form onSubmit={handleFormSubmit} onFocus={trackFormStart} data-live-track="off" className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                <input
                  type="text"
                  required
                  placeholder="Numele tău"
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500"
                />
                <input
                  type="tel"
                  required
                  placeholder="Telefon sau WhatsApp"
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500"
                />
                {formStatus === "error" && <p className="text-sm text-red-400">A apărut o eroare. Încearcă din nou.</p>}
                <button
                  type="submit"
                  disabled={formStatus === "sending" || !form.name || !form.phone}
                  className="w-full rounded-xl bg-amber-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:bg-neutral-700"
                >
                  {formStatus === "sending" ? "Se trimite…" : "Trimite numărul"}
                </button>
              </form>
            )}

            {formStatus === "sent" && (
              <div className="mt-4 rounded-xl border border-green-700/40 bg-green-900/30 p-6 text-center">
                <p className="mb-1 text-2xl">✓</p>
                <p className="text-sm font-medium text-green-300">Am primit numărul tău!</p>
                <p className="mt-1 text-xs text-neutral-400">Te contactăm în curând pentru {formatDateRo(form.eventDate)}.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── JOURNEY ────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12">
            <p className="text-amber-200 text-xs tracking-[0.25em] uppercase mb-3">Simplu, de la primul mesaj</p>
            <h2 className="text-3xl sm:text-4xl font-light leading-tight">Tot ce ai nevoie ca să alegi cu încredere.</h2>
          </div>
          <div className="grid md:grid-cols-3 border-y border-white/10">
            {journeySteps.map((step, index) => (
              <div key={step.number} className={`py-8 md:py-3 md:pr-8 ${index ? "md:pl-8 md:border-l md:border-white/10" : ""}`}>
                <p className="text-amber-200 text-xs tracking-[0.2em] mb-8">{step.number}</p>
                <h3 className="text-lg font-medium mb-3">{step.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PACKAGES ───────────────────────────────────────────────── */}
      {page.packages.length > 0 && (
        <section id="pachete" className="py-24 px-6 bg-[#151515]">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl mb-10">
              <p className="text-amber-200 text-xs tracking-[0.25em] uppercase mb-3">Pachete</p>
              <h2 className="text-3xl sm:text-4xl font-light text-white mb-3">Alege experiența care vi se potrivește.</h2>
              <p className="text-sm text-neutral-400 leading-relaxed">Fiecare pachet este un punct de plecare. Ne adaptăm poveștii, ritmului și oamenilor care fac ziua voastră unică.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {page.packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`rounded-2xl border p-6 flex flex-col ${
                    pkg.highlighted
                      ? "bg-amber-950/30 border-amber-700/50 shadow-lg shadow-amber-900/20"
                      : "bg-neutral-900 border-neutral-800"
                  }`}
                >
                  {pkg.highlighted && (
                    <span className="self-start text-[10px] font-bold tracking-widest uppercase text-amber-400 bg-amber-900/40 px-2.5 py-1 rounded-full mb-3">
                      Popular
                    </span>
                  )}
                  <h3 className="text-white font-semibold text-lg mb-1">{pkg.name}</h3>
                  <p className="text-amber-400 text-2xl font-light mb-5">{pkg.price}</p>
                  <ul className="space-y-2 flex-1">
                    {pkg.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2 text-sm text-neutral-300">
                        <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={whatsappLink}
                    onClick={() => trackClick("click_whatsapp", "package")}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white text-sm font-medium py-3 px-4 rounded-xl transition-colors"
                  >
                    <WhatsAppIcon />
                    Alege pachetul
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── TESTIMONIALS ───────────────────────────────────────────── */}
      {page.testimonials.length > 0 && (
        <section className="py-24 px-6 max-w-6xl mx-auto">
          <p className="text-amber-200 text-xs tracking-[0.25em] uppercase mb-3">Recenzii</p>
          <h2 className="text-3xl font-light text-white mb-10">Ce spun clienții</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {page.testimonials.map((testimonial) => (
              <div key={testimonial.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                <p className="text-neutral-300 text-sm leading-relaxed mb-5 italic">"{testimonial.text}"</p>
                <div>
                  <p className="text-white text-sm font-medium">{testimonial.name}</p>
                  <p className="text-neutral-500 text-xs capitalize mt-0.5">{testimonial.eventType}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FINAL CTA ──────────────────────────────────────────────── */}
      <section id="oferta" className="py-24 px-6 bg-neutral-900 border-t border-neutral-800 scroll-mt-6">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-amber-200 text-xs tracking-[0.25em] uppercase mb-3">Următorul pas</p>
          <h2 className="text-3xl sm:text-4xl font-light text-white mb-3">Hai să vedem dacă data ta e liberă.</h2>
          <p className="text-neutral-400 text-sm mb-8 leading-relaxed">Verifică disponibilitatea în 5 secunde sau scrie-ne direct.</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <a href="#verifica-data"
              className="flex-1 inline-flex items-center justify-center gap-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-all"
            >
              Verifică disponibilitatea <ArrowIcon />
            </a>
            <a href={whatsappLink} target="_blank" rel="noreferrer" onClick={() => trackClick("click_whatsapp", "final_cta")}
              className="flex-1 inline-flex items-center justify-center gap-2.5 bg-green-500 hover:bg-green-400 text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-all"
            >
              <WhatsAppIcon />
              {page.ctaText || "Scrie pe WhatsApp"}
            </a>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row justify-center gap-3">
            <PhoneNumberReveal
              phone={page.phoneNumber}
              buttonLabel="Sună acum"
              revealedPrefix="Sună acum — "
              context={`campanie ${page.slug} · CTA final`}
              onRevealed={() => trackClick("click_phone", "final_cta")}
              className="inline-flex items-center justify-center gap-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium px-6 py-3.5 rounded-xl text-sm border border-neutral-700 transition-all"
              icon={<PhoneIcon />}
            />
            <a
              href="https://instagram.com/ancavisuals"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-neutral-700 bg-neutral-800 px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-neutral-700"
            >
              <InstagramIcon /> Vezi-ne pe Instagram
            </a>
          </div>
        </div>
      </section>

      <div className="py-6 text-center">
        <p className="text-neutral-700 text-xs">© Ancavisuals · ancavisuals.ro</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-neutral-950/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg gap-2">
          <a href="#verifica-data" className="flex-1 rounded-xl bg-amber-500 px-3 py-3 text-center text-xs font-bold text-neutral-950">Verifică data</a>
          <a href={whatsappLink} target="_blank" rel="noreferrer" onClick={() => trackClick("click_whatsapp", "sticky_mobile")} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-500 px-3 py-3 text-xs font-bold text-white"><WhatsAppIcon /> WhatsApp</a>
        </div>
      </div>
    </div>
  );
}
