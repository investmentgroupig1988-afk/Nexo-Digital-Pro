import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAccount: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  getAdminAudit: vi.fn(),
  getAdminUsers: vi.fn(),
  getAdminPaymentRequests: vi.fn(),
  getMyPaymentRequests: vi.fn(),
  createPaymentRequest: vi.fn(),
  reviewPaymentRequest: vi.fn(),
  getPaymentProof: vi.fn(),
  grantManualAccess: vi.fn(),
  grantLifetimeAccess: vi.fn(),
  revokeAccess: vi.fn(),
  restoreAccess: vi.fn(),
  setUserBlocked: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => api);
vi.mock("@/components/market/MarketDashboard", () => ({ MarketDashboard: () => <div>Panel de análisis con acceso</div> }));
vi.mock("@/components/access/AdminPanel", () => ({ AdminPanel: () => <div>Administración protegida</div> }));

import App from "./App";

const clipboardWriteText = vi.fn();

function pendingRequest() {
  return {
    id: "5db27aa4-9c43-4ac5-bb7d-5694b1d54150",
    userId: "user-1",
    method: "USDT_TRC20",
    amount: "27.00000000",
    currency: "USDT",
    declaredPaidAt: "2026-01-03T00:00:00.000Z",
    referenceOrTxid: "a".repeat(64),
    payerName: null,
    senderWallet: null,
    proof: null,
    status: "PENDING",
    notes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  };
}

function account(hasAccess: boolean, role: "user" | "admin" = "user") {
  return {
    user: {
      id: "user-1",
      email: "person@example.test",
      username: "person",
      name: "Person",
      role,
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
    },
    access: {
      hasAccess,
      plan: hasAccess ? "FOUNDERS_LIFETIME" : null,
      accessType: hasAccess ? "ADMIN_MANUAL" : null,
      status: hasAccess ? "active" : null,
      grantedAt: hasAccess ? "2026-01-02T00:00:00.000Z" : null,
      expiresAt: null,
    },
  };
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyPaymentRequests.mockResolvedValue({ requests: [] });
  clipboardWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboardWriteText } });
  Object.defineProperty(document, "execCommand", { configurable: true, value: undefined, writable: true });
  Object.defineProperty(window, "open", { configurable: true, value: vi.fn(), writable: true });
});

afterEach(() => cleanup());

