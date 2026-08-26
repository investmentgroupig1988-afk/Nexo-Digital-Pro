import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {},
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
    expect(await screen.findByRole("heading", { name: "Señales claras para seguir BTC con más contexto." })).toBeTruthy();
    expect(screen.getByText("USD 27")).toBeTruthy();
    expect(screen.getByText("pago único")).toBeTruthy();
    expect(screen.getByText("BTC")).toBeTruthy();
    expect(screen.getByText("XAUUSD")).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Señales claras" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Datos reales" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Contexto real" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/win rate|p&l|rentabilidad garantizada|clientes activos/i);
  }, 15_000);

  it("connects public calls to action with registration and login", async () => {
    api.getAccount.mockRejectedValue(new Error("not signed in"));
    renderApp();
    const registerButtons = await screen.findAllByRole("button", { name: "Crear cuenta" });
    fireEvent.click(registerButtons[0]);
    expect(await screen.findByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
    const back = screen.getByText("← Volver");
    expect(back.className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Iniciá sesión" }).className).toContain("min-h-11");
    fireEvent.click(back);
    const loginButtons = await screen.findAllByRole("button", { name: "Iniciar sesión" });
    fireEvent.click(loginButtons[0]);
    expect(await screen.findByRole("heading", { name: "Iniciá sesión" })).toBeTruthy();
  });

  it("keeps the login visible when the server cannot confirm the new session", async () => {
    api.getAccount.mockRejectedValue(new Error("network unavailable"));
    api.login.mockResolvedValue({ user: account(false).user });
    renderApp();
    fireEvent.click((await screen.findAllByRole("button", { name: "Iniciar sesión" }))[0]);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "member@example.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo iniciar sesión. Intentá nuevamente.");
    expect(screen.getByRole("heading", { name: "Iniciá sesión" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Señales claras para seguir BTC con más contexto." })).toBeNull();
  });

  it("opens FAQ and exposes the published legal routes", async () => {
    api.getAccount.mockRejectedValue(new Error("not signed in"));
    renderApp();
    const question = await screen.findByText("¿TRENORO ejecuta operaciones?");
    fireEvent.click(question);
    expect(screen.getByText(/cada usuario decide si opera/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reembolsos" }).getAttribute("href")).toBe("/reembolsos");
    expect(screen.getByRole("link", { name: "BOTÓN DE ARREPENTIMIENTO" }).getAttribute("href")).toBe("/arrepentimiento");
    expect(screen.getByRole("link", { name: "BOTÓN DE BAJA DE SERVICIO" }).getAttribute("href")).toBe("/baja-de-servicio");
  });

  it("keeps a signed-in user without entitlement out of the private panel", async () => {
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    expect(await screen.findByText("Sin acceso privado")).toBeTruthy();
    expect(screen.queryByText("Panel de análisis con acceso")).toBeNull();
    expect(await screen.findByRole("button", { name: "Obtener acceso" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Obtener acceso" }));
    expect((screen.getByRole("button", { name: /Transferencia Argentina/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Próximamente · deshabilitado")).toBeTruthy();
    const whatsapp = screen.getByLabelText("WhatsApp de contacto") as HTMLInputElement;
    expect(whatsapp.required).toBe(true);
    expect(whatsapp.type).toBe("tel");
    expect(whatsapp.inputMode).toBe("tel");
    expect(whatsapp.placeholder).toBe("+54 9 223 123 4567");
    expect(screen.getByText("Lo utilizaremos únicamente si necesitamos contactarte por esta solicitud o verificar el pago.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /WHATSAPP/ })).toBeNull();
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

  it("requires WhatsApp in the saved request and keeps the support shortcut separate", async () => {
    const request = pendingRequest();
    api.getAccount.mockResolvedValue(account(false));
    api.createPaymentRequest.mockResolvedValue({ request, whatsappUrl: "https://wa.me/5491151550781?text=saved-request" });
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.change(screen.getByLabelText("TXID"), { target: { value: "a".repeat(64) } });
    fireEvent.change(screen.getByLabelText("WhatsApp de contacto"), { target: { value: "+54 9 223 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: "SOLICITAR ACCESO" }));

    await waitFor(() => expect(api.createPaymentRequest).toHaveBeenCalledTimes(1));
    expect(api.createPaymentRequest.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ whatsappNumber: "+54 9 223 123 4567" }));
    expect(window.open).not.toHaveBeenCalled();
    expect(await screen.findByText("Solicitud enviada / En revisión")).toBeTruthy();
    expect(screen.getByText("Tu solicitud quedó guardada correctamente. Si necesitamos verificar algún dato del pago, podremos contactarte al WhatsApp informado.")).toBeTruthy();
    const enabledContact = screen.getByRole("button", { name: "ABRIR WHATSAPP" });
    expect((enabledContact as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enabledContact);
    expect(window.open).toHaveBeenCalledWith("https://wa.me/5491151550781?text=saved-request", "_blank", "noopener,noreferrer");
    expect(api.createPaymentRequest).toHaveBeenCalledTimes(1);
  });

  it("normalizes an omitted USDT sender wallet to null", async () => {
    api.getAccount.mockResolvedValue(account(false));
    api.createPaymentRequest.mockResolvedValue({ request: pendingRequest(), whatsappUrl: "https://wa.me/example" });
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.change(screen.getByLabelText("TXID"), { target: { value: "a".repeat(64) } });
    fireEvent.change(screen.getByLabelText("Wallet remitente (opcional)"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("WhatsApp de contacto"), { target: { value: "+54 9 223 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: "SOLICITAR ACCESO" }));

    await waitFor(() => expect(api.createPaymentRequest).toHaveBeenCalledTimes(1));
    expect(api.createPaymentRequest.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ senderWallet: null }));
  });

  it("trims an informed valid USDT sender wallet before submission", async () => {
    const wallet = "TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS";
    api.getAccount.mockResolvedValue(account(false));
    api.createPaymentRequest.mockResolvedValue({ request: { ...pendingRequest(), senderWallet: wallet }, whatsappUrl: "https://wa.me/example" });
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.change(screen.getByLabelText("TXID"), { target: { value: "b".repeat(64) } });
    fireEvent.change(screen.getByLabelText("Wallet remitente (opcional)"), { target: { value: `  ${wallet}  ` } });
    fireEvent.change(screen.getByLabelText("WhatsApp de contacto"), { target: { value: "+54 9 223 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: "SOLICITAR ACCESO" }));

    await waitFor(() => expect(api.createPaymentRequest).toHaveBeenCalledTimes(1));
    expect(api.createPaymentRequest.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ senderWallet: wallet }));
  });

  it("shows the API validation error for an invalid informed USDT wallet", async () => {
    api.getAccount.mockResolvedValue(account(false));
    api.createPaymentRequest.mockRejectedValue(new Error("HTTP 400 Bad Request: La wallet remitente de TRC20 no es válida."));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    fireEvent.click(screen.getByRole("button", { name: /USDT TRC20/i }));
    fireEvent.change(screen.getByLabelText("TXID"), { target: { value: "c".repeat(64) } });
    fireEvent.change(screen.getByLabelText("Wallet remitente (opcional)"), { target: { value: "invalid-wallet" } });
    fireEvent.change(screen.getByLabelText("WhatsApp de contacto"), { target: { value: "+54 9 223 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: "SOLICITAR ACCESO" }));

    expect((await screen.findByRole("alert")).textContent).toBe("La wallet remitente de TRC20 no es válida.");
  });

  it("keeps a pending request idempotent without inventing a support shortcut", async () => {
    api.getAccount.mockResolvedValue(account(false));
    api.getMyPaymentRequests.mockResolvedValue({ requests: [pendingRequest()] });
    renderApp();
    expect(await screen.findByRole("heading", { name: "Solicitud en revisión" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Obtener acceso" })).toBeNull();
    expect(screen.queryByRole("button", { name: "SOLICITUD ENVIADA" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("SOLICITUD ENVIADA");
    expect(screen.queryByRole("button", { name: /WHATSAPP/ })).toBeNull();
    expect(api.createPaymentRequest).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("blocks a new payment request while the saved request status cannot be loaded", async () => {
    api.getAccount.mockResolvedValue(account(false));
    api.getMyPaymentRequests.mockRejectedValue(new Error("network unavailable"));
    renderApp();

    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos consultar el estado de tus solicitudes.");
    expect(screen.queryByRole("button", { name: "Obtener acceso" })).toBeNull();

    api.getMyPaymentRequests.mockResolvedValue({ requests: [] });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Obtener acceso" })).toBeTruthy();
  });

  it("keeps payment controls touch-friendly and contains horizontal overflow at mobile width", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    const requestButton = screen.getByRole("button", { name: "SOLICITAR ACCESO" });
    const whatsappInput = screen.getByLabelText("WhatsApp de contacto");
    expect(requestButton.className).toContain("min-h-12");
    expect(whatsappInput.className).toContain("min-h-12");
    expect(document.querySelector("main")?.className).toContain("overflow-x-hidden");
  });

  it("keeps Argentina unavailable in the browser while its explicit feature flag is off", async () => {
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Obtener acceso" }));
    const argentina = screen.getByRole("button", { name: /Transferencia Argentina/i });
    expect((argentina as HTMLButtonElement).disabled).toBe(true);
    expect(argentina.textContent).toContain("deshabilitado");
    expect(screen.queryByText("0000003100075319042852")).toBeNull();
    expect(screen.queryByText(/^Pendiente de configuración$/i)).toBeNull();
    expect(screen.queryByText(/^TODO$/i)).toBeNull();
    expect(screen.queryByText(/^\[COMPLETAR\]$/i)).toBeNull();
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
