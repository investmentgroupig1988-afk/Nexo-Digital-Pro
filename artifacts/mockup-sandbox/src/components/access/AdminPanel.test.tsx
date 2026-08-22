import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAdminAudit: vi.fn(),
  getAdminPaymentRequests: vi.fn(),
  getAdminUsers: vi.fn(),
  grantManualAccess: vi.fn(),
  restoreAccess: vi.fn(),
  reviewPaymentRequest: vi.fn(),
  revokeAccess: vi.fn(),
  setUserBlocked: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => api);

import { AdminPanel } from "./AdminPanel";

const member = {
  id: "member-1",
  email: "member@example.test",
  username: "member",
  role: "user",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: null,
  access: { hasAccess: false, plan: null, accessType: null, status: null, grantedAt: null, expiresAt: null },
};
const account = {
  user: { id: "admin-1", email: "admin@example.test", username: "admin", name: "Admin", role: "admin", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null },
  access: { hasAccess: false, plan: null, accessType: null, status: null, grantedAt: null, expiresAt: null },
};
const paymentRequest = {
  id: "2c9d5cf7-a31c-42ab-a3a1-02cce5e241a9",
  userId: member.id,
  user: { id: member.id, email: member.email, username: member.username },
  reviewer: null,
  method: "USDT_TRC20",
  amount: "27.00000000",
  currency: "USDT",
  declaredPaidAt: "2026-01-02T00:00:00.000Z",
  referenceOrTxid: "a".repeat(64),
  payerName: null,
  senderWallet: null,
  proof: { fileName: "comprobante.pdf", mimeType: "application/pdf", size: 1200, url: "/api/payment-requests/2c9d5cf7-a31c-42ab-a3a1-02cce5e241a9/proof" },
  status: "PENDING",
  notes: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: "2026-01-02T00:05:00.000Z",
  updatedAt: "2026-01-02T00:05:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getAdminUsers.mockResolvedValue({ users: [member] });
  api.getAdminPaymentRequests.mockResolvedValue({ requests: [paymentRequest] });
  api.getAdminAudit.mockResolvedValue({ audit: [] });
  api.reviewPaymentRequest.mockResolvedValue({ request: { ...paymentRequest, status: "APPROVED" }, grantId: "grant-1" });
  api.grantManualAccess.mockResolvedValue({ access: { hasAccess: true } });
});

afterEach(() => cleanup());

describe("administración de pagos y accesos", () => {
  it("shows every review field and keeps the mobile shell from overflowing", async () => {
    const { container } = renderPanel();
    expect(await screen.findByRole("heading", { name: "Solicitudes de pago" })).toBeTruthy();
    expect((await screen.findAllByText(member.username)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(member.email)).length).toBeGreaterThan(0);
    expect(await screen.findByText("comprobante.pdf · 2 KB")).toBeTruthy();
    expect(screen.getByText("Aprobar y conceder acceso")).toBeTruthy();
    expect(screen.getByText("Solicitar más información")).toBeTruthy();
    expect(container.querySelector("main")?.className).toContain("overflow-x-hidden");
  });

  it("sends approval through the administrative review endpoint", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar y conceder acceso" }));
    await waitFor(() => expect(api.reviewPaymentRequest).toHaveBeenCalledWith(paymentRequest.id, "APPROVED", undefined));
  });

  it("can prepare a temporary PARTNER grant without changing a role", async () => {
    renderPanel();
    const form = await screen.findByRole("button", { name: "Conceder" }).then((button) => button.closest("form"));
    expect(form).toBeTruthy();
    const selects = within(form as HTMLFormElement).getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: member.id } });
    fireEvent.change(selects[1], { target: { value: "PARTNER" } });
    fireEvent.submit(form as HTMLFormElement);
    await waitFor(() => expect(api.grantManualAccess).toHaveBeenCalledWith(member.id, expect.objectContaining({ plan: "PARTNER" })));
  });

  it("keeps row actions touch-friendly and translates internal audit event names", async () => {
    api.getAdminAudit.mockResolvedValue({ audit: [{ id: "audit-1", action: "ROLE_CHANGED", actor: account.user, target: member, createdAt: "2026-01-03T00:00:00.000Z" }] });
    renderPanel();

    expect((await screen.findByRole("button", { name: "Bloquear" })).className).toContain("min-h-11");
    expect(await screen.findByText("Rol modificado")).toBeTruthy();
    expect(screen.queryByText("ROLE_CHANGED")).toBeNull();
  });

  it("shows a clear message when recent activity cannot be loaded", async () => {
    api.getAdminAudit.mockRejectedValue(new Error("network unavailable"));
    renderPanel();
    expect(await screen.findByText("No se pudo cargar la actividad reciente.")).toBeTruthy();
  });
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminPanel account={account} onAccount={() => {}} /></QueryClientProvider>);
}