describe("commercial access shell", () => {
  it("shows the public landing when there is no valid session", async () => {
    api.getAccount.mockRejectedValue(new Error("not signed in"));
    renderApp();
    expect(await screen.findByRole("heading", { name: "Analizá el mercado con más contexto, en un solo panel." })).toBeTruthy();
    expect(screen.getByText("USD 27")).toBeTruthy();
    expect(screen.getByText("pago único")).toBeTruthy();
    expect(screen.getByText("BTC")).toBeTruthy();
    expect(screen.getByText("XAUUSD")).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Análisis técnico" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Datos reales" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Señal técnica y contexto" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/win rate|p&l|rentabilidad garantizada|clientes activos/i);
  });

  it("connects public calls to action with registration and login", async () => {
    api.getAccount.mockRejectedValue(new Error("not signed in"));
    renderApp();
    const registerButtons = await screen.findAllByRole("button", { name: "Crear cuenta" });
    fireEvent.click(registerButtons[0]);
    expect(await screen.findByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
    fireEvent.click(screen.getByText("← Volver"));
    const loginButtons = await screen.findAllByRole("button", { name: "Iniciar sesión" });
    fireEvent.click(loginButtons[0]);
    expect(await screen.findByRole("heading", { name: "Iniciá sesión" })).toBeTruthy();
  });

  it("opens FAQ and legal information without inventing unpublished policies", async () => {
    api.getAccount.mockRejectedValue(new Error("not signed in"));
    renderApp();
    const question = await screen.findByText("¿Nexo Digital Pro ejecuta operaciones?");
    fireEvent.click(question);
    expect(screen.getByText(/cada usuario decide si opera/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Política de Reembolsos" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Documento pendiente de publicación")).toBeTruthy();
  });

  it("keeps a signed-in user without entitlement out of the private panel", async () => {
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    expect(await screen.findByText("Sin acceso privado")).toBeTruthy();
    expect(screen.queryByText("Panel de análisis con acceso")).toBeNull();
    expect(await screen.findByRole("button", { name: "Obtener acceso" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Obtener acceso" }));
    expect(screen.getByText("Mercado Pago / transferencia")).toBeTruthy();
    expect((screen.getByRole("button", { name: "CONTACTAR POR WHATSAPP" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Solicitá el acceso para poder contactar por WhatsApp.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    expect(screen.getByText("TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS")).toBeTruthy();
  });

  it("copies only the exact USDT wallet and shows temporary feedback", async () => {
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar Wallet destino · solo TRC20" }));

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith("TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS"));
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Copiado ✓")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Copiado ✓")).toBeNull(), { timeout: 2_500 });
  });

  it("uses the safe DOM fallback when Clipboard API access is denied", async () => {
    const fallbackCopy = vi.fn((command: string) => {
      expect(command).toBe("copy");
      expect((document.querySelector("textarea[aria-hidden='true']") as HTMLTextAreaElement | null)?.value).toBe("TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS");
      return true;
    });
    clipboardWriteText.mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(document, "execCommand", { configurable: true, value: fallbackCopy, writable: true });
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar Wallet destino · solo TRC20" }));

    await waitFor(() => expect(fallbackCopy).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Copiado ✓")).toBeTruthy();
    expect(document.querySelector("textarea[aria-hidden='true']")).toBeNull();
  });

  it("saves without opening WhatsApp, then enables optional contact without creating a duplicate", async () => {
    const request = pendingRequest();
    api.getAccount.mockResolvedValue(account(false));
    api.createPaymentRequest.mockResolvedValue({ request, whatsappUrl: "https://wa.me/5491151550781?text=saved-request" });
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    const disabledContact = screen.getByRole("button", { name: "CONTACTAR POR WHATSAPP" });
    expect((disabledContact as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.change(screen.getByLabelText("TXID"), { target: { value: "a".repeat(64) } });
    fireEvent.click(screen.getByRole("button", { name: "SOLICITAR ACCESO" }));

    await waitFor(() => expect(api.createPaymentRequest).toHaveBeenCalledTimes(1));
    expect(window.open).not.toHaveBeenCalled();
    expect(await screen.findByText("Solicitud enviada / En revisión")).toBeTruthy();
    const enabledContact = screen.getByRole("button", { name: /CONTACTAR POR WHATSAPP/ });
    expect((enabledContact as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enabledContact);
    expect(window.open).toHaveBeenCalledWith("https://wa.me/5491151550781?text=saved-request", "_blank", "noopener,noreferrer");
    expect(api.createPaymentRequest).toHaveBeenCalledTimes(1);
  });

  it("enables WhatsApp for an existing pending request without offering or creating a duplicate", async () => {
    api.getAccount.mockResolvedValue(account(false));
    api.getMyPaymentRequests.mockResolvedValue({ requests: [pendingRequest()] });
    renderApp();
    expect(await screen.findByRole("heading", { name: "Solicitud en revisión" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Obtener acceso" })).toBeNull();
    const contact = screen.getByRole("button", { name: /CONTACTAR POR WHATSAPP/ });
    expect((contact as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(contact);
    expect(api.createPaymentRequest).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledTimes(1);
    const openedUrl = vi.mocked(window.open).mock.calls[0]?.[0];
    expect(typeof openedUrl === "string" ? decodeURIComponent(openedUrl) : "").toContain("ID de solicitud: 5db27aa4-9c43-4ac5-bb7d-5694b1d54150");
  });

  it("keeps payment controls touch-friendly and contains horizontal overflow at mobile width", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    const requestButton = screen.getByRole("button", { name: "SOLICITAR ACCESO" });
    const contactButton = screen.getByRole("button", { name: "CONTACTAR POR WHATSAPP" });
    expect(requestButton.className).toContain("min-h-12");
    expect(contactButton.className).toContain("min-h-12");
    expect(document.querySelector("main")?.className).toContain("overflow-x-hidden");
  });

  it("opens the analysis panel only after the server reports active access", async () => {
    api.getAccount.mockResolvedValue(account(true));
    renderApp();
    await screen.findByText("Acceso Founders");
    fireEvent.click(screen.getByText("Abrir panel privado"));
    expect(await screen.findByText("Panel de análisis con acceso")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("only exposes the administration navigation to a reported administrator", async () => {
    api.getAccount.mockResolvedValue(account(false, "admin"));
    renderApp();
    expect(await screen.findByText("Sin acceso privado")).toBeTruthy();
    fireEvent.click(screen.getByText("Administración"));
    expect(await screen.findByText("Administración protegida")).toBeTruthy();
    expect(screen.queryByText("Panel de análisis con acceso")).toBeNull();
  });

  it("keeps PARTNER as a product entitlement without exposing Administration", async () => {
    const partnerAccount = account(true);
    partnerAccount.access.plan = "PARTNER";
    api.getAccount.mockResolvedValue(partnerAccount);
    renderApp();
    expect(await screen.findByText("Acceso Partner")).toBeTruthy();
    expect(screen.queryByText("Administración")).toBeNull();
  });
});
