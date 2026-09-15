/**
 * Centralized API Client
 * Automatically attaches API authentication token to all backend /api/* requests.
 */

export const API_AUTH_TOKEN: string =
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_API_TOKEN) ||
  'pos_sec_token_9938148';

export function getAuthHeaders(headers: HeadersInit = {}): Headers {
  const h = new Headers(headers);
  if (!h.has('x-api-key') && !h.has('authorization')) {
    h.set('x-api-key', API_AUTH_TOKEN);
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
