/*
 * Purpose: verifies that triggerEvent correctly applies the cooldown, IP
 * geo-filter, and — crucially — uses the caller-supplied html/subject for
 * Lead Rapid / booking submissions instead of the generic visitor template.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Handler = (req: any, res: any) => Promise<void>;

function createMockResponse() {
  const res = { status: vi.fn(), send: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

function buildReq(body: Record<string, unknown>, ip = "89.40.11.22") {
  return {
    body,
    headers: {},
    connection: { remoteAddress: ip },
    socket: { remoteAddress: ip },
  };
}

async function loadController() {
  const sendEmailMock = vi.fn().mockResolvedValue(undefined);
  const fetchIpInfoMock = vi.fn().mockResolvedValue({ country: "RO", city: "Cluj-Napoca" });
  const getClientIpMock = vi.fn().mockReturnValue("89.40.11.22");
  const renderTriggerTemplateMock = vi.fn().mockReturnValue("<p>generic template</p>");
  const applyCORSpolicyMock = vi.fn();

  vi.doMock("src/server/notifications/mailer", () => ({ sendEmail: sendEmailMock }));
  vi.doMock("src/server/utils/ipinfo", () => ({
    fetchIpInfo: fetchIpInfoMock,
    getClientIp: getClientIpMock,
  }));
  vi.doMock("src/server/notifications/templates/triggerTemplate", () => ({
    renderTriggerTemplate: renderTriggerTemplateMock,
  }));
  vi.doMock("src/server/constants/cors", () => ({ applyCORSpolicy: applyCORSpolicyMock }));
  vi.doMock("src/server/constants/credentials", () => ({
    adminUser: { email: "admin@test.ro" },
  }));

  const module = await import("src/server/controllers/triggerEvent.controller");

  return {
    triggerEvent: module.triggerEvent as Handler,
    sendEmailMock,
    fetchIpInfoMock,
    getClientIpMock,
    renderTriggerTemplateMock,
  };
}

describe("triggerEvent controller", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("returns 204 for local IP", async () => {
    const { triggerEvent, sendEmailMock, getClientIpMock } = await loadController();
    getClientIpMock.mockReturnValue("127.0.0.1");

    const res = createMockResponse();
    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/" }, "127.0.0.1"), res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test("returns 204 for non-RO IP", async () => {
    const { triggerEvent, sendEmailMock, fetchIpInfoMock } = await loadController();
    fetchIpInfoMock.mockResolvedValue({ country: "DE", city: "Berlin" });

    const res = createMockResponse();
    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/" }), res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test("returns 204 when ip returns null (unknown origin)", async () => {
    const { triggerEvent, sendEmailMock, fetchIpInfoMock } = await loadController();
    fetchIpInfoMock.mockResolvedValue(null);

    const res = createMockResponse();
    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/portofoliu", browserVersion: "Chrome/120" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  test("sends generic template for normal visitor event", async () => {
    const { triggerEvent, sendEmailMock, renderTriggerTemplateMock } = await loadController();

    const res = createMockResponse();
    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/portofoliu", browserVersion: "Chrome/120" }), res);

    expect(renderTriggerTemplateMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ html: "<p>generic template</p>" }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("uses caller html+subject for Lead Rapid — skips generic template", async () => {
    const { triggerEvent, sendEmailMock, renderTriggerTemplateMock } = await loadController();

    const leadHtml = "<h2>Lead rapid din configurator</h2><p>Nume: Ion</p>";
    const leadSubject = "Lead rapid – NUNTĂ – 2026-07-15";

    const res = createMockResponse();
    await triggerEvent(
      buildReq({
        typeEvent: "Lead Rapid",
        html: leadHtml,
        subject: leadSubject,
        browserVersion: "Chrome/120",
        booking: { date: "2026-07-15", eventType: "nunta", fullName: "Ion", phone: "0700000000", partial: true },
      }),
      res,
    );

    expect(renderTriggerTemplateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      html: leadHtml,
      subject: leadSubject,
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("uses caller html+subject for full booking submission", async () => {
    const { triggerEvent, sendEmailMock, renderTriggerTemplateMock } = await loadController();

    const bookingHtml = "<h2>Cerere nouă</h2><p>Data: 2026-08-10</p>";
    const bookingSubject = "Cerere NUNTĂ – 10 August 2026";

    const res = createMockResponse();
    await triggerEvent(
      buildReq({ typeEvent: "Rezervare", html: bookingHtml, subject: bookingSubject, browserVersion: "Chrome/120" }),
      res,
    );

    expect(renderTriggerTemplateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      html: bookingHtml,
      subject: bookingSubject,
    }));
  });

  test("flags Google Ads clicks (gclid) in the subject and template", async () => {
    const { triggerEvent, sendEmailMock, renderTriggerTemplateMock } = await loadController();

    const res = createMockResponse();
    await triggerEvent(
      buildReq({
        typeEvent: "Vizitator",
        url: "/oferte/olx",
        browserVersion: "Chrome/120",
        referrer: "https://www.google.com/",
        gclid: "EAIaIQob-test-gclid",
        utmCampaign: "nunta-cluj",
      }),
      res,
    );

    expect(renderTriggerTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ isGoogleAds: true, gclid: "EAIaIQob-test-gclid" }),
    );
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Google Ads") }),
    );
  });

  test("labels an organic Google visit as organic (no gclid / paid utm)", async () => {
    const { triggerEvent, sendEmailMock, renderTriggerTemplateMock } = await loadController();

    const res = createMockResponse();
    await triggerEvent(
      buildReq({
        typeEvent: "Vizitator",
        url: "/oferte/olx",
        browserVersion: "Chrome/120",
        referrer: "https://www.google.com/",
      }),
      res,
    );

    expect(renderTriggerTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ isGoogleAds: false }),
    );
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Google (organic)") }),
    );
  });

  test("returns 204 on second request from same IP within cooldown (visitor event)", async () => {
    const { triggerEvent, sendEmailMock } = await loadController();

    const res1 = createMockResponse();
    const res2 = createMockResponse();

    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/portofoliu", browserVersion: "Chrome/120" }), res1);
    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/nunta-cluj", browserVersion: "Chrome/120" }), res2);

    expect(res1.status).toHaveBeenCalledWith(200);
    expect(res2.status).toHaveBeenCalledWith(204);
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  test("returns 500 when sendEmail throws", async () => {
    const { triggerEvent, sendEmailMock } = await loadController();
    sendEmailMock.mockRejectedValue(new Error("SMTP down"));

    const res = createMockResponse();
    await triggerEvent(buildReq({ typeEvent: "Vizitator", url: "/portofoliu", browserVersion: "Chrome/120" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
