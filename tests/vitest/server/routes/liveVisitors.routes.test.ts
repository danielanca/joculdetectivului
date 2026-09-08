/*
 * Purpose: verifies the live-visitor ingestion routes — bot / admin / local-IP
 * filtering, event recording, heartbeat, end, and the critical-event activity
 * log — with the live store and Firestore mocked out.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Handler = (req: any, res: any) => Promise<void> | void;

function createMockResponse() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

async function loadRouter() {
  const recordEvent = vi.fn().mockReturnValue({
    session: {
      visitorNumber: 1, city: "Cluj", country: "RO", org: "RCS-RDS", source: "google_ads",
      isGoogleAds: true, currentPage: "/oferta", deviceType: "desktop", ip: "8.8.8.8", attribution: {},
    },
    event: { page: "/oferta", priority: "critical", at: Date.now(), label: "WhatsApp" },
  });
  const ping = vi.fn();
  const endSession = vi.fn();
  const logActivity = vi.fn().mockResolvedValue(undefined);
  const sendEmail = vi.fn().mockResolvedValue(undefined);

  vi.doMock("src/server/services/liveVisitors.service", () => ({
    recordEvent,
    ping,
    endSession,
    getActiveSnapshot: vi.fn().mockReturnValue([]),
    sessionNeedsGeo: vi.fn().mockReturnValue(false),
    liveVisitorsEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  }));
  vi.doMock("src/server/services/activity.service", () => ({ logActivity }));
  vi.doMock("src/server/notifications/mailer", () => ({ sendEmail }));
  vi.doMock("src/server/constants/credentials", () => ({ adminUser: { email: "admin@test.ro" } }));
  vi.doMock("src/server/utils/ipinfo", () => ({
    getClientIp: vi.fn().mockReturnValue("8.8.8.8"),
    fetchIpInfo: vi.fn().mockResolvedValue(null),
  }));
  vi.doMock("src/server/controllers/triggerEvent.controller", () => ({
    isLocalIp: (ip: string) => ip === "127.0.0.1",
  }));
  vi.doMock("src/server/middleware/requireFirebaseAuth", () => ({
    requireFirebaseAuth: (_req: any, _res: any, next: any) => next(),
    requireSupremeAdmin: (_req: any, _res: any, next: any) => next(),
  }));
  vi.doMock("src/server/firestore", () => ({ firestore: () => ({}) }));

  const mod = await import("src/server/routes/liveVisitors.routes");
  const router = mod.liveVisitorsPublicRouter as any;

  const getHandler = (method: string, path: string): Handler => {
    const layer = router.stack.find((e: any) => e.route?.path === path && e.route.methods?.[method]);
    if (!layer) throw new Error(`Missing ${method} ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };

  return {
    recordEvent, ping, endSession, logActivity, sendEmail,
    postEvent: getHandler("post", "/live/event"),
    postPing: getHandler("post", "/live/ping"),
    postEnd: getHandler("post", "/live/end"),
  };
}

const realUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

describe("liveVisitors.routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("POST /live/event", () => {
    test("records a valid event from a real browser", async () => {
      const { postEvent, recordEvent } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "pricing_viewed", page: "/oferta" }, headers: { "user-agent": realUa } },
        res,
      );
      expect(recordEvent).toHaveBeenCalledOnce();
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("ignores bots", async () => {
      const { postEvent, recordEvent } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "session_started", page: "/" }, headers: { "user-agent": "Googlebot/2.1" } },
        res,
      );
      expect(recordEvent).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, ignored: true });
    });

    test("ignores the admin's own cookie in production", async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const { postEvent, recordEvent } = await loadRouter();
        const res = createMockResponse();
        await postEvent(
          { body: { sessionId: "s1", event: "session_started", page: "/" }, headers: { "user-agent": realUa, cookie: "av_admin=1" } },
          res,
        );
        expect(recordEvent).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = prev;
      }
    });

    test("tracks the admin cookie in dev (so the owner can test)", async () => {
      const { postEvent, recordEvent } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "session_started", page: "/" }, headers: { "user-agent": realUa, cookie: "av_admin=1" } },
        res,
      );
      expect(recordEvent).toHaveBeenCalledOnce();
    });

    test("ignores /admin pages", async () => {
      const { postEvent, recordEvent } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "page_view", page: "/admin/live" }, headers: { "user-agent": realUa } },
        res,
      );
      expect(recordEvent).not.toHaveBeenCalled();
    });

    test("rejects a payload without sessionId", async () => {
      const { postEvent } = await loadRouter();
      const res = createMockResponse();
      await postEvent({ body: { event: "x" }, headers: { "user-agent": realUa } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("logs an activity entry for a critical event", async () => {
      const { postEvent, logActivity } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "whatsapp_clicked", page: "/oferta" }, headers: { "user-agent": realUa } },
        res,
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: "lead", title: expect.stringContaining("WhatsApp") }),
      );
    });

    test("does not log an activity entry for a normal event", async () => {
      const { postEvent, logActivity } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "scroll_depth", page: "/" }, headers: { "user-agent": realUa } },
        res,
      );
      expect(logActivity).not.toHaveBeenCalled();
    });

    test("emails the owner for a WhatsApp click, with the event body in the mail", async () => {
      const { postEvent, sendEmail } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "whatsapp_clicked", page: "/oferta", meta: { text: "Scrie-ne pe WhatsApp" } }, headers: { "user-agent": realUa } },
        res,
      );
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: "admin@test.ro",
        subject: expect.stringContaining("WhatsApp"),
        html: expect.stringContaining("Scrie-ne pe WhatsApp"),
      }));
    });

    test("only emails once per session+event within the cooldown", async () => {
      const { postEvent, sendEmail } = await loadRouter();
      const req = { body: { sessionId: "s1", event: "phone_revealed", page: "/" }, headers: { "user-agent": realUa } };
      await postEvent(req, createMockResponse());
      await postEvent(req, createMockResponse());
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    test("does not email for a generic button click", async () => {
      const { postEvent, sendEmail } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "element_clicked", page: "/", meta: { text: "Vezi portofoliul" } }, headers: { "user-agent": realUa } },
        res,
      );
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  test("POST /live/ping forwards the session id", async () => {
    const { postPing, ping } = await loadRouter();
    const res = createMockResponse();
    await postPing({ body: { sessionId: "s1" }, headers: {} }, res);
    expect(ping).toHaveBeenCalledWith("s1");
  });

  test("POST /live/end ends the session with a duration", async () => {
    const { postEnd, endSession } = await loadRouter();
    const res = createMockResponse();
    await postEnd({ body: { sessionId: "s1", durationSeconds: 90 }, headers: {} }, res);
    expect(endSession).toHaveBeenCalledWith("s1", "left", 90);
  });
});
