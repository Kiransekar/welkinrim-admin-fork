import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isErrorResponse } from '@/lib/apiAuth';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://welkinrim-admin.vercel.app').replace(/\/+$/, '');
// Invitees land here with a Supabase session in the URL hash and set their password.
const INVITE_REDIRECT = `${siteUrl}/set-password`;

// Invite expiration: 24 hours
const INVITE_EXPIRATION_HOURS = 24;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function inviteExpiry() {
  return new Date(Date.now() + INVITE_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();
}

async function listAllAuthUsers(admin: SupabaseClient): Promise<{ users: User[]; error?: string }> {
  const users: User[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { users, error: error.message };
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return { users };
}

function failure(error: { message: string; status?: number } | string, fallbackStatus = 500) {
  const message = typeof error === 'string' ? error : error.message;
  const status = typeof error === 'string' ? fallbackStatus : error.status === 429 ? 429 : fallbackStatus;
  const hint = status === 429 ? ' (email rate limit reached - the Supabase built-in mailer only sends a few emails per hour; configure custom SMTP)' : '';
  return NextResponse.json({ error: `Invitation email could not be sent: ${message}${hint}` }, { status });
}

/**
 * Sends a real invitation email via inviteUserByEmail and (re)creates the pending profile.
 * If the address already has a never-confirmed auth user, that user (and its profile) is
 * deleted first so the invite can be sent again - inviteUserByEmail rejects existing users.
 * Returns null on success or a NextResponse describing the failure.
 */
async function sendInvite(
  admin: SupabaseClient,
  opts: { email: string; fullName: string; invitedBy: string; unconfirmedUserId?: string }
): Promise<NextResponse | null> {
  const { email, fullName, invitedBy, unconfirmedUserId } = opts;

  if (unconfirmedUserId) {
    await admin.from('user_profiles').delete().eq('id', unconfirmedUserId);
    const { error: delError } = await admin.auth.admin.deleteUser(unconfirmedUserId);
    if (delError) return failure(delError);
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: INVITE_REDIRECT,
    data: { full_name: fullName, invited_by: invitedBy },
  });
  if (error || !data?.user) {
    return failure(error ?? 'No user returned by Supabase');
  }

  // upsert: a DB trigger on auth.users may already have created a profile row
  const { error: profileError } = await admin.from('user_profiles').upsert(
    {
      id: data.user.id,
      email,
      full_name: fullName,
      role: 'admin',
      is_super_admin: false,
      invited_by: invitedBy,
      invited_at: new Date().toISOString(),
      invite_expires_at: inviteExpiry(),
      status: 'pending',
    },
    { onConflict: 'id' }
  );
  if (profileError) {
    // The email already went out, but without a profile the invitee could not use it. Roll back.
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin(request, { superAdminOnly: true });
  if (isErrorResponse(ctx)) return ctx;
  const { admin: supabaseAdmin, user: caller } = ctx;

  try {
    const body = await request.json();
    const { action, fullName, userId } = body;
    const email: string | undefined = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;

    // Mark stale pending invites as expired
    const { error: expireError } = await supabaseAdmin
      .from('user_profiles')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('invite_expires_at', new Date().toISOString());
    if (expireError) console.error('Error checking expired invites:', expireError);

    if (action === 'inviteUser') {
      if (!email || !EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
      }
      const name = (typeof fullName === 'string' && fullName.trim()) || email.split('@')[0];

      const { users, error: listError } = await listAllAuthUsers(supabaseAdmin);
      if (listError) return NextResponse.json({ error: listError }, { status: 500 });
      const existing = users.find(u => u.email?.toLowerCase() === email);

      if (existing) {
        const { data: existingProfile } = await supabaseAdmin
          .from('user_profiles')
          .select('id, status')
          .eq('id', existing.id)
          .maybeSingle();

        if (existing.email_confirmed_at) {
          // Already a real account.
          if (existingProfile && existingProfile.status !== 'expired') {
            return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
          }
          const { error } = await supabaseAdmin.from('user_profiles').upsert(
            {
              id: existing.id,
              email,
              full_name: name,
              role: 'admin',
              is_super_admin: false,
              invited_by: caller.id,
              invited_at: new Date().toISOString(),
              status: 'active',
            },
            { onConflict: 'id' }
          );
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({
            success: true,
            message: 'This person already has an account; admin access granted. They can sign in with their existing password.',
          });
        }

        // Never-confirmed user: delete and re-invite so a real email is sent.
        const failed = await sendInvite(supabaseAdmin, {
          email, fullName: name, invitedBy: caller.id, unconfirmedUserId: existing.id,
        });
        if (failed) return failed;
        return NextResponse.json({ success: true, message: 'Invitation email sent! The user has 24 hours to accept.' });
      }

      const failed = await sendInvite(supabaseAdmin, { email, fullName: name, invitedBy: caller.id });
      if (failed) return failed;
      return NextResponse.json({ success: true, message: 'Invitation email sent! The user has 24 hours to accept.' });
    }

    if (action === 'resendInvite') {
      if (!userId) {
        return NextResponse.json({ error: 'User ID required' }, { status: 400 });
      }

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('email, full_name, status')
        .eq('id', userId)
        .maybeSingle();

      if (!profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      if (profile.status !== 'expired' && profile.status !== 'pending') {
        return NextResponse.json({ error: 'Can only resend to pending or expired invites' }, { status: 400 });
      }

      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authData?.user?.email_confirmed_at) {
        await supabaseAdmin.from('user_profiles').update({ status: 'active' }).eq('id', userId);
        return NextResponse.json({ error: 'This user has already accepted the invitation' }, { status: 400 });
      }

      const failed = await sendInvite(supabaseAdmin, {
        email: String(profile.email).toLowerCase(),
        fullName: profile.full_name || String(profile.email).split('@')[0],
        invitedBy: caller.id,
        unconfirmedUserId: authData?.user ? userId : undefined,
      });
      if (failed) return failed;
      return NextResponse.json({ success: true, message: 'Invitation email resent! The user has 24 hours to accept.' });
    }

    if (action === 'listAdminUsers') {
      const { users: authUsers, error: authError } = await listAllAuthUsers(supabaseAdmin);
      if (authError) {
        return NextResponse.json({ error: authError }, { status: 500 });
      }

      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, full_name, role, is_super_admin, invited_by, invited_at, invite_expires_at, last_login, created_at, status')
        .order('created_at', { ascending: false });

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 });
      }

      const enrichedUsers = profiles.map(profile => {
        const authUser = authUsers.find(u => u.id === profile.id);
        let actualStatus = profile.status || 'pending';

        if (authUser?.email_confirmed_at) {
          actualStatus = 'active';
        } else if (profile.status === 'pending' && profile.invite_expires_at) {
          if (new Date(profile.invite_expires_at) < new Date()) {
            actualStatus = 'expired';
          }
        }

        return {
          ...profile,
          status: actualStatus,
          last_login: authUser?.last_sign_in_at || profile.last_login,
        };
      });

      return NextResponse.json({ users: enrichedUsers });
    }

    if (action === 'removeAdmin') {
      if (!userId) {
        return NextResponse.json({ error: 'User ID required' }, { status: 400 });
      }
      if (userId === caller.id) {
        return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });
      }
      const { data: target } = await supabaseAdmin
        .from('user_profiles')
        .select('is_super_admin')
        .eq('id', userId)
        .maybeSingle();
      if (target?.is_super_admin) {
        return NextResponse.json({ error: 'A super admin cannot be removed' }, { status: 400 });
      }

      const { error: deleteProfileError } = await supabaseAdmin
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) {
        return NextResponse.json({ error: deleteProfileError.message }, { status: 500 });
      }

      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteAuthError) {
        console.error('Auth delete error:', deleteAuthError);
        return NextResponse.json({
          error: 'Admin access was removed, but the auth account could not be deleted: ' + deleteAuthError.message,
        }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Admin user completely removed' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Admin API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
