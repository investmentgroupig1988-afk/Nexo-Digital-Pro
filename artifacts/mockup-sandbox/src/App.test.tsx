import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAccount: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  getAdminAudit: vi.fn(),
  getAdminUsers: vi.fn(),
  grantLifetimeAccess: vi.fn(),
  revokeAccess: vi.fn(),
  restoreAccess: vi.fn(),
  setUserBlocked: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => api);
vi.mock("@/components/market/MarketDashboard", () => ({ MarketDashboard: () => <div>Panel de análisis con acceso</div> }));
vi.mock("@/components/access/AdminPanel", () => ({ AdminPanel: () => <div>Administración protegida</div> }));

import App from "./App";

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
      status: hasAccess ? "ACTIVE" : null,
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
});

afterEach(() => cleanup());

describe("commercial access shell", () => {
  it("shows the public landing when there is no valid session", async () => {
    api.getAccount.mockRejectedValue(new Error("not signed in"));
    renderApp();
    expect(await screen.findByText("Founders Lifetime · USD 27")).toBeTruthy();
    expect(screen.getByText("Compra próximamente")).toBeTruthy();
  });

  it("keeps a signed-in user without entitlement out of the private panel", async () => {
    api.getAccount.mockResolvedValue(account(false));
    renderApp();
    expect(await screen.findByText("Sin acceso privado")).toBeTruthy();
    expect(screen.queryByText("Panel de análisis con acceso")).toBeNull();
  });

  it("opens the analysis panel only after the server reports active access", async () => {
    api.getAccount.mockResolvedValue(account(true));
    renderApp();
    await screen.findByText("Founders Lifetime");
    fireEvent.click(screen.getByText("Abrir panel privado"));
    expect(await screen.findByText("Panel de análisis con acceso")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("only exposes the administration navigation to a reported administrator", async () => {
    api.getAccount.mockResolvedValue(account(false, "admin"));
    renderApp();
    expect(await screen.findByText("Sin acceso privado")).toBeTruthy();
    fireEvent.click(screen.getByText("Admin"));
    expect(await screen.findByText("Administración protegida")).toBeTruthy();
    expect(screen.queryByText("Panel de análisis con acceso")).toBeNull();
  });
});
