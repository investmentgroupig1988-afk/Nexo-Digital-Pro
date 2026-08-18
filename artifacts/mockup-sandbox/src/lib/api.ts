import { setBaseUrl } from "@workspace/api-client-react";

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Browser requests use relative /api URLs by default. During development Vite
 * proxies those requests to the local API; in a separately hosted deployment
 * VITE_API_BASE_URL can point to the public API origin instead.
 */
export function configureApiClient(baseUrl = import.meta.env.VITE_API_BASE_URL): void {
  setBaseUrl(normalizeBaseUrl(baseUrl));
}

configureApiClient();
