import React, { useEffect, useMemo, useState } from "react";
import { destination, isProd } from "../../../utils/address";
import Breadcrumb from "./Breadcrumb";
import AncaLoader from "../../../components/UI/AncaLoader";
import useAuth from "../auth/useAuth";
import ConfirmModal from "./ConfirmModal";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import { QR_EVENT_TYPES, getHostRoleLabel, normalizeQrEventType, type QrEventType } from "../../../../shared/qrMoments/hostRoles";

type QREventListItem = {
  id: string;
  eventSlug: string;
  adminEventId: string | null;
  bride: string | null;
  groom: string | null;
  eventType: QrEventType;
  notificationEmail?: string | null;
  pin: string | null;
  eventDate: string;
  createdAt: string | null;
};

type AdminEventOption = {
  id: string;
  type: string;
  status: string;
  typeLabel?: string;
  eventDate: string | null;
  client: {
    fullName: string;
  };
};

type QRGuest = {
  id: string;
  name: string;
  email: string;
  gdprConsent: boolean;
  emailConsent: boolean;
  uploadIds: string[];
  createdAt: string;
};

type QRUpload = {
  id: string;
  eventSlug: string;
  guestId: string;
  guestName: string;
  type: "photo" | "video" | "audio";
  bunnyUrl: string;
  fileName: string;
  originalName: string;
  visible: boolean;
  mimeType: string;
  createdAt: string;
};

type QRComment = {
  id: string;
  uploadId: string;
  eventSlug: string;
  text: string;
  fromHost: boolean;
  createdAt: string;
  uploadOriginalName: string | null;
  guestName: string;
};

type QREventOverview = {
  event: QREventListItem;
  guests: QRGuest[];
  uploads: QRUpload[];
  comments: QRComment[];
};

type QREmailGroup = {
  eventSlug: string;
  coupleLabel: string;
  eventDate: string | null;
  notificationEmail: string | null;
  guests: Array<{
    id: string;
    name: string;
    email: string;
    emailConsent: boolean;
    uploadCount: number;
    createdAt: string | null;
  }>;
};

type QRMaterialType = "all" | "photo" | "video" | "audio";

type QREventFormValues = {
  adminEventId: string;
  bride: string;
  groom: string;
  eventType: QrEventType;
  notificationEmail: string;
  eventDate: string;
  pin: string;
};

