'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/apiFetch';
import { auth } from '@/lib/auth';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * Landing page for admin invitation links (and password-recovery links).
 * The Supabase client parses the session tokens from the URL hash; the invitee then
 * chooses a password, their profile is activated and they are signed in.
 */
export default function SetPasswordPage() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const linkFailed = /error(_code|_description)?=/.test(hash);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setPhase(p => (p === 'checking' || p === 'invalid' ? 'ready' : p));
    });

    const check = async () => {
      // Give the client a moment to exchange the URL tokens for a session.
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setPhase(p => (p === 'done' ? p : 'ready'));
          return;
        }
        if (linkFailed) break;
        await new Promise(r => setTimeout(r, 300));
      }
      if (!cancelled) setPhase(p => (p === 'checking' ? 'invalid' : p));
    };
    void check();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError || !data.user) {
        setError(updateError?.message || 'Could not set the password. The link may have expired.');
        setBusy(false);
        return;
      }

      const res = await authFetch('/api/account/activate', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Your password was saved, but your account could not be activated. Contact a super admin.');
        setBusy(false);
        return;
      }

      const user = await auth.buildUser(data.user.id, data.user.email ?? '', data.user.user_metadata);
      if (user) auth.saveSession(user);
      document.cookie = 'welkinrim-session=true; path=/; max-age=86400; SameSite=Strict';
      setPhase('done');
      // Full navigation so the auth provider picks up the saved session.
      window.location.href = '/';
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="sp-page">
      <div className="sp-card">
        <div className="sp-eyebrow">WELKINRIM ADMIN</div>
        <h1 className="sp-title">Set your password</h1>

        {phase === 'checking' && <p className="sp-text">Verifying your invitation...</p>}

        {phase === 'invalid' && (
          <>
            <p className="sp-text">
              This invitation link is invalid or has expired. Ask a super admin to resend your invitation,
              or <a href="/login">sign in</a> if you already have a password.
            </p>
          </>
        )}

        {phase === 'done' && <p className="sp-text">Password saved. Redirecting...</p>}

        {phase === 'ready' && (
          <form onSubmit={handleSubmit} noValidate>
            <p className="sp-text">Choose a password to finish setting up your account.</p>
            {error && <div className="sp-error" role="alert">{error}</div>}
            <label htmlFor="sp-password" className="sp-label">New password</label>
            <input
              id="sp-password"
              type="password"
              className="sp-input"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={busy}
            />
            <label htmlFor="sp-confirm" className="sp-label">Confirm password</label>
            <input
              id="sp-confirm"
              type="password"
              className="sp-input"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="sp-btn" disabled={busy}>
              {busy ? 'Saving...' : 'Set password and continue'}
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .sp-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0e0e0f; padding: 24px; }
        .sp-card { width: 100%; max-width: 400px; background: #161618; border: 1px solid #2a2a2d; border-radius: 6px; padding: 32px; color: #f2f2f2; }
        .sp-eyebrow { color: #e8a800; font-size: 11px; letter-spacing: 0.15em; margin-bottom: 8px; }
        .sp-title { font-size: 24px; margin: 0 0 16px; }
        .sp-text { color: #b5b5ba; font-size: 14px; line-height: 1.5; margin: 0 0 16px; }
        .sp-text a { color: #e8a800; }
        .sp-label { display: block; font-size: 12px; margin: 12px 0 6px; color: #b5b5ba; }
        .sp-input { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #0e0e0f; border: 1px solid #2a2a2d; border-radius: 4px; color: #f2f2f2; font-size: 14px; }
        .sp-input:focus { outline: none; border-color: #e8a800; }
        .sp-btn { margin-top: 20px; width: 100%; padding: 12px; background: #e8a800; color: #0e0e0f; border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
        .sp-btn:disabled { opacity: 0.6; cursor: default; }
        .sp-error { background: #3a1517; border: 1px solid #7a2a2e; color: #ffb4b4; padding: 10px 12px; border-radius: 4px; font-size: 13px; margin-bottom: 8px; }
      `}</style>
    </div>
  );
}
