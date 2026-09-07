import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { ClientEvent, EventDelivery, EventExpense, EventStatus } from "../types";
import Redacted from "./Redacted";
import EventStatusBadge from "./EventStatusBadge";
import FileDropZone from "./FileDropZone";
import MultiFileDropZone from "./MultiFileDropZone";
import PhotoboothUploader from "./PhotoboothUploader";
import ConfirmModal from "./ConfirmModal";
import { slugify } from "../../../utils/slugify";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import useAuth from "../auth/useAuth";

interface EventCardProps {
  event: ClientEvent;
  initialCollapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  onUpdated?: (updated: Partial<ClientEvent>) => void;
  onDeleted?: () => void;
  exchangeRate?: number;
}

const STATUS_OPTIONS: EventStatus[] = ["lead", "tentativ", "confirmat", "finalizat", "anulat"];

const DELIVERY_STEPS: { key: keyof EventDelivery; label: string }[] = [
  { key: "photoSessionEdited", label: "Ședință foto editată" },
  { key: "allPhotosEdited", label: "Toate pozele editate" },
  { key: "shortVideoEdited", label: "Video scurt editat" },
  { key: "longVideoEdited", label: "Video lung editat" },
  { key: "albumDelivered", label: "Albumul dat" },
  { key: "albumCreated", label: "Album creat" },
  { key: "albumSentToClient", label: "Album trimis clientului" },
  { key: "physicalDelivery", label: "Livrare fizică" },
];

const inputClass =
  "w-full bg-neutral-800 text-white text-sm placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-neutral-500 transition-colors";
const labelClass = "block text-neutral-400 text-xs font-medium mb-1 uppercase tracking-wide";

const formatEUR = (amount: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);

