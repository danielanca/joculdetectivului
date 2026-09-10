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

    test("emails with the checked date when someone verifies availability", async () => {
      const { postEvent, sendEmail, logActivity } = await loadRouter();
      const res = createMockResponse();
      await postEvent(
        { body: { sessionId: "s1", event: "availability_checked", page: "/contact", meta: { date: "15 August 2026", dateKey: "2026-08-15", available: true } }, headers: { "user-agent": realUa } },
        res,
      );
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        subject: expect.stringContaining("15 August 2026"),
        html: expect.stringContaining("15 August 2026"),
      }));
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("15 August 2026") }));
    });

    test("emails once per distinct checked date (not once per session)", async () => {
      const { postEvent, sendEmail } = await loadRouter();
      const mk = (date: string) => ({ body: { sessionId: "s1", event: "availability_checked", page: "/contact", meta: { date, dateKey: date, available: true } }, headers: { "user-agent": realUa } });
      await postEvent(mk("15 August 2026"), createMockResponse());
      await postEvent(mk("15 August 2026"), createMockResponse()); // same date → deduped
      await postEvent(mk("20 August 2026"), createMockResponse()); // new date → emails
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    test("form_submitted logs every kind, but only emails delivery/subscribe (not contact)", async () => {
      const { postEvent, sendEmail, logActivity } = await loadRouter();
      const post = (sid: string, kind: string) =>
        postEvent({ body: { sessionId: sid, event: "form_submitted", page: "/media/x", meta: { kind } }, headers: { "user-agent": realUa } }, createMockResponse());
      await post("c1", "contact");
      await post("d1", "delivery");
      await post("s1", "subscribe");

      const subjects = (sendEmail.mock.calls as { subject: string }[][]).map((c) => c[0].subject).join("\n");
      const titles = (logActivity.mock.calls as { title: string }[][]).map((c) => c[0].title).join("\n");
      // contact has its own lead-email route — the generic listener carries no
      // field values, so it never emails; it still shows in the activity feed.
      expect(subjects).not.toContain("contactat");
      expect(subjects).toContain("livrare");
      expect(subjects).toContain("notificare");
      expect(titles).toContain("contactat");
      expect(titles).toContain("livrare");
      expect(titles).toContain("notificare");
    });

    test("a contact form_submitted with real lead data logs name/phone but sends no email", async () => {
      const { postEvent, sendEmail, logActivity } = await loadRouter();
      await postEvent(
        { body: { sessionId: "c9", event: "form_submitted", page: "/oferta/olx", meta: { kind: "contact", name: "Andrei P", phone: "0712345678" } }, headers: { "user-agent": realUa } },
        createMockResponse(),
      );
      expect(sendEmail).not.toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        description: expect.stringContaining("Andrei P · 0712345678"),
      }));
    });

    test("form_submitted emails once per kind (delivery and subscribe are separate)", async () => {
      const { postEvent, sendEmail } = await loadRouter();
      const mk = (kind: string) => ({ body: { sessionId: "s1", event: "form_submitted", page: "/x", meta: { kind } }, headers: { "user-agent": realUa } });
      await postEvent(mk("subscribe"), createMockResponse());
      await postEvent(mk("subscribe"), createMockResponse()); // deduped
      await postEvent(mk("delivery"), createMockResponse());  // different kind → emails
      expect(sendEmail).toHaveBeenCalledTimes(2);
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
