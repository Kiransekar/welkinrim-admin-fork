import { supabase } from './supabaseClient';

/**
 * fetch() wrapper for our /api/* admin routes: attaches the current Supabase
 * session's access token as `Authorization: Bearer <token>`.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
