import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Server-only helpers for API routes that use the Supabase service-role key.
 * The key is read from SUPABASE_SERVICE_ROLE_KEY (preferred) or, for backwards
 * compatibility with existing deployments, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.
 * NOTE: a NEXT_PUBLIC_ variable is inlined into client bundles if a client
 * component references it; no client code does, and this module is server-only.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

export interface AdminContext {
  admin: SupabaseClient;
  user: User;
  isSuperAdmin: boolean;
}

export interface RequireOptions {
  /** Only a super admin may proceed. */
  superAdminOnly?: boolean;
}

/**
 * Verifies `Authorization: Bearer <supabase access token>` and that the caller has an
 * active user_profiles row (or is_super_admin). Returns either the context or a
 * ready-to-return 401/403/500 response.
 */
export async function requireAdmin(
  request: NextRequest | Request,
  options: RequireOptions = {}
): Promise<AdminContext | NextResponse> {
  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error('Service role not configured:', err);
    return NextResponse.json({ error: 'Server is not configured' }, { status: 500 });
  }

  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }
  const user = data.user;

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, status, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Profile lookup failed:', profileError);
    return NextResponse.json({ error: 'Could not verify permissions' }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'No admin profile for this user' }, { status: 403 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  let allowed = isSuperAdmin || profile.status === 'active';

  // An invited admin who has confirmed their email (they can only have a session after
  // following the invite link) but whose profile is still pending: activate now.
  if (!allowed && user.email_confirmed_at && (profile.status === 'pending' || profile.status === 'expired')) {
    const { error: activateError } = await admin
      .from('user_profiles')
      .update({ status: 'active' })
      .eq('id', user.id);
    if (activateError) {
      console.error('Profile activation failed:', activateError);
      return NextResponse.json({ error: 'Could not activate profile' }, { status: 500 });
    }
    allowed = true;
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
  }
  if (options.superAdminOnly && !isSuperAdmin) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
  }

  return { admin, user, isSuperAdmin };
}

export function isErrorResponse(x: AdminContext | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
