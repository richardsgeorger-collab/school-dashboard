// Hand-written helpers for every Edge Function (not generated). The service-role client bypasses RLS: it is used
// only after the caller's JWT has been verified, and only for that caller's rows.
import { createClient } from 'npm:@supabase/supabase-js@2';

export const admin = () => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, stripe-signature' };

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

/** The signed-in user behind a request, from its Authorization header, or null. */
export async function userFromRequest(req: Request): Promise<{ id: string; email: string | null } | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await admin().auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Wraps a handler so an unexpected throw becomes a JSON error with its message, logged, instead of a bare 500 the
 * app can only show as "something went wrong". Stripe's own errors carry a readable message.
 */
export const guard = (handler: (req: Request) => Promise<Response>) => async (req: Request): Promise<Response> => {
  try {
    return await handler(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('unhandled', message);
    return json(500, { error: message });
  }
};
