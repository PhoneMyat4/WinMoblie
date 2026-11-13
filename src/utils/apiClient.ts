/**
 * Centralized API Client
 * Attaches the signed-in user's Firebase Authentication ID token to all backend /api/* requests.
 */
import { auth } from '../lib/firebase';

export async function getAuthHeadersAsync(headers: HeadersInit = {}): Promise<Headers> {
  const h = new Headers(headers);
  if (!h.has('authorization')) {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        h.set('Authorization', `Bearer ${idToken}`);
      }
    } catch {
      // Ignore token retrieval error if offline or unauthenticated
    }
  }
  return h;
}

export function getAuthHeaders(headers: HeadersInit = {}): Headers {
  return new Headers(headers);
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = await getAuthHeadersAsync(init.headers);
  return fetch(input, {
    ...init,
    headers,
  });
}
