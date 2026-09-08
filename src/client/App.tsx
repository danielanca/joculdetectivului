import React, { Suspense, useEffect, useState, Component } from "react";

// ── Chunk Error Boundary ──────────────────────────────────────────────────────
// After a new deployment, cached index.js tries to load old chunk hashes that
// no longer exist on the server. Catch those errors and auto-reload once.

const CHUNK_RELOAD_KEY = "__chunk_reload__";

function isChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Failed to fetch dynamically imported module") ||
    error.message.includes("Unable to preload CSS") ||
    error.name === "ChunkLoadError"
  );
}

class ChunkErrorBoundary extends Component<
  { children: React.ReactNode },
  { crashed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return { crashed: isChunkError(error) };
  }

  componentDidCatch(error: unknown) {
    if (!isChunkError(error)) return;
    // Reload once to pick up the new chunks; guard against reload loops
    if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.crashed) {
      return (
        <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#555", fontSize: 14 }}>Se actualizează aplicația...</p>
          <button
            onClick={() => { sessionStorage.removeItem(CHUNK_RELOAD_KEY); window.location.reload(); }}
            style={{ color: "#aaa", fontSize: 12, background: "none", border: "1px solid #333", borderRadius: 8, padding: "6px 16px", cursor: "pointer" }}
          >
            Reîncarcă
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Route, Routes, useLocation } from "react-router-dom";
import loadable from "@loadable/component";
import { AuthProvider } from "./features/admin/providers/AuthProvider";
import { ErrorMonitorProvider } from "./features/admin/providers/ErrorMonitorContext";
import AdminBar from "./components/UI/AdminBar";
import AncaLoader from "./components/UI/AncaLoader";
import ErrorMonitorPanel from "./features/admin/components/ErrorMonitorPanel";
import ClientDebugBadge from "./features/admin/components/ClientDebugBadge";
import { usePageTracking } from "./hooks/usePageTracking";
import { useClientErrorReporting } from "./hooks/useClientErrorReporting";
import { useVisitorNotification } from "./hooks/useVisitorNotification";
import { useLiveVisitor } from "./hooks/useLiveVisitor";
import { captureLandingMeta } from "./utils/sessionAttribution";
import publicRoutes from "./routes/publicRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { weddingHubRoutes } from "./routes/weddingHubRoutes";

const AncaChat = loadable(() => import("./features/chat/components/AncaChat"), { fallback: <></> });
const NotFoundPage = loadable(() => import("./pages/NotFoundPage"), { fallback: <AncaLoader /> });

const HIDE_CHAT_PREFIXES = ["/admin", "/login", "/contract", "/revin", "/colaborator", "/qr-moments", "/wedding-hub", "/invite", "/oferta", "/backup"];

export const App = () => {
  const location = useLocation();
  const [mediaPromoVisible, setMediaPromoVisible] = useState(false);
  const isMediaPage = location.pathname.startsWith("/media/");
  const baseChatAllowed = !HIDE_CHAT_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  const showChat = isMediaPage ? mediaPromoVisible : baseChatAllowed;
  const isErrorReportingEnabled = location.pathname.startsWith("/admin") || location.pathname.startsWith("/media");
  usePageTracking();
  useClientErrorReporting(isErrorReportingEnabled);
  useVisitorNotification();
  useLiveVisitor();

  useEffect(() => {
    captureLandingMeta();
  }, []);

  const suppressCookieBot = location.pathname.startsWith("/media") || location.pathname.startsWith("/admin");

  useEffect(() => {
    const STYLE_ID = "uc-suppress-style";
    if (suppressCookieBot) {
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = "[id^='uc-'], [class^='uc-'], #usercentrics-root { display: none !important; }";
        document.head.appendChild(style);
      }
      // Also remove any already-present nodes for UC dialog
      const removeUcNodes = () => {
        document.querySelectorAll("[id^='uc-'], #usercentrics-root").forEach((el) => el.remove());
      };
      removeUcNodes();
      const observer = new MutationObserver(removeUcNodes);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    } else {
      document.getElementById(STYLE_ID)?.remove();
    }
  }, [suppressCookieBot]);

  useEffect(() => {
    if (!isMediaPage) {
      setMediaPromoVisible(false);
      return;
    }

    const target = document.getElementById("media-promo-zone");
    if (!target) {
      setMediaPromoVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setMediaPromoVisible(entry.isIntersecting),
      { threshold: 0.2 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isMediaPage, location.pathname]);

  return (
    <ErrorMonitorProvider>
      <AuthProvider>
          <AdminBar />
          <ErrorMonitorPanel />
          <ClientDebugBadge />
          <ChunkErrorBoundary>
          {isErrorReportingEnabled && <ErrorMonitorPanel />}
          {isErrorReportingEnabled && <ClientDebugBadge />}
          <Suspense fallback={<AncaLoader reportSlowLoad />}>
            {showChat && <AncaChat />}
            <Routes>
              {publicRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={<route.component />} />
              ))}
              {adminRoutes}
              {weddingHubRoutes}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </ChunkErrorBoundary>
      </AuthProvider>
    </ErrorMonitorProvider>
  );
};

export default App;
