import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isErrorResponse } from '@/lib/apiAuth';

/**
 * POST /api/account/activate
 * Called by the set-password page after an invited admin has chosen a password.
 * requireAdmin() verifies the bearer token and promotes a confirmed pending profile to
 * 'active'; reaching this point means the caller now holds an active admin profile.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (isErrorResponse(ctx)) return ctx;

  await ctx.admin
    .from('user_profiles')
    .update({ status: 'active', last_login: new Date().toISOString() })
    .eq('id', ctx.user.id);

  return NextResponse.json({ success: true });
}
