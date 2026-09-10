/*
 * Purpose: verifies the expenses API — field validation, hash/invoice dedup,
 * deductible amount calculation, and Bunny upload error handling — without
 * hitting Firestore or external services.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Handler = (req: any, res: any, next?: any) => Promise<void> | void;

function createMockResponse() {
  const res = { status: vi.fn(), json: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

function makeEmptySnap() {
  return { empty: true, docs: [] };
}
function makeDocSnap(id: string, data: Record<string, unknown> = {}) {
  return { empty: false, docs: [{ id, data: () => data }] };
}

async function loadExpensesRouter(opts: { docData?: Record<string, unknown> | null } = {}) {
  const addMock = vi.fn().mockResolvedValue({ id: "new-expense-id" });
  const deleteMock = vi.fn().mockResolvedValue(undefined);
  const updateMock = vi.fn().mockResolvedValue(undefined);
  const docExists = opts.docData !== null;
  const docGetMock = vi.fn().mockResolvedValue({
    exists: docExists,
    data: () => opts.docData ?? undefined,
  });

  // Per-query mocks — start with "no duplicates"
  const whereSnapMock = vi.fn().mockResolvedValue(makeEmptySnap());
  const getCollectionMock = vi.fn().mockResolvedValue({ docs: [] });

  const limitMock = vi.fn(() => ({ get: whereSnapMock }));
  const whereMock = vi.fn(() => ({ limit: limitMock, get: whereSnapMock }));
  const orderByMock = vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }), where: whereMock }));

  const docMock = vi.fn((id: string) => ({
    delete: () => deleteMock(id),
    get: () => docGetMock(id),
    update: (patch: Record<string, unknown>) => updateMock(id, patch),
  }));

  const collectionMock = vi.fn(() => ({
    add: addMock,
    where: whereMock,
    get: getCollectionMock,
    orderBy: orderByMock,
    doc: docMock,
  }));

  vi.doMock("src/server/middleware/requireFirebaseAuth", () => ({
    requireFirebaseAuth: (_req: any, _res: any, next: () => void) => next(),
    requireSupremeAdmin: (_req: any, _res: any, next: () => void) => next(),
  }));

  vi.doMock("src/server/firestore", () => ({
    firestore: () => ({ collection: collectionMock }),
  }));

  vi.doMock("src/server/constants/bunny", () => ({
    BUNNY_ACCESS_KEY_HEADER: "AccessKey",
    BUNNY_STORAGE_BASE_URL: "https://storage.bunnycdn.com",
    getBunnyStorageZone: () => "test-zone",
    getBunnyStoragePassword: () => "secret",
  }));

  // Mock Anthropic to avoid API key requirements
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class {
      messages = { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "{}" }] }) };
    },
  }));

  vi.doMock("firebase-admin/firestore", () => ({
    Timestamp: {
      fromDate: (d: Date) => ({ toDate: () => d, _seconds: d.getTime() / 1000 }),
      now: () => ({ toDate: () => new Date(), _seconds: Date.now() / 1000 }),
    },
  }));

  const module = await import("src/server/routes/expenses.routes");
  const router = module.default as any;

  const getHandler = (method: "get" | "post" | "delete" | "patch", path: string): Handler => {
    const layer = router.stack.find(
      (entry: any) => entry.route?.path === path && entry.route.methods?.[method],
    );
    if (!layer) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  };

  return {
    addMock,
    deleteMock,
    updateMock,
    docGetMock,
    whereSnapMock,
    getCollectionMock,
    whereMock,
    collectionMock,
    postCreate: getHandler("post", "/"),
    getList: getHandler("get", "/"),
    deleteExpense: getHandler("delete", "/:id"),
    patchExpense: getHandler("patch", "/:id"),
  };
}

describe("expenses routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("POST / — create expense", () => {
    test("returns 400 when required fields are missing", async () => {
      const { postCreate } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate({ body: { category: "combustibil" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    test("creates expense and returns 201 with id", async () => {
      const { postCreate, addMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate(
        { body: { date: "2026-05-01", category: "combustibil", amount: 200, deductibility: 50 } },
        res,
      );
      expect(addMock).toHaveBeenCalledOnce();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: "new-expense-id" });
    });

    test("calculates deductibleAmount correctly", async () => {
      const { postCreate, addMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate(
        { body: { date: "2026-05-01", category: "combustibil", amount: 300, deductibility: 50 } },
        res,
      );
      const saved = addMock.mock.calls[0][0];
      expect(saved.deductibleAmount).toBe(150);
    });

    test("a fixed deductibleAmount overrides the percentage and back-derives deductibility", async () => {
      const { postCreate, addMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate(
        { body: { date: "2026-01-12", category: "altele", amount: 165, deductibility: 50, deductibleAmount: 40 } },
        res,
      );
      const saved = addMock.mock.calls[0][0];
      expect(saved.deductibleAmount).toBe(40);
      expect(saved.deductibility).toBeCloseTo(24.24, 2);
    });

    test("a fixed deductibleAmount is clamped to the invoice total", async () => {
      const { postCreate, addMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate(
        { body: { date: "2026-01-12", category: "altele", amount: 165, deductibility: 50, deductibleAmount: 999 } },
        res,
      );
      const saved = addMock.mock.calls[0][0];
      expect(saved.deductibleAmount).toBe(165);
      expect(saved.deductibility).toBe(100);
    });

    test("accepts a fixed deductibleAmount even without a percentage", async () => {
      const { postCreate, addMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate(
        { body: { date: "2026-01-12", category: "altele", amount: 200, deductibleAmount: 50 } },
        res,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(addMock.mock.calls[0][0].deductibleAmount).toBe(50);
    });

    test("returns 409 DUPLICATE_FILE when file hash already exists", async () => {
      const { postCreate, whereSnapMock } = await loadExpensesRouter();
      whereSnapMock.mockResolvedValue(makeDocSnap("existing-id"));

      const res = createMockResponse();
      await postCreate(
        {
          body: {
            date: "2026-05-01",
            category: "combustibil",
            amount: 100,
            deductibility: 50,
            factura: { url: "https://cdn/f.pdf", name: "f.pdf", hash: "abc123" },
          },
        },
        res,
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "DUPLICATE_FILE" }));
    });

    test("returns 409 DUPLICATE_INVOICE_NUMBER when invoice number exists", async () => {
      const { postCreate, getCollectionMock } = await loadExpensesRouter();
      getCollectionMock.mockResolvedValueOnce({
        docs: [{ id: "existing-inv", data: () => ({ invoiceNumber: "Factura FA 2026/001", supplier: "Identia SRL" }) }],
      });

      const res = createMockResponse();
      await postCreate(
        {
          body: {
            date: "2026-05-01",
            category: "combustibil",
            amount: 100,
            deductibility: 50,
            invoiceNumber: "FA-2026-001",
            supplier: "IDENTIA S.R.L.",
          },
        },
        res,
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "DUPLICATE_INVOICE_NUMBER" }));
    });

    test("defaults currency to RON when not provided", async () => {
      const { postCreate, addMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await postCreate(
        { body: { date: "2026-05-01", category: "combustibil", amount: 100, deductibility: 100 } },
        res,
      );
      expect(addMock.mock.calls[0][0].currency).toBe("RON");
    });
  });

  describe("DELETE /:id", () => {
    test("deletes expense and returns ok", async () => {
      const { deleteExpense, deleteMock } = await loadExpensesRouter();
      const res = createMockResponse();
      await deleteExpense({ params: { id: "expense-abc" } }, res);
      expect(deleteMock).toHaveBeenCalledWith("expense-abc");
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("PATCH /:id — fix the deductible part", () => {
    test("sets a corrected deductibleAmount and re-derives the percentage", async () => {
      const { patchExpense, updateMock } = await loadExpensesRouter({ docData: { amount: 165 } });
      const res = createMockResponse();
      await patchExpense({ params: { id: "e1" }, body: { deductibleAmount: 40 } }, res);
      expect(updateMock).toHaveBeenCalledWith("e1", { deductibleAmount: 40, deductibility: 24.24 });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deductibleAmount: 40 }));
    });

    test("clamps the corrected amount to the invoice total", async () => {
      const { patchExpense, updateMock } = await loadExpensesRouter({ docData: { amount: 165 } });
      await patchExpense({ params: { id: "e1" }, body: { deductibleAmount: 999 } }, createMockResponse());
      expect(updateMock).toHaveBeenCalledWith("e1", { deductibleAmount: 165, deductibility: 100 });
    });

    test("accepts a percentage and derives the amount", async () => {
      const { patchExpense, updateMock } = await loadExpensesRouter({ docData: { amount: 200 } });
      await patchExpense({ params: { id: "e1" }, body: { deductibility: 50 } }, createMockResponse());
      expect(updateMock).toHaveBeenCalledWith("e1", { deductibleAmount: 100, deductibility: 50 });
    });

    test("returns 404 for a missing expense", async () => {
      const { patchExpense } = await loadExpensesRouter({ docData: null });
      const res = createMockResponse();
      await patchExpense({ params: { id: "nope" }, body: { deductibleAmount: 10 } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("returns 400 when neither field is provided", async () => {
      const { patchExpense } = await loadExpensesRouter({ docData: { amount: 100 } });
      const res = createMockResponse();
      await patchExpense({ params: { id: "e1" }, body: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("POST /scan-receipt", () => {
    test("returns 400 when fileBase64 or mediaType is missing", async () => {
      const module = await import("src/server/routes/expenses.routes");
      const router = module.default as any;

      const layer = router.stack.find(
        (entry: any) => entry.route?.path === "/scan-receipt" && entry.route.methods?.post,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;

      const res = createMockResponse();
      await handler({ body: { fileBase64: "abc" } }, res); // missing mediaType
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("returns 400 for unsupported media type", async () => {
      const module = await import("src/server/routes/expenses.routes");
      const router = module.default as any;

      const layer = router.stack.find(
        (entry: any) => entry.route?.path === "/scan-receipt" && entry.route.methods?.post,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;

      const res = createMockResponse();
      await handler({ body: { fileBase64: "abc", mediaType: "text/plain" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
