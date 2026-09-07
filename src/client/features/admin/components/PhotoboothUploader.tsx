import React, { useRef, useState } from "react";

interface PhotoboothUploaderProps {
  eventId: string;
  accessToken: string;
  galleryUrl: string;
}

interface UploadState {
  total: number;
  done: number;
  failed: string[];
  running: boolean;
}

const BATCH_SIZE = 8;

const isImageFile = (file: File) =>
  file.type.toLowerCase().startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);

export default function PhotoboothUploader({ eventId, accessToken, galleryUrl }: PhotoboothUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ total: 0, done: 0, failed: [], running: false });
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(isImageFile);
    if (files.length === 0) {
      setError("Selectează imagini (JPG, PNG, WEBP).");
      return;
    }

    setError(null);
    setState({ total: files.length, done: 0, failed: [], running: true });

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      batch.forEach((file) => formData.append("files", file));

      try {
        const response = await fetch(`/api/admin/events/${eventId}/photobooth-upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });
        const data = (await response.json()) as { uploaded?: number; failed?: string[]; error?: string };
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            done: prev.done + batch.length,
            failed: [...prev.failed, ...batch.map((f) => f.name)],
          }));
          setError(data.error ?? "Eroare la upload.");
        } else {
          setState((prev) => ({
            ...prev,
            done: prev.done + batch.length,
            failed: [...prev.failed, ...(data.failed ?? [])],
          }));
        }
      } catch {
        setState((prev) => ({
          ...prev,
          done: prev.done + batch.length,
          failed: [...prev.failed, ...batch.map((f) => f.name)],
        }));
        setError("Eroare de rețea la upload.");
      }
    }

    setState((prev) => ({ ...prev, running: false }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files);
    e.target.value = "";
  };

  const progressPct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  const uploaded = state.done - state.failed.length;

  return (
    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors",
          dragging ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-700 hover:border-neutral-500",
        ].join(" ")}
      >
        <p className="text-xs text-neutral-500">
          Trage pozele de la fotocabină aici sau <span className="text-neutral-300 underline">selectează</span>
          <span className="block mt-0.5 text-neutral-600">JPG, PNG, WEBP — se urcă direct în Bunny</span>
        </p>
      </div>

      {state.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{state.running ? `Se urcă… ${state.done}/${state.total}` : `✓ ${uploaded} poze urcate`}</span>
            {state.failed.length > 0 && <span className="text-red-400">{state.failed.length} eșuate</span>}
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${state.running ? "bg-emerald-500" : "bg-emerald-400"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {state.failed.length > 0 && !state.running && (
        <p className="text-xs text-red-400 break-words">
          Nu s-au putut urca: {state.failed.slice(0, 8).join(", ")}
          {state.failed.length > 8 ? ` +${state.failed.length - 8}` : ""}
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {state.total > 0 && !state.running && uploaded > 0 && (
        <a
          href={galleryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          → Vezi galeria fotocabină
        </a>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
