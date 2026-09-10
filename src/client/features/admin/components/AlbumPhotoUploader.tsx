import React, { useRef, useState } from "react";

interface AlbumPhotoUploaderProps {
  eventId: string;
  albumSlug: string;
  accessToken: string;
  /** Chemat după ce toate pozele au fost urcate (măcar una cu succes). */
  onComplete?: () => void;
}

type FileStatus = "pending" | "uploading" | "done" | "error";

interface Row {
  file: File;
  status: FileStatus;
}

const CONCURRENCY = 4;

const isAlbumPhoto = (file: File) =>
  /\.(jpe?g|png)$/i.test(file.name) || file.type === "image/jpeg" || file.type === "image/png";

export default function AlbumPhotoUploader({ eventId, albumSlug, accessToken, onComplete }: AlbumPhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = (index: number, status: FileStatus) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status } : r)));

  const uploadOne = async (file: File): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/upload-photo?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/octet-stream" },
          body: file,
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  };

  const runQueue = async (sourceRows: Row[], targets: number[]) => {
    setError(null);
    setRunning(true);
    targets.forEach((i) => setStatus(i, "pending"));

    let cursor = 0;
    let succeeded = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const index = targets[cursor++];
        setStatus(index, "uploading");
        const ok = await uploadOne(sourceRows[index].file);
        setStatus(index, ok ? "done" : "error");
        if (ok) succeeded += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

    setRunning(false);
    if (succeeded === 0) {
      setError("Nicio poză nu s-a urcat. Verifică conexiunea și încearcă din nou.");
      return;
    }
    onComplete?.();
  };

  const pick = (fileList: FileList | File[]) => {
    const picked = Array.from(fileList).filter(isAlbumPhoto);
    if (picked.length === 0) {
      setError("Selectează fișiere JPG sau PNG.");
      return;
    }
    const next = picked.map<Row>((file) => ({ file, status: "pending" }));
    setRows(next);
    void runQueue(next, next.map((_, i) => i));
  };

  const retryFailed = () => {
    const failed = rows.map((r, i) => (r.status === "error" ? i : -1)).filter((i) => i >= 0);
    if (failed.length) void runQueue(rows, failed);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length) pick(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) pick(e.target.files);
    e.target.value = "";
  };

  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "error").length;
  const pct = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;

  return (
    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors",
          dragging ? "border-violet-500 bg-violet-500/10" : "border-neutral-700 hover:border-neutral-500",
        ].join(" ")}
      >
        <p className="text-xs text-neutral-500">
          Trage pozele originale aici sau <span className="text-neutral-300 underline">selectează</span>
          <span className="block mt-0.5 text-neutral-600">
            JPG / PNG — merg în <span className="font-mono">{albumSlug}/photos/</span>, apoi se generează automat previzualizările
          </span>
        </p>
      </div>

      {total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{running ? `Se urcă… ${done + failed}/${total}` : `✓ ${done} urcate`}</span>
            {failed > 0 && <span className="text-red-400">{failed} eșuate</span>}
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${running ? "bg-violet-500" : "bg-violet-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {failed > 0 && !running && (
        <button
          onClick={retryFailed}
          className="text-xs text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          Reîncearcă {failed} eșuate
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleChange} />
    </div>
  );
}
