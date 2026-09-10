import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useAuth from "../auth/useAuth";
import Breadcrumb from "./Breadcrumb";

// ── Types (mirror server serializeSession) ───────────────────────────────────

type Priority = "low" | "normal" | "high" | "critical";
type Source = "google_ads" | "organic" | "ai" | "direct" | "referral";

interface LiveEvent {
  id: string;
  name: string;
  at: number;
  page: string;
  label?: string;
  priority: Priority;
  meta?: Record<string, unknown>;
}

interface LiveSession {
  sessionId: string;
  visitorNumber: number;
  isNew: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  lastEventAt: number;
  endedAt: number | null;
  endReason: string | null;
  durationSeconds: number;
  currentPage: string;
  currentPageTitle: string;
  pageCount: number;
  path: { page: string; at: number }[];
  events: LiveEvent[];
  scrollByPage: Record<string, number>;
  attribution: Record<string, string | undefined>;
  isGoogleAds: boolean;
  source: Source;
  city: string;
  country: string;
  deviceType: "mobile" | "tablet" | "desktop";
  idle: boolean;
  archived?: boolean;
}

// ── Formatting ──────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, critical: 3 };

const SOURCE_BADGE: Record<Source, { label: string; cls: string }> = {
  google_ads: { label: "Google Ads", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  organic: { label: "Organic", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  ai: { label: "AI", cls: "bg-violet-500/15 text-violet-300 border-violet-500/25" },
  referral: { label: "Referral", cls: "bg-sky-500/15 text-sky-300 border-sky-500/25" },
  direct: { label: "Direct", cls: "bg-neutral-700/40 text-neutral-300 border-neutral-600/40" },
};

function pageName(path: string): string {
  const p = (path || "/").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";
  const map: Record<string, string> = {
    "/": "Acasă", "/oferta": "Ofertă", "/pricing": "Prețuri", "/preturi": "Prețuri",
    "/portfolio": "Portofoliu", "/videos": "Video", "/contact": "Contact", "/about": "Despre",
    "/blog": "Blog", "/fotocabina": "Fotocabină", "/recenzii": "Recenzii",
  };
  if (map[p]) return map[p];
  if (p.startsWith("/oferta/")) return "Ofertă";
  if (p.startsWith("/blog/")) return "Articol blog";
  if (p.startsWith("/media/")) return "Galerie client";
  if (/^\/(fotograf|videograf|foto-video|foto|video)-/.test(p)) return "Pagină SEO";
  return p;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} ${r === 1 ? "secundă" : "secunde"}`;
  const mm = `${m} ${m === 1 ? "minut" : "minute"}`;
  if (r === 0) return mm;
  return `${mm} și ${r} ${r === 1 ? "secundă" : "secunde"}`;
}

/** Romanian sentence for one event. Reused by the Phase-2 voice queue. */
export function formatEvent(ev: LiveEvent, s: LiveSession): string {
  const where = pageName(ev.page);
  const src = s.isGoogleAds ? " din Google Ads" : "";
  switch (ev.name) {
    case "session_started":
      return `Un vizitator${src} a intrat pe site${where !== "Acasă" ? ` — pe ${where}` : ""}.`;
    case "page_view":
      return `A trecut pe pagina ${where}.`;
    case "scroll_depth": {
      const d = ev.meta?.depth;
      return d ? `A dat scroll ${d}% pe ${where}.` : `Derulează pagina ${where}.`;
    }
    case "pricing_viewed":
      return `Vizitatorul a ajuns la prețuri (${where}).`;
    case "gallery_viewed":
      return `Vizitatorul s-a uitat la galeria de poze.`;
    case "gallery_load_more": {
      const n = ev.meta?.newCount;
      return `A apăsat pe „MAI MULTE POZE"${n ? ` — vede ${n} poze` : ""}.`;
    }
    case "element_clicked":
      return `A apăsat pe „${ev.meta?.text || ev.label || "un buton"}" (${where}).`;
    case "lightbox_opened":
      return `A deschis o poză pe tot ecranul.`;
    case "section_dwell":
      return `Se uită la secțiunea ${ev.label || "pagină"}.`;
    case "reviews_viewed":
      return `Vizitatorul citește recenziile.`;
    case "contact_clicked":
      return `⚡ Vizitatorul a apăsat pe „${ev.meta?.text || "Contactează-ne"}".`;
    case "whatsapp_clicked":
      return `⚡ Vizitatorul a apăsat pe WhatsApp („${ev.meta?.text || "WhatsApp"}").`;
    case "phone_revealed":
      return `⚡ Vizitatorul a afișat / apăsat numărul de telefon.`;
    case "availability_checked": {
      const d = ev.meta?.date;
      const free = ev.meta?.available;
      return `📅 A verificat disponibilitatea pentru ${d || "o dată"}${free === false ? " — ocupată" : free === true ? " — liberă" : ""}.`;
    }
    case "form_started": {
      const kind = ev.meta?.kind;
      if (kind === "delivery") return `Completează adresa de livrare…`;
      if (kind === "subscribe") return `Se abonează la album…`;
      if (kind === "contact") return `A început formularul de contact.`;
      return `A început să completeze un formular.`;
    }
    case "form_submitted": {
      const kind = ev.meta?.kind;
      if (kind === "delivery") return `📦 A completat adresa de livrare — vrea albumul fizic.`;
      if (kind === "subscribe") return `📧 S-a abonat — vrea notificare când sunt gata pozele.`;
      if (kind === "contact") {
        const who = [ev.meta?.name, ev.meta?.phone].filter(Boolean).join(" · ");
        return who
          ? `🎯 Un client a trimis formularul de contact — sună-l: ${who}`
          : `🎯 Un client a trimis formularul de contact — vrea să-l suni!`;
      }
      return `✅ A trimis un formular.`;
    }
    case "visitor_idle":
      return `Vizitatorul este inactiv.`;
    case "session_ended": {
      const d = Number(ev.meta?.durationSeconds ?? s.durationSeconds);
      return `Vizitatorul a plecat după ${formatDuration(d)}.`;
    }
    default:
      return ev.label || ev.name;
  }
}

function shortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LiveVisitorsPage() {
  const { auth } = useAuth();
  const [sessions, setSessions] = useState<Map<string, LiveSession>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlyGoogleAds, setOnlyGoogleAds] = useState(false);
  const [minPriority, setMinPriority] = useState<Priority>("low");
  const [tab, setTab] = useState<"live" | "history">("live");
  const [history, setHistory] = useState<LiveSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [, forceTick] = useState(0);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async () => {
    if (!auth.accessToken) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/live/history?limit=200&archived=${showArchived ? "1" : "0"}`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      const data = (await res.json()) as { sessions?: LiveSession[] };
      setHistory(data.sessions ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [auth.accessToken, showArchived]);

  useEffect(() => {
    if (tab === "history") { setSelectedId(null); void loadHistory(); }
  }, [tab, loadHistory]);

  const archiveSession = useCallback(async (sessionId: string, archived: boolean) => {
    if (!auth.accessToken) return;
    setHistory((prev) => prev.filter((s) => s.sessionId !== sessionId));
    if (selectedId === sessionId) setSelectedId(null);
    try {
      await fetch(`/api/admin/analytics/live/${encodeURIComponent(sessionId)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
        body: JSON.stringify({ archived }),
      });
    } catch { /* revert on next reload */ }
  }, [auth.accessToken, selectedId]);

  // tick every second so live durations advance
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const applyEvent = useCallback((payload: Record<string, unknown>) => {
    const type = payload.type as string;
    if (type === "snapshot") {
      const map = new Map<string, LiveSession>();
      (payload.sessions as LiveSession[]).forEach((s) => map.set(s.sessionId, s));
      setSessions(map);
      return;
    }
    if (type === "session_removed") {
      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(payload.sessionId as string);
        return next;
      });
      return;
    }
    const s = payload.session as LiveSession | undefined;
    if (s) {
      setSessions((prev) => {
        const next = new Map(prev);
        next.set(s.sessionId, s);
        return next;
      });
    }
  }, []);

  // SSE connection with reconnect
  useEffect(() => {
    if (!auth.accessToken) return;
    let stopped = false;
    let retry = 0;
    let controller: AbortController | null = null;

    const connect = async () => {
      controller = new AbortController();
      try {
        const res = await fetch("/api/admin/analytics/live/stream", {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          signal: controller.signal,
        });
        if (!res.body) throw new Error("no body");
        setConnected(true);
        retry = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try { applyEvent(JSON.parse(line.slice(6)) as Record<string, unknown>); } catch { /* skip */ }
          }
        }
      } catch { /* fallthrough to reconnect */ }
      if (stopped) return;
      setConnected(false);
      retry = Math.min(retry + 1, 6);
      window.setTimeout(connect, 1000 * retry);
    };
    connect();

    return () => { stopped = true; controller?.abort(); };
  }, [auth.accessToken, applyEvent]);

  const liveList = useMemo(() => {
    let arr = Array.from(sessions.values());
    if (onlyGoogleAds) arr = arr.filter((s) => s.isGoogleAds);
    return arr.sort((a, b) => {
      const aActive = a.endedAt ? 0 : 1;
      const bActive = b.endedAt ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;
      return b.lastEventAt - a.lastEventAt;
    });
  }, [sessions, onlyGoogleAds]);

  const historyList = useMemo(() => {
    let arr = [...history];
    if (onlyGoogleAds) arr = arr.filter((s) => s.isGoogleAds);
    return arr.sort((a, b) => (b.firstSeenAt ?? 0) - (a.firstSeenAt ?? 0));
  }, [history, onlyGoogleAds]);

  const list = tab === "live" ? liveList : historyList;
  const activeCount = liveList.filter((s) => !s.endedAt).length;
  const selected = selectedId ? list.find((s) => s.sessionId === selectedId) ?? null : null;

  // auto-select the most recent visitor when nothing selected (live tab only)
  useEffect(() => {
    if (tab === "live" && !selectedId && liveList.length > 0) setSelectedId(liveList[0].sessionId);
  }, [tab, liveList, selectedId]);

  const visibleEvents = useMemo(() => {
    if (!selected) return [];
    return selected.events.filter((e) => PRIORITY_RANK[e.priority] >= PRIORITY_RANK[minPriority]);
  }, [selected, minPriority]);

  // When switching visitor, jump straight to the newest events (bottom), no animation.
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedId]);

  // Follow new events for the visitor already open.
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleEvents.length]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Breadcrumb />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-white text-xl font-bold">Vizitatori</h1>
        <div className="flex rounded-lg border border-neutral-700 overflow-hidden text-xs">
          <button
            onClick={() => setTab("live")}
            className={`px-3 py-1.5 transition-colors ${tab === "live" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
          >
            Live{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-3 py-1.5 transition-colors ${tab === "history" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
          >
            Istoric
          </button>
        </div>
        {tab === "live" ? (
          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${connected ? "border-emerald-500/40 text-emerald-300" : "border-neutral-600 text-neutral-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-neutral-500"}`} />
            {connected ? "conectat" : "reconectare…"}
          </span>
        ) : (
          <>
            <button onClick={loadHistory} className="text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-2.5 py-1 transition-colors">
              {historyLoading ? "Se încarcă…" : "Reîncarcă"}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Arhivate
            </label>
          </>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
          <input type="checkbox" checked={onlyGoogleAds} onChange={(e) => setOnlyGoogleAds(e.target.checked)} />
          Doar Google Ads
        </label>
        <select
          value={minPriority}
          onChange={(e) => setMinPriority(e.target.value as Priority)}
          className="bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-200 px-2 py-1"
        >
          <option value="low">Toate evenimentele</option>
          <option value="normal">Normale și importante</option>
          <option value="high">Importante și critice</option>
          <option value="critical">Doar critice</option>
        </select>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        {/* Visitor list */}
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {list.length === 0 && (
            <p className="text-neutral-500 text-sm p-4 border border-neutral-800 rounded-xl">
              {tab === "live"
                ? "Niciun vizitator momentan. Deschide site-ul într-un alt browser pentru test."
                : historyLoading
                  ? "Se încarcă istoricul…"
                  : showArchived ? "Nicio sesiune arhivată." : "Nicio sesiune în istoric încă."}
            </p>
          )}
          {list.map((s) => {
            const badge = SOURCE_BADGE[s.source];
            const dur = s.endedAt ? s.durationSeconds : Math.round((Date.now() - s.firstSeenAt) / 1000);
            const last = s.events[s.events.length - 1];
            return (
              <div
                key={s.sessionId}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(s.sessionId)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(s.sessionId); }}
                className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                  selectedId === s.sessionId ? "border-neutral-500 bg-neutral-800/60" : "border-neutral-800 hover:border-neutral-700"
                } ${s.endedAt && tab === "live" ? "opacity-55" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-sm font-semibold">Vizitator {s.visitorNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                  {s.idle && !s.endedAt && <span className="text-[10px] text-neutral-500">idle</span>}
                  {s.endedAt && tab === "live" && <span className="text-[10px] text-neutral-500">plecat</span>}
                  <span className="ml-auto text-[11px] text-neutral-500">{formatDuration(dur)}</span>
                </div>
                <p className="text-xs text-neutral-300 truncate">{pageName(s.currentPage)} · {s.deviceType} · {s.pageCount} pag.</p>
                <p className="text-[11px] text-neutral-500 truncate">
                  {tab === "history" && s.firstSeenAt ? `${new Date(s.firstSeenAt).toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · ` : ""}
                  {[s.city, s.country].filter(Boolean).join(", ") || "locație necunoscută"}
                  {last ? ` · ${formatEvent(last, s)}` : ""}
                </p>
                {tab === "history" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); archiveSession(s.sessionId, !showArchived); }}
                    className="mt-1.5 text-[11px] text-neutral-500 hover:text-neutral-200 transition-colors"
                  >
                    {showArchived ? "↩ Dezarhivează" : "🗄 Arhivează"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Feed */}
        <div className="border border-neutral-800 rounded-xl overflow-hidden flex flex-col max-h-[70vh]">
          {!selected ? (
            <p className="text-neutral-500 text-sm p-6">Selectează un vizitator.</p>
          ) : (
            <>
              <div className="p-3 border-b border-neutral-800 bg-neutral-900/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">Vizitator {selected.visitorNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_BADGE[selected.source].cls}`}>
                    {SOURCE_BADGE[selected.source].label}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {selected.pageCount} pagin{selected.pageCount === 1 ? "ă" : "i"} · {[selected.city, selected.country].filter(Boolean).join(", ") || "loc. necunoscută"}
                  </span>
                  {tab === "history" && (
                    <button
                      onClick={() => archiveSession(selected.sessionId, !showArchived)}
                      className="ml-auto text-[11px] text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-2 py-0.5 transition-colors"
                    >
                      {showArchived ? "↩ Dezarhivează" : "🗄 Arhivează"}
                    </button>
                  )}
                </div>
                {tab === "history" && selected.firstSeenAt && (
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {new Date(selected.firstSeenAt).toLocaleString("ro-RO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" · durată "}{formatDuration(selected.durationSeconds)}
                  </p>
                )}
                {(selected.attribution.utmCampaign || selected.attribution.gclid) && (
                  <p className="text-[11px] text-neutral-500 mt-1 truncate">
                    {selected.attribution.utmCampaign ? `campanie: ${selected.attribution.utmCampaign}` : ""}
                    {selected.attribution.gclid ? "  · gclid ✓" : ""}
                  </p>
                )}
              </div>
              <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {visibleEvents.map((ev) => (
                  <div key={ev.id} className="flex gap-2 text-sm">
                    <span className="text-neutral-600 text-xs shrink-0 tabular-nums pt-0.5">{shortTime(ev.at)}</span>
                    <span className={ev.priority === "critical" ? "text-amber-300 font-medium" : ev.priority === "high" ? "text-neutral-100" : "text-neutral-300"}>
                      {formatEvent(ev, selected)}
                    </span>
                  </div>
                ))}
                {visibleEvents.length === 0 && <p className="text-neutral-600 text-xs">Niciun eveniment la acest nivel de prioritate.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