function QRMaterialDownloadButtons({
  onDownload,
  downloading,
}: {
  onDownload: (type: QRMaterialType) => void;
  downloading: QRMaterialType | null;
}) {
  const buttons: Array<{ type: QRMaterialType; label: string }> = [
    { type: "all", label: "Toate materialele" },
    { type: "photo", label: "Foto" },
    { type: "video", label: "Video" },
    { type: "audio", label: "Audio voice" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((button) => (
        <button
          key={button.type}
          type="button"
          onClick={() => onDownload(button.type)}
          disabled={downloading !== null}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 ${
            button.type === "all"
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              : "border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
          }`}
        >
          {downloading === button.type ? "Se pregătește..." : `⬇ ${button.label}`}
        </button>
      ))}
    </div>
  );
}

function QRLinkRow({ eventSlug, pin, eventType }: { eventSlug: string; pin: string; eventType: QrEventType }) {
  const [copiedTarget, setCopiedTarget] = useState<"guest" | "gallery" | null>(null);
  const guestUrl = `${destination}/qr-moments/${eventSlug}?pass=${pin}`;
  const galleryUrl = `${destination}/qr-moments/${eventSlug}/gallery?pin=${pin}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(guestUrl)}`;
  const roleALabel = getHostRoleLabel(eventType, "bride");
  const roleBLabel = getHostRoleLabel(eventType, "groom");

  const handleCopy = (target: "guest" | "gallery", value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget((current) => (current === target ? null : current)), 2000);
    }).catch(() => {});
  };

  return (
    <div className="mt-4 rounded-xl bg-neutral-900 border border-neutral-800 p-4">
      <p className="text-neutral-500 text-xs uppercase tracking-wide mb-3">Acces public QR Moments</p>
      {!isProd && (
        <div className="mb-4 rounded-lg bg-red-950 border border-red-700 p-3">
          <p className="text-red-300 text-xs font-semibold">
            ⚠️ Rulezi pe localhost (development). Codul QR generat acum conține linkul "{destination}" și NU va funcționa pentru invitați.
          </p>
          <p className="text-red-400/80 text-xs mt-1">
            Nu descărca și nu printa acest cod. Deschide https://ancavisuals.ro/admin pentru un cod QR valid.
          </p>
        </div>
      )}
      <div className="flex gap-4 items-start">
        <img
          src={qrImageUrl}
          alt="QR Code"
          width={120}
          height={120}
          className="rounded-lg shrink-0 bg-white p-1"
        />
        <div className="flex-1 space-y-4 min-w-0">
          <div className="space-y-2">
            <p className="text-neutral-400 text-xs">Link invitați pentru upload:</p>
            <p className="text-amber-300 text-xs font-mono break-all">{guestUrl}</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleCopy("guest", guestUrl)}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs hover:border-neutral-500 hover:text-white transition-colors"
              >
                {copiedTarget === "guest" ? "Copiat!" : "Copiază link invitați"}
              </button>
              <a
                href={isProd ? qrImageUrl : undefined}
                download={`qr-${eventSlug}.png`}
                aria-disabled={!isProd}
                onClick={(e) => { if (!isProd) e.preventDefault(); }}
                title={!isProd ? "Indisponibil pe localhost — deschide site-ul live" : undefined}
                className={`px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs transition-colors ${
                  isProd ? "text-neutral-300 hover:border-neutral-500 hover:text-white" : "text-neutral-600 cursor-not-allowed opacity-50"
                }`}
              >
                Descarcă QR
              </a>
            </div>
          </div>

          <div className="space-y-2 border-t border-neutral-800 pt-4">
            <p className="text-neutral-400 text-xs">Link unic pentru client — galerie + gestionare:</p>
            <p className="text-emerald-300 text-xs font-mono break-all">{galleryUrl}</p>
            <p className="text-neutral-500 text-[11px] leading-relaxed">
              Trimite acest link clientului. Se deschide direct, cu PIN-ul inclus, iar {roleALabel.toLowerCase()} și {roleBLabel.toLowerCase()} pot vedea și gestiona upload-urile invitaților.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleCopy("gallery", galleryUrl)}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs hover:border-neutral-500 hover:text-white transition-colors"
              >
                {copiedTarget === "gallery" ? "Copiat!" : "Copiază link galerie"}
              </button>
              <a
                href={galleryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs hover:border-neutral-500 hover:text-white transition-colors"
              >
                        Deschide galeria
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DISPLAYABLE_IMAGE = ["image/jpeg", "image/png", "image/webp"];
const DISPLAYABLE_VIDEO = ["video/mp4"];
const DISPLAYABLE_AUDIO = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"];

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCoupleLabel(event: QREventListItem): string {
  if (event.bride && event.groom) return `${event.bride} & ${event.groom}`;
  return event.eventSlug;
}

function buildSlugFromDate(dateValue: string): string {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleString("ro-RO", { month: "long" }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  return `${String(date.getDate()).padStart(2, "0")}${month}${date.getFullYear()}`;
}

function formatAdminEventLabel(event: AdminEventOption): string {
  const typeLabel = event.typeLabel ? `${event.type} · ${event.typeLabel}` : event.type;
  const dateLabel = event.eventDate ? new Date(event.eventDate).toLocaleDateString("ro-RO") : "fără dată";
  return `${event.client.fullName} · ${typeLabel} · ${dateLabel}`;
}

async function readApiPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (contentType.includes("text/html") || text.includes("/@vite/client") || text.includes("__vite_plugin_react_preamble_installed__")) {
    return { error: "Requestul a primit HTML în loc de JSON. În development, deschide aplicația prin Express pe :1994 sau folosește proxy-ul Vite pentru /api." };
  }
  return { error: text || `HTTP ${response.status}` };
}

const inputClass =
  "w-full bg-neutral-800 text-white text-sm placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-neutral-500 transition-colors";
const labelClass = "block text-neutral-400 text-xs font-medium mb-1 uppercase tracking-wide";

function EventEditorModal({
  mode,
  initialValues,
  saving,
  error,
  adminEvents,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialValues: QREventFormValues;
  saving: boolean;
  error: string | null;
  adminEvents: AdminEventOption[];
  onClose: () => void;
  onSubmit: (values: QREventFormValues) => void;
}) {
  useBodyScrollLock(true);
  const [form, setForm] = useState<QREventFormValues>(initialValues);

  const set =
    (field: keyof QREventFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const handleAdminEventChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const adminEventId = event.target.value;
    const selectedAdminEvent = adminEvents.find((entry) => entry.id === adminEventId) ?? null;

    setForm((previous) => {
      if (!selectedAdminEvent) {
        return {
          ...previous,
          adminEventId,
        };
      }

      const nextEventDate = selectedAdminEvent.eventDate ? selectedAdminEvent.eventDate.slice(0, 10) : previous.eventDate;

      return {
        ...previous,
        adminEventId,
        eventDate: nextEventDate,
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-base font-semibold">{mode === "create" ? "Eveniment QR nou" : "Editează evenimentul QR"}</h2>
            <p className="text-neutral-500 text-xs mt-0.5">
              {mode === "create" ? "Creează un eveniment și primești imediat slug + PIN." : "Actualizează datele publice și PIN-ul evenimentului."}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="space-y-3">
          {mode === "create" && (
            <div>
              <label className={labelClass}>Eveniment existent (opțional)</label>
              <select className={inputClass} value={form.adminEventId} onChange={handleAdminEventChange}>
                <option value="">Fără eveniment existent — completează data manual</option>
                {adminEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatAdminEventLabel(event)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Data eveniment</label>
              <input
                className={inputClass}
                type={mode === "create" && !form.adminEventId ? "date" : mode === "create" ? "text" : "date"}
                value={mode === "create" && form.adminEventId ? (form.eventDate ? formatDate(form.eventDate) : "") : form.eventDate}
                onChange={mode === "edit" || !form.adminEventId ? set("eventDate") : undefined}
                disabled={mode === "create" && Boolean(form.adminEventId)}
                placeholder={mode === "create" && !form.adminEventId ? "Alege data evenimentului" : "Se completează din eveniment"}
              />
            </div>
            <div>
              <label className={labelClass}>Nume QR Moment</label>
              <input className={inputClass} value={buildSlugFromDate(form.eventDate)} disabled placeholder="Generat din data evenimentului" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Tip eveniment</label>
            <select
              className={inputClass}
              value={form.eventType}
              onChange={(event) => setForm((previous) => {
                const nextEventType = normalizeQrEventType(event.target.value);
                if (nextEventType === 'corporate') {
                  return {
                    ...previous,
                    eventType: nextEventType,
                    bride: previous.bride.trim() || 'ORGANIZATORUL',
                    groom: '',
                  };
                }
                return {
                  ...previous,
                  eventType: nextEventType,
                  bride: previous.eventType === 'corporate' && previous.bride === 'ORGANIZATORUL' ? '' : previous.bride,
                };
              })}
            >
              {QR_EVENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {form.eventType === 'corporate' ? (
            <div>
              <label className={labelClass}>Organizator</label>
              <input className={inputClass} value={form.bride} onChange={set("bride")} placeholder="ORGANIZATORUL" />
              <p className="text-neutral-600 text-[11px] mt-1">Dacă rămâne necompletat, va fi afișat „ORGANIZATORUL”.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{getHostRoleLabel(form.eventType, "bride")}</label>
                <input className={inputClass} value={form.bride} onChange={set("bride")} placeholder="Ana" />
              </div>
              <div>
                <label className={labelClass}>{getHostRoleLabel(form.eventType, "groom")}</label>
                <input className={inputClass} value={form.groom} onChange={set("groom")} placeholder="Dan" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email notificări</label>
              <input className={inputClass} value={form.notificationEmail} onChange={set("notificationEmail")} placeholder="contact@exemplu.ro" />
            </div>
            <div>
              <label className={labelClass}>PIN galerie</label>
              <input className={inputClass} value={form.pin} onChange={set("pin")} placeholder="autogenerat dacă lipsește" />
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 text-sm hover:border-neutral-500 hover:text-white transition-colors">
            Anulează
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? "Se salvează..." : mode === "create" ? "Creează" : "Salvează"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaPreview({ upload }: { upload: QRUpload }) {
  if (DISPLAYABLE_IMAGE.includes(upload.mimeType)) {
    return <img src={upload.bunnyUrl} alt="" className="w-16 h-16 rounded-lg object-cover bg-neutral-900" />;
  }

  if (DISPLAYABLE_VIDEO.includes(upload.mimeType)) {
    return <video src={upload.bunnyUrl} className="w-16 h-16 rounded-lg object-cover bg-neutral-900" muted />;
  }

  if (DISPLAYABLE_AUDIO.includes(upload.mimeType)) {
    return <div className="w-16 h-16 rounded-lg bg-neutral-900 flex items-center justify-center text-xl">🎙</div>;
  }

  return <div className="w-16 h-16 rounded-lg bg-neutral-900 flex items-center justify-center text-xl">📎</div>;
}

export default function QRMomentsAdminPage() {
  const { auth } = useAuth();
  const [events, setEvents] = useState<QREventListItem[]>([]);
  const [adminEvents, setAdminEvents] = useState<AdminEventOption[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string>("");
  const [overview, setOverview] = useState<QREventOverview | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"uploads" | "guests" | "comments">("uploads");
  const [busyUploadId, setBusyUploadId] = useState<string | null>(null);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [pinResetLoading, setPinResetLoading] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteCommentConfirmation, setDeleteCommentConfirmation] = useState<QRComment | null>(null);
  const [deleteUploadConfirmation, setDeleteUploadConfirmation] = useState<QRUpload | null>(null);
  const [deleteGuestUploadsConfirmation, setDeleteGuestUploadsConfirmation] = useState<QRGuest | null>(null);
  const [busyGuestId, setBusyGuestId] = useState<string | null>(null);
  const [pinResetConfirmation, setPinResetConfirmation] = useState(false);
  const [deleteEventConfirmation, setDeleteEventConfirmation] = useState<QREventListItem | null>(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [showEmailDirectory, setShowEmailDirectory] = useState(false);
  const [emailGroups, setEmailGroups] = useState<QREmailGroup[]>([]);
  const [loadingEmailDirectory, setLoadingEmailDirectory] = useState(false);
  const [downloadingMaterials, setDownloadingMaterials] = useState<{ eventSlug: string; type: QRMaterialType } | null>(null);

  const authHeader = useMemo(() => ({ Authorization: `Bearer ${auth.accessToken}` }), [auth.accessToken]);

  const loadEvents = async () => {
    if (!auth.accessToken) return;
    setLoadingEvents(true);
    setError(null);
    try {
      const result = await fetch("/api/qr-moments/admin/events", { headers: authHeader }).then((response) => response.json());
      if (result.error) {
        setError(result.error);
        return;
      }
      const nextEvents = result.events ?? [];
      setEvents(nextEvents);
      setSelectedEventSlug((current) => current || nextEvents[0]?.eventSlug || "");
    } catch {
      setError("Nu am putut încărca evenimentele QR Moments.");
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadAdminEvents = async () => {
    if (!auth.accessToken) return;
    try {
      const result = await fetch("/api/admin/events", { headers: authHeader }).then((response) => response.json());
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextEvents = (result.events ?? [])
        .filter((event: AdminEventOption) => {
          if (event.status !== "confirmat") return false;
          if (!event.eventDate) return false;
          const eventDate = new Date(event.eventDate);
          if (Number.isNaN(eventDate.getTime())) return false;
          return eventDate >= today;
        })
        .sort((firstEvent: AdminEventOption, secondEvent: AdminEventOption) => new Date(firstEvent.eventDate as string).getTime() - new Date(secondEvent.eventDate as string).getTime())
        .slice(0, 6);

      setAdminEvents(nextEvents);
    } catch {}
  };

  const loadOverview = async (eventSlug: string) => {
    if (!auth.accessToken || !eventSlug) return;
    setLoadingOverview(true);
    setError(null);
    try {
      const result = await fetch(`/api/qr-moments/admin/${eventSlug}/overview`, { headers: authHeader }).then((response) => response.json());
      if (result.error) {
        setError(result.error);
        setOverview(null);
        return;
      }
      setOverview(result);
    } catch {
      setError("Nu am putut încărca detaliile evenimentului.");
      setOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadEmailDirectory = async () => {
    if (!auth.accessToken) return;
    setLoadingEmailDirectory(true);
    try {
      const result = await fetch("/api/qr-moments/admin/guests", { headers: authHeader }).then((response) => response.json());
      if (result.error) throw new Error(result.error);
      setEmailGroups(result.groups ?? []);
      setShowEmailDirectory(true);
    } catch {
      setError("Nu am putut încărca directorul de emailuri QR Moments.");
    } finally {
      setLoadingEmailDirectory(false);
    }
  };

  const downloadQrMaterials = async (eventSlug: string, type: QRMaterialType) => {
    if (!auth.accessToken || downloadingMaterials) return;
    setDownloadingMaterials({ eventSlug, type });
    setError(null);
    try {
      const response = await fetch(`/api/qr-moments/admin/${encodeURIComponent(eventSlug)}/download?type=${type}`, { headers: authHeader });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Nu există materiale pentru această categorie.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${eventSlug}-qr-moments-${type}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Nu s-au putut descărca materialele.");
    } finally {
      setDownloadingMaterials(null);
    }
  };

  useEffect(() => {
    loadEvents().catch(() => {});
    loadAdminEvents().catch(() => {});
  }, [auth.accessToken]);

  useEffect(() => {
    if (!selectedEventSlug) return;
    loadOverview(selectedEventSlug).catch(() => {});
  }, [selectedEventSlug]);

  const handleResetPin = async () => {
    if (!selectedEventSlug) return;
    setPinResetLoading(true);
    try {
      const result = await fetch(`/api/qr-moments/admin/${selectedEventSlug}/pin`, {
        method: "POST",
        headers: authHeader,
      }).then((response) => response.json());

      if (result.pin) {
        setEvents((previous) => previous.map((event) => event.eventSlug === selectedEventSlug ? { ...event, pin: result.pin } : event));
        setOverview((previous) => previous ? { ...previous, event: { ...previous.event, pin: result.pin } } : previous);
      }
    } finally {
      setPinResetLoading(false);
    }
  };

  const handleCreateEvent = async (values: QREventFormValues) => {
    if (!values.adminEventId && !values.eventDate) {
      setEditorError("Alege un eveniment din listă sau completează data manual.");
      return;
    }

    setEditorSaving(true);
    setEditorError(null);
    try {
      const response = await fetch("/api/qr-moments/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(values),
      });
      const result = await readApiPayload(response);

      if (!response.ok || result.error) {
        setEditorError(result.error ?? `HTTP ${response.status}`);
        return;
      }

      const nextEvent = result.event as QREventListItem;
      setEvents((previous) => [nextEvent, ...previous].sort((firstEvent, secondEvent) => secondEvent.eventDate.localeCompare(firstEvent.eventDate)));
      setSelectedEventSlug(nextEvent.eventSlug);
      setEditorMode(null);
      await loadOverview(nextEvent.eventSlug);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Nu am putut crea evenimentul QR.");
    } finally {
      setEditorSaving(false);
    }
  };

  const handleEditEvent = async (values: QREventFormValues) => {
    if (!selectedEventSlug) return;
    setEditorSaving(true);
    setEditorError(null);
    try {
      const result = await fetch(`/api/qr-moments/admin/${selectedEventSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          adminEventId: values.adminEventId,
          bride: values.bride,
          groom: values.groom,
          eventType: values.eventType,
          notificationEmail: values.notificationEmail,
          eventDate: values.eventDate,
          pin: values.pin,
        }),
      }).then((response) => response.json());

      if (result.error) {
        setEditorError(result.error);
        return;
      }

      const nextEvent = result.event as QREventListItem;
      setEvents((previous) => previous.map((event) => event.eventSlug === selectedEventSlug ? nextEvent : event));
      setOverview((previous) => previous ? { ...previous, event: nextEvent } : previous);
      setEditorMode(null);
    } catch {
      setEditorError("Nu am putut actualiza evenimentul QR.");
    } finally {
      setEditorSaving(false);
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    setBusyUploadId(uploadId);
    try {
      const result = await fetch(`/api/qr-moments/admin/upload/${uploadId}`, {
        method: "DELETE",
        headers: authHeader,
      }).then((response) => response.json());

      if (result.ok) {
        setOverview((previous) => previous ? {
          ...previous,
          uploads: previous.uploads.filter((upload) => upload.id !== uploadId),
          comments: previous.comments.filter((comment) => comment.uploadId !== uploadId),
          guests: previous.guests.map((guest) => ({
            ...guest,
            uploadIds: guest.uploadIds.filter((guestUploadId) => guestUploadId !== uploadId),
          })),
        } : previous);
      }
    } finally {
      setBusyUploadId(null);
    }
  };

  const handleDeleteGuestUploads = async (guestId: string) => {
    setBusyGuestId(guestId);
    try {
      const result = await fetch(`/api/qr-moments/admin/${selectedEventSlug}/guest/${guestId}/uploads`, {
        method: "DELETE",
        headers: authHeader,
      }).then((response) => response.json());

      if (result.ok) {
        setOverview((previous) => {
          if (!previous) return previous;
          const removedIds = new Set(previous.uploads.filter((u) => u.guestId === guestId).map((u) => u.id));
          return {
            ...previous,
            uploads: previous.uploads.filter((upload) => !removedIds.has(upload.id)),
            comments: previous.comments.filter((comment) => !removedIds.has(comment.uploadId)),
            guests: previous.guests.map((guest) => guest.id === guestId ? { ...guest, uploadIds: [] } : guest),
          };
        });
      } else {
        setError(result.error ?? "Nu s-au putut șterge upload-urile invitatului.");
      }
    } catch {
      setError("Nu s-au putut șterge upload-urile invitatului.");
    } finally {
      setBusyGuestId(null);
    }
  };

  const handleDeleteEvent = async (eventSlug: string) => {
    setDeletingEvent(true);
    try {
      const result = await fetch(`/api/qr-moments/admin/${eventSlug}`, {
        method: 'DELETE',
        headers: authHeader,
      }).then((response) => response.json());

      if (result.ok) {
        const remaining = events.filter((event) => event.eventSlug !== eventSlug);
        setEvents(remaining);
        if (selectedEventSlug === eventSlug) {
          setSelectedEventSlug(remaining[0]?.eventSlug ?? '');
          setOverview(null);
        }
      } else {
        setError(result.error ?? 'Nu s-a putut șterge evenimentul.');
      }
    } catch {
      setError('Nu s-a putut șterge evenimentul.');
    } finally {
      setDeletingEvent(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setBusyCommentId(commentId);
    try {
      const result = await fetch(`/api/qr-moments/admin/comment/${commentId}`, {
        method: "DELETE",
        headers: authHeader,
      }).then((response) => response.json());

      if (result.ok) {
        setOverview((previous) => previous ? {
          ...previous,
          comments: previous.comments.filter((comment) => comment.id !== commentId),
        } : previous);
      }
    } finally {
      setBusyCommentId(null);
    }
  };

  const selectedEvent = events.find((event) => event.eventSlug === selectedEventSlug) ?? null;
  const editorInitialValues: QREventFormValues = editorMode === "edit" && selectedEvent
    ? {
        adminEventId: selectedEvent.adminEventId ?? "",
        bride: selectedEvent.bride ?? "",
        groom: selectedEvent.groom ?? "",
        eventType: normalizeQrEventType(selectedEvent.eventType),
        notificationEmail: selectedEvent.notificationEmail ?? "",
        eventDate: selectedEvent.eventDate.slice(0, 10),
        pin: selectedEvent.pin ?? "",
      }
    : {
        adminEventId: "",
        bride: "",
        groom: "",
        eventType: "nunta",
        notificationEmail: "",
        eventDate: "",
        pin: "",
      };

  if (loadingEvents) return <AncaLoader />;

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-10">
      {editorMode && (
        <EventEditorModal
          mode={editorMode}
          initialValues={editorInitialValues}
          saving={editorSaving}
          error={editorError}
          adminEvents={adminEvents}
          onClose={() => { setEditorMode(null); setEditorError(null); }}
          onSubmit={editorMode === "create" ? handleCreateEvent : handleEditEvent}
        />
      )}

      {deleteUploadConfirmation && (
        <ConfirmModal
          title="Ștergi upload-ul?"
          message={`Fișierul "${deleteUploadConfirmation.originalName}" va fi șters din Bunny și din Firestore, împreună cu comentariile lui.`}
          confirmLabel="Șterge"
          variant="danger"
          onCancel={() => setDeleteUploadConfirmation(null)}
          onConfirm={() => {
            handleDeleteUpload(deleteUploadConfirmation.id).catch(() => {});
            setDeleteUploadConfirmation(null);
          }}
        />
      )}

      {deleteGuestUploadsConfirmation && (
        <ConfirmModal
          title="Ștergi tot ce a încărcat invitatul?"
          message={`Toate upload-urile lui ${deleteGuestUploadsConfirmation.name || deleteGuestUploadsConfirmation.email || "acest invitat"} vor fi șterse din Bunny și din Firestore, împreună cu comentariile lor. Invitatul rămâne înregistrat. Această acțiune nu poate fi anulată.`}
          confirmLabel="Șterge tot"
          variant="danger"
          onCancel={() => setDeleteGuestUploadsConfirmation(null)}
          onConfirm={() => {
            handleDeleteGuestUploads(deleteGuestUploadsConfirmation.id).catch(() => {});
            setDeleteGuestUploadsConfirmation(null);
          }}
        />
      )}

      {pinResetConfirmation && (
        <ConfirmModal
          title="Resetezi PIN-ul?"
          message="PIN-ul curent va deveni invalid. QR code-urile deja tipărite sau distribuite nu vor mai funcționa. Ești sigur?"
          confirmLabel="Resetează PIN"
          variant="danger"
          onCancel={() => setPinResetConfirmation(false)}
          onConfirm={() => {
            setPinResetConfirmation(false);
            handleResetPin().catch(() => {});
          }}
        />
      )}

      {deleteEventConfirmation && (
        <ConfirmModal
          title="Ștergi evenimentul QR?"
          message={`Evenimentul "${getCoupleLabel(deleteEventConfirmation)}" (${deleteEventConfirmation.eventSlug}) va fi șters definitiv, împreună cu toate upload-urile, invitații și comentariile asociate. Această acțiune nu poate fi anulată.`}
          confirmLabel="Șterge definitiv"
          variant="danger"
          onCancel={() => setDeleteEventConfirmation(null)}
          onConfirm={() => {
            const target = deleteEventConfirmation;
            setDeleteEventConfirmation(null);
            handleDeleteEvent(target.eventSlug).catch(() => {});
          }}
        />
      )}

      {deleteCommentConfirmation && (
        <ConfirmModal
          title="Ștergi comentariul?"
          message="Comentariul va fi șters definitiv din Firestore."
          confirmLabel="Șterge"
          variant="danger"
          onCancel={() => setDeleteCommentConfirmation(null)}
          onConfirm={() => {
            handleDeleteComment(deleteCommentConfirmation.id).catch(() => {});
            setDeleteCommentConfirmation(null);
          }}
        />
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        <Breadcrumb />

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-white text-2xl font-light tracking-tight">QR Moments Admin</h1>
            <p className="text-neutral-500 text-sm mt-1">Evenimente, upload-uri, invitați și comentarii.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditorError(null); setEditorMode("create"); }}
              className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm hover:bg-emerald-500/30 hover:text-emerald-300 transition-colors"
            >
              Eveniment QR nou
            </button>
            <button
              onClick={() => loadEvents()}
              className="px-3 py-2 rounded-lg border border-neutral-800 text-neutral-400 text-sm hover:border-neutral-600 hover:text-white transition-colors"
            >
              Reîncarcă lista
            </button>
            <button
              onClick={() => loadEmailDirectory()}
              disabled={loadingEmailDirectory}
              className="px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 text-sm hover:border-emerald-400/50 hover:text-emerald-300 disabled:opacity-50 transition-colors"
            >
              {loadingEmailDirectory ? "Se încarcă emailurile..." : "Emailuri participanți"}
            </button>
            <button
              onClick={() => selectedEventSlug && loadOverview(selectedEventSlug)}
              disabled={!selectedEventSlug || loadingOverview}
              className="px-3 py-2 rounded-lg border border-neutral-800 text-neutral-400 text-sm hover:border-neutral-600 hover:text-white disabled:opacity-50 transition-colors"
            >
              Reîncarcă detalii
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {showEmailDirectory && (
          <section className="rounded-2xl border border-emerald-500/20 bg-neutral-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-white text-lg font-light">Emailuri QR Moments</h2>
                <p className="text-neutral-500 text-xs mt-1">Participanții sunt grupați pe eveniment. Sunt incluse și emailurile care s-au dezabonat, marcate separat.</p>
              </div>
              <button onClick={() => setShowEmailDirectory(false)} className="text-neutral-500 hover:text-white text-sm">Închide</button>
            </div>

            {emailGroups.length === 0 ? (
              <p className="text-neutral-500 text-sm">Nu există încă emailuri colectate.</p>
            ) : (
              <div className="space-y-3">
                {emailGroups.map((group) => (
                  <details key={group.eventSlug} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4" open>
                    <summary className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="text-white text-sm font-medium">{group.coupleLabel}</span>
                        <span className="block text-neutral-600 text-[11px] font-mono mt-1">{group.eventSlug}</span>
                      </span>
                      <span className="text-emerald-400 text-xs">{group.guests.length} email{group.guests.length !== 1 ? "uri" : ""}</span>
                    </summary>
                    <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                      <div className="space-y-2 pb-2">
                        <p className="text-neutral-500 text-xs">Descarcă materialele acestui eveniment:</p>
                        <QRMaterialDownloadButtons
                          onDownload={(type) => downloadQrMaterials(group.eventSlug, type)}
                          downloading={downloadingMaterials?.eventSlug === group.eventSlug ? downloadingMaterials.type : null}
                        />
                      </div>
                      {group.notificationEmail && (
                        <p className="text-neutral-500 text-xs">Email notificări eveniment: <span className="text-neutral-300">{group.notificationEmail}</span></p>
                      )}
                      {group.guests.length === 0 ? (
                        <p className="text-neutral-600 text-xs">Niciun participant cu email.</p>
                      ) : group.guests.map((guest) => (
                        <div key={guest.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-950 px-3 py-2">
                          <div>
                            <p className="text-neutral-200 text-sm">{guest.email}</p>
                            <p className="text-neutral-600 text-xs">{guest.name} · {guest.uploadCount} upload-uri</p>
                          </div>
                          <span className={`text-[11px] ${guest.emailConsent ? "text-emerald-400" : "text-neutral-500"}`}>
                            {guest.emailConsent ? "consimțit" : "dezabonat"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        )}

        {events.length === 0 ? (
          <div className="rounded-2xl border border-neutral-900 bg-neutral-950 py-20 text-center">
            <p className="text-neutral-500 text-sm">Nu există încă evenimente QR Moments.</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {events.map((event) => {
                const isActive = event.eventSlug === selectedEventSlug;
                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEventSlug(event.eventSlug)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                      isActive
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-neutral-900 bg-neutral-950 hover:border-neutral-700"
                    }`}
                  >
                    <p className="text-white text-sm font-medium">{getCoupleLabel(event)}</p>
                    <p className="text-neutral-500 text-xs mt-1 font-mono">{event.eventSlug}</p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{formatDate(event.eventDate)}</span>
                      <span className="text-amber-400 font-mono">{event.pin ?? "fără PIN"}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              {selectedEvent && (
                <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-white text-xl font-light">{getCoupleLabel(selectedEvent)}</h2>
                      <p className="text-neutral-500 text-xs mt-1 font-mono">{selectedEvent.eventSlug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setEditorError(null); setEditorMode("edit"); }}
                        className="px-3 py-2 rounded-lg border border-neutral-800 text-neutral-400 text-xs hover:border-neutral-600 hover:text-white transition-colors"
                      >
                        Editează evenimentul
                      </button>
                      <a
                        href={`/qr-moments/${selectedEvent.eventSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg border border-neutral-800 text-neutral-400 text-xs hover:border-neutral-600 hover:text-white transition-colors"
                      >
                        Deschide upload
                      </a>
                      <a
                        href={`/qr-moments/${selectedEvent.eventSlug}/gallery`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg border border-neutral-800 text-neutral-400 text-xs hover:border-neutral-600 hover:text-white transition-colors"
                      >
                        Deschide galerie
                      </a>
                      <button
                        onClick={() => setPinResetConfirmation(true)}
                        disabled={pinResetLoading}
                        className="px-3 py-2 rounded-lg bg-amber-500 text-black text-xs font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
                      >
                        {pinResetLoading ? "Se resetează..." : "Reset PIN"}
                      </button>
                      <button
                        onClick={() => setDeleteEventConfirmation(selectedEvent)}
                        disabled={deletingEvent}
                        className="px-3 py-2 rounded-lg border border-red-500/20 text-red-400 text-xs hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 transition-colors"
                      >
                        Șterge evenimentul
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-neutral-900 p-4">
                      <p className="text-neutral-500 text-xs">Data eveniment</p>
                      <p className="text-white text-sm mt-1">{formatDate(selectedEvent.eventDate)}</p>
                    </div>
                    <div className="rounded-xl bg-neutral-900 p-4">
                      <p className="text-neutral-500 text-xs">PIN curent</p>
                      <p className="text-amber-400 text-sm mt-1 font-mono">{overview?.event.pin ?? selectedEvent.pin ?? "—"}</p>
                    </div>
                    <div className="rounded-xl bg-neutral-900 p-4">
                      <p className="text-neutral-500 text-xs">Invitați</p>
                      <p className="text-white text-sm mt-1">{overview?.guests.length ?? 0}</p>
                    </div>
                    <div className="rounded-xl bg-neutral-900 p-4">
                      <p className="text-neutral-500 text-xs">Upload-uri</p>
                      <p className="text-white text-sm mt-1">{overview?.uploads.length ?? 0}</p>
                    </div>
                  </div>

                  {(overview?.event.pin ?? selectedEvent.pin) && (
                    <>
                      <QRLinkRow
                        eventSlug={selectedEvent.eventSlug}
                        pin={overview?.event.pin ?? selectedEvent.pin ?? ""}
                        eventType={normalizeQrEventType(overview?.event.eventType ?? selectedEvent.eventType)}
                      />
                    </>
                  )}
                  <div className="mt-4 rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
                    <p className="text-neutral-500 text-xs uppercase tracking-wide">Descarcă materialele evenimentului</p>
                    <QRMaterialDownloadButtons
                      onDownload={(type) => downloadQrMaterials(selectedEvent.eventSlug, type)}
                      downloading={downloadingMaterials?.eventSlug === selectedEvent.eventSlug ? downloadingMaterials.type : null}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {(["uploads", "guests", "comments"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === tab ? "bg-neutral-800 text-white" : "border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
                    }`}
                  >
                    {tab === "uploads" ? "Upload-uri" : tab === "guests" ? "Invitați" : "Comentarii"}
                  </button>
                ))}
              </div>

              {loadingOverview ? (
                <div className="rounded-2xl border border-neutral-900 bg-neutral-950 py-20">
                  <AncaLoader />
                </div>
              ) : !overview ? (
                <div className="rounded-2xl border border-neutral-900 bg-neutral-950 py-20 text-center">
                  <p className="text-neutral-500 text-sm">Selectează un eveniment pentru detalii.</p>
                </div>
              ) : activeTab === "uploads" ? (
                <div className="space-y-3">
                  {overview.uploads.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-900 bg-neutral-950 py-16 text-center">
                      <p className="text-neutral-500 text-sm">Niciun upload pentru acest eveniment.</p>
                    </div>
                  ) : overview.uploads.map((upload) => (
                    <div key={upload.id} className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
                      <div className="flex gap-4">
                        <MediaPreview upload={upload} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-white text-sm font-medium truncate">{upload.originalName}</p>
                            <span className="rounded-full bg-neutral-900 px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-400">{upload.type}</span>
                          </div>
                          <p className="text-neutral-500 text-xs mt-1">{upload.guestName} · {formatDate(upload.createdAt)}</p>
                          <p className="text-neutral-600 text-xs mt-1 font-mono break-all">{upload.mimeType}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              href={upload.bunnyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 text-xs hover:border-neutral-600 hover:text-white transition-colors"
                            >
                              Deschide fișier
                            </a>
                            <a
                              href={upload.bunnyUrl}
                              download={upload.originalName}
                              className="px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 text-xs hover:border-neutral-600 hover:text-white transition-colors"
                            >
                              Descarcă
                            </a>
                            <button
                              onClick={() => setDeleteUploadConfirmation(upload)}
                              disabled={busyUploadId === upload.id}
                              className="px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-xs hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 transition-colors"
                            >
                              {busyUploadId === upload.id ? "Se șterge..." : "Șterge upload"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeTab === "guests" ? (
                <div className="space-y-3">
                  {overview.guests.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-900 bg-neutral-950 py-16 text-center">
                      <p className="text-neutral-500 text-sm">Niciun invitat înregistrat pentru acest eveniment.</p>
                    </div>
                  ) : overview.guests.map((guest) => {
                    const guestUploadCount = overview.uploads.filter((upload) => upload.guestId === guest.id).length;
                    return (
                    <div key={guest.id} className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-white text-sm font-medium">{guest.name}</p>
                          <p className="text-neutral-500 text-xs mt-1">{guest.email}</p>
                          <p className="text-neutral-600 text-xs mt-1">Înregistrat: {formatDate(guest.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white text-sm">{guest.uploadIds.length} upload-uri</p>
                          <p className={`text-xs mt-1 ${guest.emailConsent ? "text-emerald-400" : "text-neutral-500"}`}>
                            {guest.emailConsent ? "Primește emailuri" : "Dezabonat"}
                          </p>
                        </div>
                      </div>
                      {guestUploadCount > 0 && (
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => setDeleteGuestUploadsConfirmation(guest)}
                            disabled={busyGuestId === guest.id}
                            className="px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-xs hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 transition-colors"
                          >
                            {busyGuestId === guest.id ? "Se șterge..." : `Șterge toate cele ${guestUploadCount} upload-uri`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.comments.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-900 bg-neutral-950 py-16 text-center">
                      <p className="text-neutral-500 text-sm">Niciun comentariu pentru acest eveniment.</p>
                    </div>
                  ) : overview.comments.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-white text-sm font-medium">{comment.guestName}</p>
                            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                              {comment.fromHost ? "de la gazde" : "alt tip"}
                            </span>
                          </div>
                          <p className="text-neutral-500 text-xs mt-1">{comment.uploadOriginalName ?? "upload necunoscut"} · {formatDate(comment.createdAt)}</p>
                          <p className="text-neutral-300 text-sm mt-3 leading-relaxed">{comment.text}</p>
                        </div>
                        <button
                          onClick={() => setDeleteCommentConfirmation(comment)}
                          disabled={busyCommentId === comment.id}
                          className="px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-xs hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 transition-colors"
                        >
                          {busyCommentId === comment.id ? "Se șterge..." : "Șterge"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
