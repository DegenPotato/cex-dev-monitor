/**
 * Authenticated Fetch Wrapper
 * 
 * Ensures all API calls include credentials for cookie-based authentication.
 * This prevents JWT authentication failures by always sending cookies.
 */

import { config } from '../../config';

interface FetchOptions extends Omit<RequestInit, 'credentials'> {
  // Force credentials to always be included
}

/**
 * Fetch with authentication credentials always included
 * @param url - The URL to fetch (can be relative or absolute)
 * @param options - Standard fetch options (credentials will be added automatically)
 */
export async function fetchWithAuth(url: string, options?: FetchOptions): Promise<Response> {
  // Build full URL if relative
  const fullUrl = url.startsWith('http') ? url : `${config.apiUrl}${url}`;
  
  // Always include credentials for cookie-based auth
  return fetch(fullUrl, {
    ...options,
    credentials: 'include' // Always send cookies
  });
}

/**
 * Authenticated GET request
 */
export async function getWithAuth(url: string, options?: FetchOptions): Promise<Response> {
  return fetchWithAuth(url, {
    ...options,
    method: 'GET'
  });
}

/**
 * Authenticated POST request
 */
export async function postWithAuth(url: string, body?: any, options?: FetchOptions): Promise<Response> {
  return fetchWithAuth(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

/**
 * Authenticated DELETE request
 */
export async function deleteWithAuth(url: string, options?: FetchOptions): Promise<Response> {
  return fetchWithAuth(url, {
    ...options,
    method: 'DELETE'
  });
}

/**
 * Authenticated PUT request
 */
export async function putWithAuth(url: string, body?: any, options?: FetchOptions): Promise<Response> {
  return fetchWithAuth(url, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

/**
 * Helper to handle JSON responses with error checking
 */
export async function fetchJsonWithAuth<T = any>(url: string, options?: FetchOptions): Promise<T> {
  const response = await fetchWithAuth(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }
  
  return response.json();
}

// Export a default object for convenience
export default {
  fetch: fetchWithAuth,
  get: getWithAuth,
  post: postWithAuth,
  delete: deleteWithAuth,
  put: putWithAuth,
  json: fetchJsonWithAuth
};
