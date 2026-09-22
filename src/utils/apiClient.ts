/**
 * Centralized API Client
 * Automatically attaches API authentication token to all backend /api/* requests.
 */

export const API_AUTH_TOKEN: string = import.meta.env.VITE_API_TOKEN || '';

export function getApiAuthToken(): string {
  try {
    const custom = localStorage.getItem('pos_custom_api_token');
    if (custom && custom.trim()) {
      return custom.trim();
    }
  } catch {
    // localStorage not accessible
  }
  return API_AUTH_TOKEN;
}

export function getAuthHeaders(headers: HeadersInit = {}): Headers {
  const h = new Headers(headers);
  const token = getApiAuthToken();
  if (!h.has('x-api-key') && !h.has('authorization') && token) {
    h.set('x-api-key', token);
  }
  return h;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = getAuthHeaders(init.headers);
  return fetch(input, {
    ...init,
    headers,
  });
}
