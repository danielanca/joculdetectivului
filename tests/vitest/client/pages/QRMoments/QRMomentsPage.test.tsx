import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import QRMomentsPage from "src/client/pages/QRMoments/QRMomentsPage";
import QRMomentsGalleryPage from "src/client/pages/QRMoments/QRMomentsGalleryPage";
import QRMomentsUnsubscribePage from "src/client/pages/QRMoments/QRMomentsUnsubscribePage";

vi.mock("firebase/storage", async () => {
  const actual = await vi.importActual<typeof import("firebase/storage")>("firebase/storage");
  return {
    ...actual,
    ref: vi.fn(() => ({})),
    listAll: vi.fn(async () => ({ items: [] })),
    getDownloadURL: vi.fn(),
  };
});

vi.mock("src/client/features/admin/auth/useAuth", () => ({
  default: () => ({
    auth: {
      authorise: false,
      accessToken: null,
      loading: false,
      user: null,
    },
  }),
}));

function renderUploadPage() {
  return render(
    <MemoryRouter initialEntries={["/qr-moments/27martie2028?pass=SECRET"]}>
      <Routes>
        <Route path="/qr-moments/:eventSlug" element={<QRMomentsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("QRMomentsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  test("submits guest registration and upload with the required pass", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          bride: "Ana",
          groom: "Dan",
          isOpen: true,
          deadline: "2028-03-28T01:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          guestId: "guest-1",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    // The upload flow uses a raw XMLHttpRequest (for upload progress events), not
    // fetch — jsdom's real XHR implementation attempts an actual network connection,
    // so it needs a fake implementation here instead of a fetch mock.
    class FakeUploadXHR {
      static instances: FakeUploadXHR[] = [];
      method = "";
      url = "";
      status = 201;
      responseText = JSON.stringify({ uploadedCount: 1, uploadIds: ["upload-1"] });
      timeout = 0;
      readyState = 4;
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      body: FormData | null = null;
      private headers: Record<string, string> = {};

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
      }

      send(body: FormData) {
        this.body = body;
        FakeUploadXHR.instances.push(this);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeUploadXHR as unknown as typeof XMLHttpRequest);

    renderUploadPage();

    fireEvent.change(await screen.findByLabelText("Numele tău *"), { target: { value: "Maria Ionescu" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "maria@example.com" } });
    fireEvent.click(screen.getByLabelText("Accept prelucrarea datelor cu caracter personal *"));
    fireEvent.click(screen.getByLabelText("Sunt de acord să primesc notificări prin email (opțional)"));
    fireEvent.click(screen.getByRole("button", { name: /Continuă/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/qr-moments/guest/register",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            eventSlug: "27martie2028",
            name: "Maria Ionescu",
            email: "maria@example.com",
            gdprConsent: true,
            emailConsent: true,
            pass: "SECRET",
          }),
        }),
      );
    });

    const file = new File(["image"], "poza.jpg", { type: "image/jpeg" });
    const uploadButton = await screen.findByRole("button", { name: /\+ Alege poze/i });
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "input") {
        const input = document.createElementNS("http://www.w3.org/1999/xhtml", "input") as HTMLInputElement;
        Object.defineProperty(input, "files", {
          configurable: true,
          value: {
            0: file,
            length: 1,
            item: (index: number) => (index === 0 ? file : null),
          },
        });
        queueMicrotask(() => {
          input.dispatchEvent(new Event("change"));
        });
        return input;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    fireEvent.click(uploadButton);
    fireEvent.click(await screen.findByRole("button", { name: /Trimite 1 fișier/i }));

    await waitFor(() => {
      expect(FakeUploadXHR.instances).toHaveLength(1);
    });

    const uploadRequest = FakeUploadXHR.instances[0];
    expect(uploadRequest.method).toBe("POST");
    expect(uploadRequest.url).toBe("/api/qr-moments/27martie2028/upload");
    expect(uploadRequest.body?.get("guestId")).toBe("guest-1");
    expect(uploadRequest.body?.get("pass")).toBe("SECRET");
    expect(await screen.findByText(/Fișierele tale au ajuns la miri/i)).toBeInTheDocument();

    createElementSpy.mockRestore();
  });

  test("keeps only the failed file selected for retry after a partial upload failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          bride: "Ana",
          groom: "Dan",
          isOpen: true,
          deadline: "2028-03-28T01:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ guestId: "guest-1" }),
      })
      // Fallback for the client-error debug beacon fired on the failed upload.
      .mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    // First file uploaded succeeds, second one fails — the app should upload each
    // file as its own request (so one bad file never blocks the rest), keep only
    // the failed file selected afterwards, and surface a partial-failure message.
    class FakePartialFailureXHR {
      static instances: FakePartialFailureXHR[] = [];
      method = "";
      url = "";
      status = 201;
      responseText = "";
      timeout = 0;
      readyState = 4;
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      body: FormData | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader() { /* no-op */ }

      send(body: FormData) {
        this.body = body;
        const isFirstCall = FakePartialFailureXHR.instances.length === 0;
        FakePartialFailureXHR.instances.push(this);
        if (isFirstCall) {
          this.responseText = JSON.stringify({ uploadedCount: 1, uploadIds: ["upload-1"] });
          queueMicrotask(() => this.onload?.());
        } else {
          // A permanent 4xx (e.g. file too large) — not a transient network blip,
          // so the client fails it immediately instead of auto-retrying.
          this.status = 400;
          this.responseText = JSON.stringify({ error: "file too large" });
          queueMicrotask(() => this.onload?.());
        }
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakePartialFailureXHR as unknown as typeof XMLHttpRequest);

    renderUploadPage();

    fireEvent.change(await screen.findByLabelText("Numele tău *"), { target: { value: "Maria Ionescu" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "maria@example.com" } });
    fireEvent.click(screen.getByLabelText("Accept prelucrarea datelor cu caracter personal *"));
    fireEvent.click(screen.getByRole("button", { name: /Continuă/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /\+ Alege poze/i })).toBeInTheDocument());

    const fileA = new File(["a"], "reuseste.jpg", { type: "image/jpeg" });
    const fileB = new File(["b"], "esueaza.jpg", { type: "image/jpeg" });
    const uploadButton = screen.getByRole("button", { name: /\+ Alege poze/i });
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "input") {
        const input = document.createElementNS("http://www.w3.org/1999/xhtml", "input") as HTMLInputElement;
        Object.defineProperty(input, "files", {
          configurable: true,
          value: {
            0: fileA,
            1: fileB,
            length: 2,
            item: (index: number) => [fileA, fileB][index] ?? null,
          },
        });
        queueMicrotask(() => input.dispatchEvent(new Event("change")));
        return input;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    fireEvent.click(uploadButton);
    fireEvent.click(await screen.findByRole("button", { name: /Trimite 2 fișier/i }));

    await waitFor(() => {
      expect(FakePartialFailureXHR.instances).toHaveLength(2);
    });

    expect(await screen.findByText(/1 din 2 fișiere nu s-au trimis/i)).toBeInTheDocument();
    // The succeeded file is dropped from the selection; only the failed one
    // remains, ready to retry with the same "Trimite" button.
    expect(screen.getByText(/1 fișier\(e\) selectate/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Trimite 1 fișier/i })).toBeInTheDocument();

    createElementSpy.mockRestore();
  });

  test("copies every selected file before the picker input is removed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ bride: "Ana", groom: "Dan", isOpen: true, deadline: "2028-03-28T01:00:00.000Z" }),
      })
      .mockResolvedValueOnce({ json: async () => ({ guestId: "guest-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    renderUploadPage();
    fireEvent.change(await screen.findByLabelText("Numele tău *"), { target: { value: "Maria Ionescu" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "maria@example.com" } });
    fireEvent.click(screen.getByLabelText("Accept prelucrarea datelor cu caracter personal *"));
    fireEvent.click(screen.getByLabelText("Sunt de acord să primesc notificări prin email (opțional)"));
    fireEvent.click(screen.getByRole("button", { name: /Continuă/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /\+ Alege poze/i })).toBeInTheDocument());

    const files = [
      new File(["a"], "prima.jpg", { type: "image/jpeg" }),
      new File(["b"], "a-doua.jpg", { type: "image/jpeg" }),
      new File(["c"], "a-treia.jpg", { type: "image/jpeg" }),
    ];
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "input") {
        const input = document.createElementNS("http://www.w3.org/1999/xhtml", "input") as HTMLInputElement;
        const fileList = {
          0: files[0],
          1: files[1],
          2: files[2],
          length: files.length,
          item: (index: number) => files[index] ?? null,
        };
        Object.defineProperty(input, "files", { configurable: true, value: fileList });

        // Model a browser that clears FileList when the input is detached.
        const originalRemoveChild = document.body.removeChild.bind(document.body);
        vi.spyOn(document.body, "removeChild").mockImplementation((node) => {
          if (node === input) {
            Object.defineProperty(input, "files", {
              configurable: true,
              value: { length: 0, item: () => null },
            });
          }
          return originalRemoveChild(node);
        });
        queueMicrotask(() => input.dispatchEvent(new Event("change")));
        return input;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: /\+ Alege poze/i }));
    expect(await screen.findByText(/3 fișier\(e\) selectate/i)).toBeInTheDocument();
    createElementSpy.mockRestore();
    vi.restoreAllMocks();
  });

  test("loads comments only with eventSlug and pin in the gallery", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          groups: [
            {
              guest: { id: "guest-1", name: "Maria", hasEmail: false },
              uploads: [
                {
                  id: "upload-1",
                  type: "photo",
                  bunnyUrl: "https://cdn.example.com/photo.jpg",
                  mimeType: "image/jpeg",
                  originalName: "photo.jpg",
                  createdAt: "2028-03-27T10:00:00.000Z",
                  thankedAt: null,
                },
              ],
            },
          ],
          quickReplies: [],
        }),
      })
      // view-notify call fires when AssetModal mounts for a photo
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({
        json: async () => ({
          comments: [],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/qr-moments/27martie2028/gallery"]}>
        <Routes>
          <Route path="/qr-moments/:eventSlug/gallery" element={<QRMomentsGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("ex: AB12CD"), { target: { value: "PIN123" } });
    fireEvent.click(screen.getByRole("button", { name: /Intră în galerie/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Deschide photo.jpg" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/qr-moments/comment/upload-1?eventSlug=27martie2028&pin=PIN123",
        expect.any(Object),
      );
    });
  });

  test("renders the unsubscribe confirmation page", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          json: async () => ({
            ok: true,
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <MemoryRouter initialEntries={["/qr-moments/unsubscribe/guest-1"]}>
          <Routes>
            <Route path="/qr-moments/unsubscribe/:guestId" element={<QRMomentsUnsubscribePage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByText(/Te-ai dezabonat cu succes/i)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith("/api/qr-moments/unsubscribe/guest-1");
    });
});
