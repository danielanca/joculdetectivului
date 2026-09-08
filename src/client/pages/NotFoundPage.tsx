import { useEffect } from "react";
import AlbumNotFound from "./MediaDownload/AlbumNotFound";

// Avoids double-reporting the same bad URL within one browsing session
// (e.g. React StrictMode double-mount in dev, or a re-render).
const reportedPaths = new Set<string>();

/**
 * Rendered by the catch-all `path="*"` route. Same UI as AlbumNotFound, but
 * also pings the server so the admin gets an email when a real visitor lands
 * on a broken link — usually a wrong URL in an ad or a printed material.
 */
export default function NotFoundPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname + window.location.search;
    if (reportedPaths.has(path)) return;
    reportedPaths.add(path);

    fetch("/api/monitoring/not-found", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        referrer: document.referrer || "",
        userAgent: navigator.userAgent || "",
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return <AlbumNotFound />;
}