const formatRON = (amount: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(amount);

const EventCard: React.FC<EventCardProps> = ({ event, initialCollapsed = false, onCollapseChange, onUpdated, onDeleted, exchangeRate }) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const rate = exchangeRate && exchangeRate > 0 ? exchangeRate : null;
  const ronOf = (eur: number) => rate ? formatRON(Math.round(eur * rate)) : null;
  const eurOf = (ron: number) => rate ? formatEUR(Math.round((ron / rate) * 100) / 100) : null;
  const hasEventData = Boolean(event?.client);
  const fallbackDate = event?.eventDate ? new Date(event.eventDate) : null;
  const fallbackName = event?.client?.fullName ?? "";

  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [editing, setEditing] = useState(false);
  useBodyScrollLock(editing);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"first" | "confirm" | null>(null);
  const [contractUrl, setContractUrl] = useState(event.contractUrl ?? "");
  const [invoiceUrl, setInvoiceUrl] = useState(event.invoiceUrl ?? "");
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>(event.attachmentUrls ?? []);
  const [templateUrls, setTemplateUrls] = useState<string[]>(event.templateUrls ?? []);
  const [albumSlug, setAlbumSlug] = useState(event.albumSlug ?? "");
  const [albumPin, setAlbumPin] = useState(event.albumPin ?? "");
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [albumCreating, setAlbumCreating] = useState(false);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [folderCreating, setFolderCreating] = useState(false);
  const [folderResult, setFolderResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<EventExpense[]>(event.expenses ?? []);
  const [newExpenseLabel, setNewExpenseLabel] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<EventDelivery>(event.delivery ?? {});
  const [albumNotFoundInBunny, setAlbumNotFoundInBunny] = useState(false);
  const [photoboothGuests, setPhotoboothGuests] = useState<{ id: string; name: string; email: string | null; phone: string | null; notified: boolean }[]>([]);
  const [photoboothGuestCount, setPhotoboothGuestCount] = useState<number | null>(null);
  const [photoboothNotifying, setPhotoboothNotifying] = useState(false);
  const [photoboothNotifyResult, setPhotoboothNotifyResult] = useState<string | null>(null);
  const [photoboothQrDownloading, setPhotoboothQrDownloading] = useState(false);
  const [photoboothGalleryCreating, setPhotoboothGalleryCreating] = useState(false);
  const [showPhotoboothUploader, setShowPhotoboothUploader] = useState(false);
  const [photoboothGalleryError, setPhotoboothGalleryError] = useState<string | null>(null);

  const eventDate = fallbackDate;
  const effectiveEventDate = event.eventEndDate ? new Date(event.eventEndDate) : eventDate;
  const isPast = effectiveEventDate
    ? new Date(new Date(effectiveEventDate).setHours(23, 59, 59, 999)) < new Date()
    : false;
  const isLead = event.status === "lead" || event.status === "tentativ";
  const isFiscalized = event.fiscalized === true;
  const postEventBackupConfirmedAt = event.postEventBackupConfirmedAt ? new Date(event.postEventBackupConfirmedAt) : null;
  const backupPending = !isLead && event.status !== "anulat" && isPast && !postEventBackupConfirmedAt;
  const backupPageUrl = event.postEventBackupConfirmationToken
    ? `/backup/${event.id}?token=${encodeURIComponent(event.postEventBackupConfirmationToken)}`
    : null;

  const dateSlug = eventDate ? eventDate.toISOString().slice(0, 10) : "no-date";
  const nameSlug = slugify(fallbackName);
  const docBasePath = (type: "contract" | "factura") =>
    `admin-docs/${event.id}/${nameSlug}_${dateSlug}_${type}`;

  const displayStatus: typeof event.status =
    !isLead && isPast && event.status === "confirmat" ? "finalizat" : event.status;

  const formattedDate = eventDate
    ? eventDate.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
    : "Dată nespecificată";

  const eventEndDate = event.eventEndDate ? new Date(event.eventEndDate) : null;
  const formattedEndDate = eventEndDate
    ? eventEndDate.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const [form, setForm] = useState({
    fullName: fallbackName,
    phone: event?.client?.phone ?? "",
    email: event?.client?.email ?? "",
    eventDate: eventDate ? eventDate.toISOString().slice(0, 10) : "",
    eventEndDate: eventEndDate ? eventEndDate.toISOString().slice(0, 10) : "",
    typeLabel: event.typeLabel ?? "",
    total: String(event?.pricing?.total ?? 0),
    advanceAmount: String(event?.pricing?.advanceAmount ?? 0),
    advancePaid: event?.pricing?.advancePaid ?? false,
    fiscalized: isFiscalized,
    status: event.status,
    notes: event.notes ?? "",
  });

  const suggestedSlug = eventDate
    ? `${eventDate.getDate()}${eventDate.toLocaleString("ro-RO", { month: "long" }).toLowerCase().replace(/\s+/g, "")}${eventDate.getFullYear()}`
    : "";

  // Fetch subscriber count when album section becomes visible
  useEffect(() => {
    if (!albumSlug || collapsed) return;
    fetch(`/api/album-subscriptions/count/${encodeURIComponent(albumSlug)}`, {
      headers: { Authorization: `Bearer ${auth.auth.accessToken}` },
    })
      .then((response) => response.json())
      .then((data: { count?: number }) => { if (typeof data.count === "number") setSubscriberCount(data.count); })
      .catch(() => {});
  }, [albumSlug, collapsed]);

  const handleNotifySubscribers = async (event_: React.MouseEvent) => {
    event_.stopPropagation();
    if (!albumSlug) return;
    setNotifying(true);
    setNotifyResult(null);
    try {
      const response = await fetch(`/api/album-subscriptions/notify/${encodeURIComponent(albumSlug)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.auth.accessToken}` },
      });
      const data = (await response.json()) as { sent?: number; error?: string };
      setNotifyResult(data.error ? `Eroare: ${data.error}` : `Notificat ${data.sent ?? 0} abonat(i)`);
      setTimeout(() => setNotifyResult(null), 4000);
    } catch {
      setNotifyResult("Eroare la trimitere.");
      setTimeout(() => setNotifyResult(null), 3000);
    } finally {
      setNotifying(false);
    }
  };

  // Fetch photobooth guest count when card is expanded and event is not a lead
  useEffect(() => {
    if (isLead || collapsed) return;
    fetch(`/api/photobooth/${event.id}/guests`, {
      headers: { Authorization: `Bearer ${auth.auth.accessToken}` },
    })
      .then((response) => response.json())
      .then((data: { guests?: { id: string; name: string; email: string | null; phone: string | null; notified: boolean }[] }) => {
        if (Array.isArray(data.guests)) {
          setPhotoboothGuests(data.guests);
          setPhotoboothGuestCount(data.guests.length);
        }
      })
      .catch(() => {});
  }, [event.id, collapsed, isLead]);

  const handlePhotoboothDownloadQr = async (clickEvent: React.MouseEvent) => {
    clickEvent.stopPropagation();
    setPhotoboothQrDownloading(true);
    try {
      const response = await fetch(`/api/photobooth/${event.id}/qr`, {
        headers: { Authorization: `Bearer ${auth.auth.accessToken}` },
      });
      if (!response.ok) throw new Error("Eroare la generarea QR.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `photobooth-qr-${event.id}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setPhotoboothQrDownloading(false);
    }
  };

  const handlePhotoboothNotify = async (clickEvent: React.MouseEvent) => {
    clickEvent.stopPropagation();
    if (!albumSlug) return;
    setPhotoboothNotifying(true);
    setPhotoboothNotifyResult(null);
    try {
      const response = await fetch(`/api/photobooth/${event.id}/notify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.auth.accessToken}` },
      });
      const data = (await response.json()) as { sent?: number; emailsSent?: number; smsSent?: number; errors?: number; error?: string; message?: string };
      if (data.error) {
        setPhotoboothNotifyResult(`Eroare: ${data.error}`);
      } else if (data.message) {
        setPhotoboothNotifyResult(data.message);
      } else {
        setPhotoboothNotifyResult(`Trimis: ${data.sent ?? 0} (${data.emailsSent ?? 0} email, ${data.smsSent ?? 0} SMS)`);
        setPhotoboothGuests((prev) => prev.map((guest) => ({ ...guest, notified: true })));
      }
      setTimeout(() => setPhotoboothNotifyResult(null), 5000);
    } catch {
      setPhotoboothNotifyResult("Eroare la notificare.");
      setTimeout(() => setPhotoboothNotifyResult(null), 3000);
    } finally {
      setPhotoboothNotifying(false);
    }
  };

  const handleCreatePhotoboothGallery = async (clickEvent: React.MouseEvent) => {
    clickEvent.stopPropagation();
    if (showPhotoboothUploader) { setShowPhotoboothUploader(false); return; }
    setPhotoboothGalleryCreating(true);
    setPhotoboothGalleryError(null);
    try {
      const response = await fetch(`/api/admin/events/${event.id}/photobooth-folder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.auth.accessToken}` },
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setPhotoboothGalleryError(data.error ?? "Eroare la crearea galeriei.");
        return;
      }
      setShowPhotoboothUploader(true);
    } catch {
      setPhotoboothGalleryError("Eroare de rețea.");
    } finally {
      setPhotoboothGalleryCreating(false);
    }
  };

  const toggleDelivery = async (key: keyof EventDelivery) => {
    const updated = { ...delivery, [key]: !delivery[key] };
    setDelivery(updated);
    onUpdated?.({ delivery: updated });
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery: updated }),
    });
  };

  // Auto-detect album in Bunny when card is expanded and no albumSlug is set yet
  useEffect(() => {
    if (!hasEventData || collapsed || albumSlug || !suggestedSlug || isLead) return;
    let cancelled = false;
    fetch(`/api/admin/events/${event.id}/detect-album`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: suggestedSlug }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.found && data.slug) {
          setAlbumSlug(data.slug);
          onUpdated?.({ albumSlug: data.slug });
        } else {
          setAlbumNotFoundInBunny(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasEventData, collapsed, albumSlug, suggestedSlug, isLead, event.id, onUpdated]);

  if (!hasEventData) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-neutral-500 text-sm italic">Lead fără date completate</p>
          {fallbackDate && (
            <p className="text-neutral-600 text-xs mt-0.5">
              {fallbackDate.toLocaleDateString("ro-RO", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        <EventStatusBadge status={event.status} />
      </div>
    );
  }

  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const saveDocUrl = async (field: "contractUrl" | "invoiceUrl", url: string) => {
    if (field === "contractUrl") setContractUrl(url);
    else setInvoiceUrl(url);
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: url }),
    });
  };

  const saveAttachments = async (urls: string[]) => {
    setAttachmentUrls(urls);
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentUrls: urls }),
    });
  };

  const handleCreateAlbum = async (slug: string, pin: string) => {
    setAlbumCreating(true);
    setAlbumError(null);
    const res = await fetch(`/api/admin/events/${event.id}/create-album`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, pin }),
    });
    const data = await res.json();
    if (!res.ok) { setAlbumError(data.error); setAlbumCreating(false); return; }
    setAlbumSlug(slug);
    setAlbumPin(pin);
    setShowAlbumModal(false);
    setAlbumCreating(false);
    onUpdated?.({ albumSlug: slug, albumPin: pin });
  };

  const handleCreateFolders = async () => {
    const targetSlug = albumSlug || suggestedSlug;
    if (!targetSlug || folderCreating) return;
    setFolderCreating(true);
    setFolderResult(null);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/create-album`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: targetSlug, pin: albumPin }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setFolderResult({ ok: true, msg: "Folderele există deja în Bunny." });
      } else if (!res.ok) {
        setFolderResult({ ok: false, msg: data.error ?? "Eroare la creare folder." });
      } else {
        if (!albumSlug) {
          setAlbumSlug(targetSlug);
          onUpdated?.({ albumSlug: targetSlug });
        }
        setFolderResult({ ok: true, msg: `Foldere create: ${targetSlug}` });
      }
    } catch {
      setFolderResult({ ok: false, msg: "Eroare de rețea." });
    } finally {
      setFolderCreating(false);
      setTimeout(() => setFolderResult(null), 5000);
    }
  };

  const handleProcessAlbum = async () => {
    if (!event.id || processing) return;
    setProcessing(true);
    setProcessLog(["Se conectează..."]);

    try {
      const res = await fetch(`/api/admin/events/${event.id}/process-album`, { method: "POST" });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (data.stage === "start") {
              setProcessLog((l) => [...l, `📂 ${data.total} poze găsite`]);
            } else if (data.stage === "previews") {
              if (data.current) setProcessLog((l) => [...l, `🖼 Preview: ${data.current} (${data.done}/${data.total})`]);
              else setProcessLog((l) => [...l, `🖼 ${data.message}`]);
            } else if (data.stage === "previews_complete") {
              setProcessLog((l) => [...l, `✅ Previews: ${data.done} generate, ${data.skipped} sărite`]);
            } else if (data.stage === "done") {
              setProcessLog((l) => [...l, "🎉 Procesare completă!"]);
            } else if (data.error) {
              setProcessLog((l) => [...l, `❌ Eroare: ${data.error}`]);
            } else if (data.warning) {
              setProcessLog((l) => [...l, `⚠️ ${data.warning}`]);
            }
          } catch {}
        }
      }
    } catch (err) {
      setProcessLog((l) => [...l, `❌ ${String(err)}`]);
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveAlbumPin = async (pin: string) => {
    setAlbumPin(pin);
    await fetch(`/api/admin/events/${event.id}/album`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumPin: pin }),
    });
    onUpdated?.({ albumPin: pin });
  };

  const saveTemplates = async (urls: string[]) => {
    setTemplateUrls(urls);
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateUrls: urls }),
    });
  };

  const persistExpenses = async (updated: EventExpense[]) => {
    setExpenses(updated);
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expenses: updated }),
    });
    onUpdated?.({ expenses: updated });
  };

  const addExpense = async () => {
    const amount = parseFloat(newExpenseAmount);
    if (!newExpenseLabel.trim() || !amount) return;
    setExpenseSaving(true);
    await persistExpenses([
      ...expenses,
      { id: crypto.randomUUID(), label: newExpenseLabel.trim(), amount },
    ]);
    setNewExpenseLabel("");
    setNewExpenseAmount("");
    setExpenseSaving(false);
  };

  const removeExpense = (id: string) =>
    persistExpenses(expenses.filter((expense) => expense.id !== id));

  const handleBackupConfirmed = async () => {
    if (backupSaving) return;
    setBackupSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/post-event-backup/confirm-admin`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      onUpdated?.({ postEventBackupConfirmedAt: new Date() });
    } catch {
      // user can retry
    } finally {
      setBackupSaving(false);
    }
  };

  const deleteDocUrl = async (field: "contractUrl" | "invoiceUrl") => {
    if (field === "contractUrl") setContractUrl("");
    else setInvoiceUrl("");
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: "" }),
    });
  };

  const quickStatus = async (newStatus: EventStatus) => {
    setQuickSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      onUpdated?.({ status: newStatus });
    } catch {
      // silently fail — user can retry
    } finally {
      setQuickSaving(false);
    }
  };

  const quickFiscalized = async (nextFiscalized: boolean) => {
    setQuickSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalized: nextFiscalized }),
      });
      if (!res.ok) throw new Error();
      onUpdated?.({ fiscalized: nextFiscalized });
    } catch {
      // silently fail — user can retry
    } finally {
      setQuickSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted?.();
    } catch {
      setDeleting(false);
    }
  };

  const handleArchive = async () => {
    setDeleteStep(null);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "anulat" }),
      });
      if (!res.ok) throw new Error();
      onUpdated?.({ status: "anulat" });
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    const total = parseFloat(form.total) || 0;
    const advanceAmount = parseFloat(form.advanceAmount) || 0;

    const payload: Record<string, unknown> = {
      "client.fullName": form.fullName,
      "client.phone": form.phone,
      "client.email": form.email,
      status: form.status,
      fiscalized: form.fiscalized,
      notes: form.notes,
      typeLabel: form.typeLabel || null,
      "pricing.total": total,
      "pricing.advanceAmount": advanceAmount,
      "pricing.advancePaid": form.advancePaid,
      "pricing.remainingAmount": total - advanceAmount,
    };

    if (form.eventDate) {
      payload.eventDate = form.eventDate;
    }
    if (form.eventEndDate) {
      payload.eventEndDate = form.eventEndDate;
    } else {
      payload.eventEndDate = null;
    }

    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Eroare la salvare.");
      onUpdated?.({
        client: { ...event.client, fullName: form.fullName, phone: form.phone, email: form.email },
        eventDate: form.eventDate ? new Date(form.eventDate) : null,
        eventEndDate: form.eventEndDate ? new Date(form.eventEndDate) : null,
        typeLabel: form.typeLabel || undefined,
        status: form.status as EventStatus,
        fiscalized: form.fiscalized,
        notes: form.notes,
        pricing: { total, advanceAmount, advancePaid: form.advancePaid, remainingAmount: total - advanceAmount },
      });
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Eroare necunoscută.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors">

        {/* Header row */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => { const next = !c; onCollapseChange?.(next); return next; })}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          {/* Mobile header */}
          <div className="flex sm:hidden items-center justify-between gap-2 min-w-0 w-full">
            <div className="flex flex-col min-w-0">
              <span className="text-white text-sm font-medium truncate"><Redacted>{event.client.fullName}</Redacted></span>
              <span className={`text-xs mt-0.5 ${
                !eventDate ? "text-neutral-600 italic" :
                event.status === "confirmat" || event.status === "finalizat" ? "text-emerald-400" :
                event.status === "lead" || event.status === "tentativ" ? "text-amber-400" :
                "text-neutral-400"
              }`}>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isLead && (
                <Redacted><span className="text-neutral-300 text-xs font-medium">{formatEUR(event.pricing?.total ?? 0)}</span></Redacted>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`text-neutral-500 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Desktop header */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap min-w-0">
            {event.status !== "confirmat" && <EventStatusBadge status={displayStatus} />}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isFiscalized
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              <Redacted>{isFiscalized ? "Fiscalizat" : "NEF"}</Redacted>
            </span>
            {!isLead && event.status !== "anulat" && isPast && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  backupPending
                    ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                <Redacted>{backupPending ? "Backup pending" : "Backup OK"}</Redacted>
              </span>
            )}
            <span className="text-neutral-500 text-xs">•</span>
            <span className="text-white text-sm font-medium truncate"><Redacted>{event.client.fullName}</Redacted></span>
            <span className="text-neutral-500 text-xs">•</span>
            <span className={`text-xs ${event.type === "Nuntă" ? "text-emerald-400" : "text-neutral-500"}`}>{event.typeLabel || event.type}</span>
            <span className="text-neutral-500 text-xs">•</span>
            <span className={`text-xs ${
              !eventDate ? "text-neutral-600 italic" :
              event.status === "confirmat" || event.status === "finalizat" ? "text-emerald-400" :
              event.status === "lead" || event.status === "tentativ" ? "text-amber-400" :
              "text-neutral-400"
            }`}>
              {formattedDate}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            {!isLead && (
              <span className="text-right">
                <Redacted><span className="text-neutral-300 text-xs font-medium">{formatEUR(event.pricing?.total ?? 0)}</span></Redacted>
                {ronOf(event.pricing?.total ?? 0) && (
                  <span className="text-neutral-600 text-[10px] block leading-tight">≈ {ronOf(event.pricing?.total ?? 0)}</span>
                )}
              </span>
            )}
            {!isLead && (
              <div className="flex items-center gap-2">
                {(event.contractId || contractUrl || attachmentUrls.length > 0) ? (
                  <span title="Contract existent" className="text-xs text-emerald-400 font-medium">C✓</span>
                ) : (
                  <span title="Fără contract" className="text-xs text-neutral-600">C—</span>
                )}
                <span title={invoiceUrl ? "Factură încărcată" : "Factură lipsă"} className={`text-xs ${invoiceUrl ? "text-emerald-400" : "text-neutral-600"}`}>
                  {invoiceUrl ? "F✓" : "F—"}
                </span>
              </div>
            )}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={`text-neutral-500 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* Body */}
        {!collapsed && (
          <div className="px-4 pb-4 border-t border-neutral-800 pt-3 space-y-3">

            {/* Info row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-400">
              {eventDate && (
                <span className="flex items-center gap-1.5">
                  <span>📅</span>
                  {formattedDate}
                  {formattedEndDate && ` → ${formattedEndDate}`}
                </span>
              )}
              {event.type && (
                <span className="flex items-center gap-1.5">
                  <span>🎉</span>
                  {event.typeLabel || event.type}
                </span>
              )}
              <button
                type="button"
                onClick={() => quickFiscalized(!isFiscalized)}
                disabled={quickSaving}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                  isFiscalized
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
              >
                <span>{isFiscalized ? "🧾" : "🏠"}</span>
                <Redacted>{isFiscalized ? "Fiscalizat" : "NEF"}</Redacted>
              </button>
              {event.client.phone && (
                <span className="flex items-center gap-1.5">
                  <span>📞</span>
                  <Redacted>{event.client.phone}</Redacted>
                  <a
                    href={`tel:${event.client.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="px-2 py-0.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors"
                  >
                    Sună
                  </a>
                  <a
                    href={`https://wa.me/${event.client.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="px-2 py-0.5 rounded-md bg-green-700/60 hover:bg-green-600/70 text-xs transition-colors"
                  >
                    WhatsApp
                  </a>
                </span>
              )}
              {event.client.email && (
                <span className="flex items-center gap-1.5"><span>✉</span><Redacted>{event.client.email}</Redacted></span>
              )}
              {!isLead && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span>💶</span>
                    <span>
                      <Redacted>{formatEUR(event.pricing?.total ?? 0)}</Redacted>
                      {ronOf(event.pricing?.total ?? 0) && (
                        <span className="text-neutral-500 text-[10px] block leading-tight">≈ {ronOf(event.pricing?.total ?? 0)}</span>
                      )}
                    </span>
                  </span>
                  {event.status !== "anulat" && isPast && (
                    <span className={`flex items-center gap-1.5 ${backupPending ? "text-orange-300" : "text-emerald-300"}`}>
                      <span>{backupPending ? "🛟" : "✅"}</span>
                      {backupPending ? "Backup neconfirmat" : "Backup confirmat"}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span>{event.pricing?.advancePaid ? "✅" : "⏳"}</span>
                    <span>
                      {event.pricing?.advancePaid ? "Avans încasat" : "Avans neîncasat"}{" "}
                      <Redacted>({formatEUR(event.pricing?.advanceAmount ?? 0)}{ronOf(event.pricing?.advanceAmount ?? 0) ? ` · ≈ ${ronOf(event.pricing?.advanceAmount ?? 0)}` : ""})</Redacted>
                    </span>
                  </span>
                  {(event.pricing?.remainingAmount ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span>💳</span>
                      <span>
                        Rest: <Redacted>{formatEUR(event.pricing.remainingAmount)}</Redacted>
                        {ronOf(event.pricing.remainingAmount) && (
                          <span className="text-neutral-500 text-[10px] block leading-tight">≈ {ronOf(event.pricing.remainingAmount)}</span>
                        )}
                      </span>
                    </span>
                  )}
                </>
              )}
              {event.contractId ? (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/admin/contracts/${event.contractId}/edit`); }}
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>→ Vezi contract</span>
                </button>
              ) : !isLead && event.status !== "anulat" && !contractUrl && attachmentUrls.length === 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/admin/contracts/create", {
                      state: {
                        eventId: event.id,
                        eventType: event.type,
                        eventDate: eventDate ? eventDate.toISOString().slice(0, 10) : "",
                        clientEmail: event.client.email ?? "",
                      },
                    });
                  }}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Creează contract</span>
                </button>
              )}
              {event.handoverId ? (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate("/admin/handover"); }}
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>→ Vezi Proces Verbal</span>
                </button>
              ) : !isLead && event.status !== "anulat" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/admin/handover/new", {
                      state: {
                        eventId: event.id,
                        eventType: event.typeLabel ?? event.type,
                        eventDate: eventDate ? eventDate.toISOString().slice(0, 10) : "",
                        clientEmail: event.client.email ?? "",
                        clientFullName: event.client.fullName ?? "",
                      },
                    });
                  }}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Creează Proces Verbal</span>
                </button>
              )}
            </div>

            {event.notes && (
              <p className="text-amber-300/80 text-xs leading-relaxed border-t border-amber-500/20 pt-2 bg-amber-500/5 rounded-lg px-3 py-2">
                {event.notes}
              </p>
            )}

            {/* Quick actions for leads */}
            {isLead && (
              <div className="flex items-center gap-2 border-t border-neutral-800 pt-3">
                {event.status === "lead" && (
                  <button
                    onClick={() => quickStatus("tentativ")}
                    disabled={quickSaving}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors disabled:opacity-40"
                  >
                    Tentativ
                  </button>
                )}
                <button
                  onClick={() => quickStatus("confirmat")}
                  disabled={quickSaving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
                >
                  ✓ Confirmă
                </button>
                <button
                  onClick={() => quickStatus("anulat")}
                  disabled={quickSaving}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-40"
                >
                  ✗ Renunță
                </button>
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Modifică
                  </button>
                  <EventActionMenu
                    showBackupAction={backupPending}
                    backupSaving={backupSaving}
                    backupPageUrl={backupPageUrl}
                    onConfirmBackup={handleBackupConfirmed}
                    onEdit={() => setEditing(true)}
                    onArchive={handleArchive}
                    onDelete={onDeleted ? () => setDeleteStep("first") : undefined}
                    archiveDisabled={event.status === "anulat"}
                    deleteLabel={deleting ? "Se șterge..." : "Șterge definitiv"}
                  />
                </div>
              </div>
            )}

            {/* Documents (only for confirmed events) */}
            {!isLead && (contractUrl || invoiceUrl) && (
              <div className="flex gap-3 border-t border-neutral-800 pt-2">
                {contractUrl && (
                  <a href={contractUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    Contract
                  </a>
                )}
                {invoiceUrl && (
                  <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    Factură
                  </a>
                )}
              </div>
            )}

            {/* Photobooth template */}
            {templateUrls.length > 0 && (
              <div className="border-t border-neutral-800 pt-3 space-y-2">
                <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Template fotocabină</p>
                <div className="flex flex-col gap-1">
                  {templateUrls.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
                    >
                      ↓ Download Photobooth template{templateUrls.length > 1 ? ` ${i + 1}` : ""}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Album media */}
            {!isLead && (
              <div className="border-t border-neutral-800 pt-3">
                {albumSlug ? (
                  <div className="space-y-2">
                    <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Album media</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/media/${albumSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-violet-400 hover:text-violet-300 text-sm transition-colors"
                      >
                        → Vezi Galerie
                      </a>
                      {albumPin && (
                        <span className="text-neutral-400 text-xs">
                          PIN: <span className="font-mono text-white">{albumPin}</span>
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowAlbumModal(true); }}
                        className="text-xs text-neutral-500 hover:text-white transition-colors"
                      >
                        Editează PIN
                      </button>
                      <span className="text-neutral-700 text-xs font-mono">/media/{albumSlug}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleProcessAlbum(); }}
                        disabled={processing}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {processing ? (
                          <>
                            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                            Procesează...
                          </>
                        ) : "⚙️ Procesează album"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCreateFolders(); }}
                        disabled={folderCreating}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {folderCreating ? (
                          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>
                        )}
                        Creează folder Bunny
                      </button>
                      {import.meta.env.VITE_BUNNY_STORAGE_ZONE_ID && (
                        <a
                          href={`https://dash.bunny.net/storage/${import.meta.env.VITE_BUNNY_STORAGE_ZONE_ID}/file-manager?path=${albumSlug}&page=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          Compress în Bunny
                        </a>
                      )}
                      {folderResult && (
                        <span className={`text-xs ${folderResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                          {folderResult.msg}
                        </span>
                      )}
                    </div>

                    {/* Album subscribers */}
                    {subscriberCount !== null && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                          </svg>
                          <span className={subscriberCount > 0 ? "text-emerald-400 font-medium" : ""}>
                            {subscriberCount} abonat{subscriberCount !== 1 ? "i" : ""}
                          </span>
                        </span>
                        {subscriberCount > 0 && (
                          <button
                            onClick={handleNotifySubscribers}
                            disabled={notifying}
                            className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                          >
                            {notifying ? (
                              <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                            ) : (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.37 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.95-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/>
                              </svg>
                            )}
                            Notifică
                          </button>
                        )}
                        {notifyResult && (
                          <span className="text-xs text-emerald-400 animate-pulse">{notifyResult}</span>
                        )}
                      </div>
                    )}

                    {processLog.length > 0 && (
                      <div className="mt-2 bg-neutral-950 border border-neutral-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                        {processLog.map((line, i) => (
                          <p key={i} className="text-xs font-mono text-neutral-300 leading-5">{line}</p>
                        ))}
                      </div>
                    )}

                    {/* Photobooth guests */}
                    <div className="border-t border-neutral-800 pt-3 mt-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Fotocabină</p>
                        <button
                          onClick={handlePhotoboothDownloadQr}
                          disabled={photoboothQrDownloading}
                          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                        >
                          {photoboothQrDownloading ? (
                            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                              <path d="M14 14h.01M14 17h.01M17 14h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01M17 20h.01M14 20h.01"/>
                            </svg>
                          )}
                          QR Code
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400">
                          <span className={photoboothGuestCount !== null && photoboothGuestCount > 0 ? "text-amber-400 font-medium" : ""}>
                            {photoboothGuestCount ?? 0} guest{photoboothGuestCount !== 1 ? "i" : ""}
                          </span>
                          {photoboothGuestCount !== null && photoboothGuests.filter((guest) => !guest.notified).length > 0 && (
                            <span className="ml-1 text-neutral-600">
                              ({photoboothGuests.filter((guest) => !guest.notified).length} nenotificați)
                            </span>
                          )}
                        </span>
                        {photoboothGuestCount !== null && photoboothGuestCount > 0 && (
                          <button
                            onClick={handlePhotoboothNotify}
                            disabled={photoboothNotifying || !albumSlug}
                            className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                          >
                            {photoboothNotifying ? (
                              <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                            ) : (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.37 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.95-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/>
                              </svg>
                            )}
                            Notifică
                          </button>
                        )}
                        {photoboothNotifyResult && (
                          <span className="text-xs text-emerald-400">{photoboothNotifyResult}</span>
                        )}
                      </div>
                      {photoboothGuests.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                          {photoboothGuests.map((guest) => (
                            <div key={guest.id} className="flex items-center gap-2 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${guest.notified ? "bg-emerald-500" : "bg-neutral-600"}`} />
                              <span className="text-neutral-300 truncate">{guest.name}</span>
                              <span className="text-neutral-600 truncate">{guest.email ?? guest.phone}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Photobooth gallery — creare folder Bunny + upload drag & drop */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={handleCreatePhotoboothGallery}
                          disabled={photoboothGalleryCreating}
                          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-800 hover:border-emerald-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                        >
                          {photoboothGalleryCreating ? (
                            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                          )}
                          {showPhotoboothUploader ? "Ascunde upload" : "Crează Galerie Photobooth"}
                        </button>
                        <a
                          href={`/fotocabina/${albumSlug}/galerie`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          → Galerie fotocabină
                        </a>
                        {photoboothGalleryError && (
                          <span className="text-xs text-red-400">{photoboothGalleryError}</span>
                        )}
                      </div>

                      {showPhotoboothUploader && (
                        <PhotoboothUploader
                          eventId={event.id}
                          accessToken={auth.auth.accessToken}
                          galleryUrl={`/fotocabina/${albumSlug}/galerie`}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {albumNotFoundInBunny && suggestedSlug && !folderResult && (
                      <span className="w-full text-xs text-amber-400/80 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-1.5">
                        Folderul <span className="font-mono text-amber-300">{suggestedSlug}</span> nu există în Bunny — creează-l mai jos.
                      </span>
                    )}
                    {suggestedSlug && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCreateFolders(); }}
                        disabled={folderCreating}
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-800 hover:border-emerald-600 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {folderCreating ? (
                          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>
                        )}
                        Creează folder {suggestedSlug}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAlbumModal(true); }}
                      className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                      Slug custom
                    </button>
                    {folderResult && (
                      <span className={`text-xs ${folderResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                        {folderResult.msg}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Deadline livrare */}
            {isPast && !isLead && (() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const eventDateMs = eventDate ? new Date(new Date(eventDate).setHours(0, 0, 0, 0)).getTime() : null;
              if (!eventDateMs) return null;
              const daysElapsed = Math.floor((today.getTime() - eventDateMs) / 86400000);
              const PHOTO_DAYS = 30;
              const VIDEO_DAYS = 60;
              const photoDone = delivery.allPhotosEdited === true;
              const videoDone = delivery.longVideoEdited === true;

              const photoRemaining = PHOTO_DAYS - daysElapsed;
              const videoRemaining = VIDEO_DAYS - daysElapsed;
              const photoProgress = Math.min(daysElapsed / PHOTO_DAYS, 1);
              const videoProgress = Math.min(daysElapsed / VIDEO_DAYS, 1);

              const barColor = (progress: number, done: boolean) => {
                if (done) return "bg-emerald-500";
                if (progress >= 1) return "bg-red-500";
                if (progress >= 0.8) return "bg-orange-500";
                if (progress >= 0.5) return "bg-amber-500";
                return "bg-emerald-500";
              };

              const labelColor = (remaining: number, done: boolean) => {
                if (done) return "text-emerald-400";
                if (remaining < 0) return "text-red-400";
                if (remaining <= 6) return "text-orange-400";
                if (remaining <= 15) return "text-amber-400";
                return "text-neutral-400";
              };

              const deadlineLabel = (remaining: number, done: boolean, label: string) => {
                if (done) return <span className="text-emerald-400">✓ {label} livrat</span>;
                if (remaining < 0) return <span className="text-red-400">Depășit cu {Math.abs(remaining)} zile</span>;
                if (remaining === 0) return <span className="text-orange-400">Azi — ultima zi!</span>;
                return <span className={labelColor(remaining, done)}>{remaining} zile rămase</span>;
              };

              if (photoDone && videoDone) return null;

              return (
                <div className="border-t border-neutral-800 pt-3 space-y-2.5">
                  <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Deadline livrare</p>

                  {!photoDone && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">📷 Foto <span className="text-neutral-600 font-mono">{PHOTO_DAYS}z</span></span>
                        {deadlineLabel(photoRemaining, photoDone, "foto")}
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(photoProgress, photoDone)}`}
                          style={{ width: `${photoProgress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!videoDone && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">🎬 Video <span className="text-neutral-600 font-mono">{VIDEO_DAYS}z</span></span>
                        {deadlineLabel(videoRemaining, videoDone, "video")}
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(videoProgress, videoDone)}`}
                          style={{ width: `${videoProgress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Evidență livrare */}
            {!isLead && (
              <div className="border-t border-neutral-800 pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Evidență livrare</p>
                  <span className="text-xs text-neutral-600 font-mono">
                    {DELIVERY_STEPS.filter((s) => delivery[s.key]).length}/{DELIVERY_STEPS.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DELIVERY_STEPS.map((step) => (
                    <button
                      key={step.key}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleDelivery(step.key); }}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        delivery[step.key]
                          ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                          : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:text-neutral-200 hover:border-neutral-500"
                      }`}
                    >
                      <span className="text-[10px] leading-none">{delivery[step.key] ? "✓" : "○"}</span>
                      {step.label}
                    </button>
                  ))}
                </div>
                {(albumSlug || suggestedSlug) && (
                  <a
                    href={`/media/${albumSlug || suggestedSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    /media/{albumSlug || suggestedSlug}
                  </a>
                )}
              </div>
            )}

            {/* Album modal */}
            {showAlbumModal && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                onClick={(e) => { e.stopPropagation(); setShowAlbumModal(false); }}
              >
                <div
                  className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-sm space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-white font-semibold text-base">
                    {albumSlug ? "Editează album" : "Creează album media"}
                  </h3>
                  {!albumSlug && (
                    <div>
                      <label className={labelClass}>Slug album</label>
                      <AlbumSlugInput suggestedSlug={suggestedSlug} onCreate={handleCreateAlbum} creating={albumCreating} error={albumError} />
                    </div>
                  )}
                  {albumSlug && (
                    <AlbumPinInput currentPin={albumPin} onSave={handleSaveAlbumPin} onClose={() => setShowAlbumModal(false)} />
                  )}
                  {!albumSlug && (
                    <button
                      onClick={() => setShowAlbumModal(false)}
                      className="w-full py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm hover:text-white transition-colors"
                    >
                      Anulează
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Cheltuieli eveniment */}
            <div className="border-t border-neutral-800 pt-3 space-y-2">
              <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Cheltuieli eveniment</p>

              {expenses.length > 0 && (
                <div className="space-y-1.5">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-300 flex-1 truncate">{expense.label}</span>
                      <span className="text-right shrink-0">
                        <span className="text-neutral-400 font-mono">{formatRON(expense.amount)}</span>
                        {eurOf(expense.amount) && (
                          <span className="text-neutral-600 text-[10px] block leading-tight">≈ {eurOf(expense.amount)}</span>
                        )}
                      </span>
                      <button
                        onClick={() => removeExpense(expense.id)}
                        className="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                        title="Șterge"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60">
                    <span className="text-neutral-500 text-xs">Total cheltuieli</span>
                    <span className="text-right">
                      <span className="text-neutral-300 text-xs font-semibold font-mono">
                        {formatRON(expenses.reduce((sum, expense) => sum + expense.amount, 0))}
                      </span>
                      {eurOf(expenses.reduce((sum, expense) => sum + expense.amount, 0)) && (
                        <span className="text-neutral-600 text-[10px] block leading-tight">
                          ≈ {eurOf(expenses.reduce((sum, expense) => sum + expense.amount, 0))}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  className="flex-1 bg-neutral-800 text-white text-xs placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-1.5 outline-none focus:border-neutral-500 transition-colors min-w-0"
                  placeholder="ex: Motorină, Nepoata Maria..."
                  value={newExpenseLabel}
                  onChange={(e) => setNewExpenseLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addExpense(); }}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-24 bg-neutral-800 text-white text-xs placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-1.5 outline-none focus:border-neutral-500 transition-colors"
                  placeholder="RON"
                  value={newExpenseAmount}
                  onChange={(e) => setNewExpenseAmount(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addExpense(); }}
                />
                <button
                  onClick={addExpense}
                  disabled={expenseSaving || !newExpenseLabel.trim() || !newExpenseAmount}
                  className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-medium transition-colors disabled:opacity-40 shrink-0"
                >
                  {expenseSaving ? "..." : "Adaugă"}
                </button>
              </div>
            </div>

            {/* Edit button for confirmed events */}
            {!isLead && (
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Modifică
                </button>
                <EventActionMenu
                  showBackupAction={backupPending}
                  backupSaving={backupSaving}
                  backupPageUrl={backupPageUrl}
                  onConfirmBackup={handleBackupConfirmed}
                  onEdit={() => setEditing(true)}
                  onArchive={handleArchive}
                  onDelete={onDeleted ? () => setDeleteStep("first") : undefined}
                  archiveDisabled={event.status === "anulat"}
                  deleteLabel={deleting ? "Se șterge..." : "Șterge definitiv"}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 1: Archive or Delete */}
      {deleteStep === "first" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setDeleteStep(null)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-white font-semibold text-base">Ce vrei să faci?</h3>
              <p className="text-neutral-400 text-sm mt-1">
                Evenimentul <span className="text-white">{event.client.fullName}</span> poate fi arhivat sau șters definitiv.
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleArchive}
                className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition-colors text-left px-4"
              >
                📦 Mută în Arhivă
                <p className="text-neutral-400 text-xs font-normal mt-0.5">Evenimentul rămâne vizibil în tab-ul Arhivă</p>
              </button>
              <button
                onClick={() => setDeleteStep("confirm")}
                className="w-full py-2.5 rounded-lg border border-red-900/50 hover:border-red-700 text-red-400 hover:text-red-300 text-sm font-medium transition-colors text-left px-4"
              >
                🗑 Șterge definitiv
                <p className="text-red-500/60 text-xs font-normal mt-0.5">Ireversibil — nu poate fi recuperat</p>
              </button>
            </div>
            <button onClick={() => setDeleteStep(null)} className="w-full py-2 text-neutral-500 hover:text-white text-sm transition-colors">
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Final delete confirmation */}
      {deleteStep === "confirm" && (
        <ConfirmModal
          title="Ești absolut sigur?"
          message={`Ștergi definitiv evenimentul lui ${event.client.fullName}. Această acțiune este ireversibilă și nu poate fi anulată.`}
          confirmLabel={deleting ? "Se șterge..." : "Da, șterge definitiv"}
          variant="danger"
          onConfirm={() => { setDeleteStep(null); handleDelete(); }}
          onCancel={() => setDeleteStep(null)}
        />
      )}


      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
        >
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white text-base font-semibold">Modifică</h2>
              <button onClick={() => setEditing(false)} className="text-neutral-500 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nume client</label>
                <input className={inputClass} value={form.fullName} onChange={set("fullName")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Telefon</label>
                  <input className={inputClass} value={form.phone} onChange={set("phone")} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input className={inputClass} value={form.email} onChange={set("email")} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Data evenimentului</label>
                  <input type="date" className={inputClass} value={form.eventDate} onChange={set("eventDate")} />
                </div>
                <div>
                  <label className={labelClass}>Dată sfârșit (opțional)</label>
                  <input type="date" className={inputClass} value={form.eventEndDate} onChange={set("eventEndDate")} min={form.eventDate || undefined} />
                </div>
              </div>
              {event.type === "Altele" && (
                <div>
                  <label className={labelClass}>Descriere</label>
                  <input className={inputClass} placeholder="ex: Concediu, Vacanță..." value={form.typeLabel} onChange={set("typeLabel")} />
                </div>
              )}
              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={form.status} onChange={set("status")}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`fiscalized-${event.id}`}
                  type="checkbox"
                  checked={form.fiscalized}
                  onChange={(e) => setForm((f) => ({ ...f, fiscalized: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                <label htmlFor={`fiscalized-${event.id}`} className="text-neutral-400 text-xs cursor-pointer">
                  Fiscalizat
                </label>
              </div>
              {!form.fiscalized && (
                <p className="text-[11px] text-amber-400">
                  Eveniment marcat ca nefiscalizat, deci nu necesită factură.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Preț total (EUR)</label>
                  <input type="text" inputMode="numeric" className={inputClass} value={form.total} onChange={set("total")} />
                </div>
                <div>
                  <label className={labelClass}>Avans (EUR)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    value={form.advanceAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((f) => ({
                        ...f,
                        advanceAmount: val,
                        advancePaid: Number(val) > 0 ? true : f.advancePaid,
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="advancePaid"
                  type="checkbox"
                  checked={form.advancePaid}
                  onChange={(e) => setForm((f) => ({ ...f, advancePaid: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                <label htmlFor="advancePaid" className="text-neutral-400 text-xs cursor-pointer">
                  Avans încasat
                </label>
              </div>
              <div>
                <label className={labelClass}>Note</label>
                <textarea className={`${inputClass} resize-none`} rows={3} value={form.notes} onChange={set("notes")} />
              </div>
            </div>

            {/* Documents */}
            <div className="border-t border-neutral-800 pt-3 space-y-3">
              <p className="text-neutral-500 text-xs uppercase tracking-wide font-medium">Documente</p>
              <FileDropZone
                label="Contract"
                storagePath={docBasePath("contract")}
                currentUrl={contractUrl}
                onUploaded={(url) => saveDocUrl("contractUrl", url)}
                onDeleted={() => deleteDocUrl("contractUrl")}
              />
              <FileDropZone
                label="Factură"
                storagePath={docBasePath("factura")}
                currentUrl={invoiceUrl}
                onUploaded={(url) => saveDocUrl("invoiceUrl", url)}
                onDeleted={() => deleteDocUrl("invoiceUrl")}
              />
              <MultiFileDropZone
                label="Contract fizic (poze / scan)"
                storagePath={`admin-docs/${event.id}/attachments`}
                urls={attachmentUrls}
                onUrlsChange={saveAttachments}
              />
              <MultiFileDropZone
                label="Template fotocabină (PNG/JPG)"
                storagePath={`admin-docs/${event.id}/templates`}
                urls={templateUrls}
                onUrlsChange={saveTemplates}
                accept=".png,.jpg,.jpeg"
              />
            </div>

            {saveError && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {saveError}
              </p>
            )}

            <div className="pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-neutral-200 disabled:opacity-40 transition-colors"
              >
                {saving ? "Se salvează..." : "Salvează"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const EventActionMenu: React.FC<{
  showBackupAction: boolean;
  backupSaving: boolean;
  backupPageUrl: string | null;
  onConfirmBackup: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete?: () => void;
  archiveDisabled?: boolean;
  deleteLabel: string;
}> = ({ showBackupAction, backupSaving, backupPageUrl, onConfirmBackup, onEdit, onArchive, onDelete, archiveDisabled, deleteLabel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const Item: React.FC<{
    label: string;
    onClick?: () => void;
    href?: string;
    color?: string;
    disabled?: boolean;
  }> = ({ label, onClick, href, color = "text-neutral-200", disabled }) => {
    if (href) {
      return (
        <a
          href={href}
          className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-neutral-800 ${color}`}
          onClick={() => setOpen(false)}
        >
          {label}
        </a>
      );
    }

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onClick?.();
        }}
        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-neutral-800 disabled:opacity-40 ${color}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 items-center justify-center rounded-lg border border-neutral-700 px-2.5 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
      >
        More
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 min-w-[220px] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
          {showBackupAction && (
            <Item
              label={backupSaving ? "🛟 Se salvează..." : "🛟 Am făcut backup-ul"}
              onClick={onConfirmBackup}
              color="text-emerald-400"
              disabled={backupSaving}
            />
          )}
          {backupPageUrl && (
            <Item
              label="↗ Vezi pagina de backup"
              href={backupPageUrl}
              color="text-orange-300"
            />
          )}
          <Item label="✏️ Modifică" onClick={onEdit} color="text-amber-300" />
          <Item label="📦 Mută în arhivă" onClick={onArchive} color="text-neutral-200" disabled={archiveDisabled} />
          {onDelete && (
            <>
              <div className="my-1 border-t border-neutral-800" />
              <Item label={`🗑 ${deleteLabel}`} onClick={onDelete} color="text-red-400" />
            </>
          )}
        </div>
      )}
    </div>
  );
};

const AlbumSlugInput: React.FC<{
  suggestedSlug: string;
  creating: boolean;
  error: string | null;
  onCreate: (slug: string, pin: string) => void;
}> = ({ suggestedSlug, creating, error, onCreate }) => {
  const [slug, setSlug] = useState(suggestedSlug);
  const [pin, setPin] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-neutral-400 text-xs font-medium mb-1 uppercase tracking-wide">Slug album</label>
        <input
          className="w-full bg-neutral-800 text-white text-sm placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-neutral-500 font-mono"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="ex: 14februarie2026"
        />
      </div>
      <div>
        <label className="block text-neutral-400 text-xs font-medium mb-1 uppercase tracking-wide">PIN (opțional)</label>
        <input
          className="w-full bg-neutral-800 text-white text-sm placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-neutral-500 font-mono"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="ex: 1234"
          inputMode="numeric"
        />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={() => onCreate(slug, pin)}
        disabled={creating || !slug}
        className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
      >
        {creating ? "Se creează..." : "Creează album"}
      </button>
    </div>
  );
};

const AlbumPinInput: React.FC<{
  currentPin: string;
  onSave: (pin: string) => void;
  onClose: () => void;
}> = ({ currentPin, onSave, onClose }) => {
  const [pin, setPin] = useState(currentPin);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await onSave(pin);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-neutral-400 text-xs font-medium mb-1 uppercase tracking-wide">PIN acces album</label>
        <input
          className="w-full bg-neutral-800 text-white text-sm placeholder-neutral-600 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-neutral-500 font-mono"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Fără PIN"
          inputMode="numeric"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm hover:text-white transition-colors"
        >
          Anulează
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          {saved ? "Salvat ✓" : "Salvează"}
        </button>
      </div>
    </div>
  );
};

export default EventCard;
