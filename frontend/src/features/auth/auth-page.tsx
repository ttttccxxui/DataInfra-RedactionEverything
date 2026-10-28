// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BRAND, brandName } from '@/config/brand';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { resolveAuthMode, resolveAuthNext, type AuthMode } from './auth-routing';
import { useAuth } from './auth-context';

export function AuthPage() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, login, setup, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>(() => resolveAuthMode(location.search));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // License 到期/失效横幅（/license/status 是公开端点，登录前即可读）
  const [licenseNotice, setLicenseNotice] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/v1/license/status')
      .then(async (res) => {
        if (!res.ok) return;
        const s = (await res.json()) as { state?: string; days_left?: number | null };
        const key =
          s.state === 'expiring_soon'
            ? 'auth.license.expiringSoon'
            : s.state === 'grace_readonly'
              ? 'auth.license.graceReadonly'
              : s.state === 'blocked' || s.state === 'invalid'
                ? 'auth.license.blocked'
                : null;
        if (key) setLicenseNotice(t(key).replace('{days}', String(s.days_left ?? '')));
      })
      .catch(() => {
        /* 拉不到状态就不显示横幅 */
      });
  }, [t]);

  const needsSetup = status?.password_set === false;
  const isRegister = !needsSetup && mode === 'register';
  const next = useMemo(() => resolveAuthNext(location.search), [location.search]);
  const title = needsSetup
    ? t('auth.setup.title')
    : isRegister
      ? t('auth.register.title')
      : t('auth.login.title');
  const description = needsSetup
    ? t('auth.setup.description')
    : isRegister
      ? t('auth.register.description')
      : t('auth.login.description');
  const submitText = submitting
    ? t('auth.submitting')
    : needsSetup
      ? t('auth.setup.submit')
      : isRegister
        ? t('auth.register.submit')
        : t('auth.login.submit');
  const authHint = isRegister ? t('auth.register.hint') : t('auth.login.hint');

  function switchMode(nextMode: AuthMode) {
    setError(null);
    setConfirmPassword('');
    setMode(nextMode);
    const params = new URLSearchParams(location.search);
    if (nextMode === 'register') {
      params.set('mode', 'register');
    } else {
      params.delete('mode');
    }
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if ((needsSetup || isRegister) && password !== confirmPassword) {
      setError(t('auth.error.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      if (needsSetup) {
        await setup(username, password);
      } else if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      navigate(isRegister ? '/' : next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#dff2ff_0%,#edf8ff_48%,#f8fcff_100%)] px-4 py-6 text-foreground sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(82,160,255,0.2),transparent_28%),radial-gradient(circle_at_84%_12%,rgba(147,203,255,0.22),transparent_25%)]" />

      <section className="relative z-10 flex min-h-[min(46rem,calc(100dvh-3rem))] w-full max-w-7xl overflow-hidden rounded-xl border border-white/60 bg-[linear-gradient(180deg,rgba(244,251,255,0.98)_0%,rgba(232,246,255,0.98)_45%,rgba(248,252,255,0.99)_100%)] shadow-[0_28px_80px_rgba(52,126,207,0.2)]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-[radial-gradient(ellipse_at_20%_82%,rgba(67,121,255,0.22),transparent_34%),radial-gradient(ellipse_at_92%_82%,rgba(35,121,255,0.28),transparent_34%),linear-gradient(178deg,transparent_0%,rgba(255,255,255,0.72)_24%,rgba(179,218,255,0.5)_54%,rgba(80,145,245,0.38)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] h-32 bg-[linear-gradient(170deg,transparent_0%,rgba(96,155,255,0.16)_38%,rgba(255,255,255,0.72)_48%,rgba(75,140,245,0.2)_58%,transparent_100%)] blur-[1px]" />
        <div className="pointer-events-none absolute bottom-12 left-[-8%] h-24 w-[52%] -rotate-6 rounded-[100%] bg-[linear-gradient(90deg,rgba(63,117,255,0.22),rgba(255,255,255,0.72),rgba(72,142,255,0.16))] blur-sm" />
        <div className="pointer-events-none absolute bottom-12 right-[-10%] h-28 w-[56%] rotate-6 rounded-[100%] bg-[linear-gradient(90deg,rgba(96,173,255,0.1),rgba(255,255,255,0.75),rgba(39,112,255,0.24))] blur-sm" />

        <div className="relative z-10 flex w-full flex-col">
          <header className="flex h-16 shrink-0 items-center justify-end px-6 sm:px-10">
            {!needsSetup && (
              <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/50 p-1 shadow-[0_4px_18px_rgba(75,104,210,0.16)] backdrop-blur">
                <button
                  type="button"
                  className={cn(
                    'h-7 rounded-full px-3 text-xs font-medium transition-colors',
                    !isRegister ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-primary',
                  )}
                  onClick={() => switchMode('login')}
                >
                  {t('auth.login.submit')}
                </button>
                <button
                  type="button"
                  className={cn(
                    'h-7 rounded-full px-3 text-xs font-medium transition-colors',
                    isRegister ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-500 hover:text-primary',
                  )}
                  onClick={() => switchMode('register')}
                >
                  {t('auth.register.submit')}
                </button>
              </div>
            )}
          </header>

          <div className="grid min-h-0 flex-1 items-center gap-10 px-6 pb-14 pt-6 sm:px-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-20 lg:px-24 lg:pb-24">
            <div className="mx-auto w-full max-w-[34rem] text-center lg:mx-0 lg:text-left">
              <div className="flex items-center justify-center gap-4 lg:justify-start">
                <img
                  src={BRAND.logoUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-xl shadow-[0_16px_38px_rgba(41,112,255,0.2)] sm:size-14"
                />
                <h1 className="text-[2.15rem] font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:text-[3rem]">
                  {brandName(t)}
                </h1>
              </div>
              <p className="mx-auto mt-5 max-w-[28rem] text-base font-medium leading-8 tracking-[-0.01em] text-slate-500 sm:text-xl lg:mx-0">
                智能协同，AI 赋能让匿名化更安心省力。
              </p>
              <div className="mx-auto mt-7 h-px w-44 bg-[linear-gradient(90deg,transparent,rgba(47,120,255,0.42),transparent)] lg:mx-0 lg:bg-[linear-gradient(90deg,rgba(47,120,255,0.48),transparent)]" />
            </div>

            <div className="relative mx-auto w-full max-w-[25rem] rounded-[1.35rem] border border-white/[0.72] bg-white/[0.62] p-6 shadow-[0_24px_60px_rgba(70,91,170,0.18)] backdrop-blur-2xl">
              <div className="pointer-events-none absolute right-0 top-0 size-16 rounded-tr-[1.35rem] bg-[linear-gradient(135deg,rgba(88,119,247,0.35),rgba(255,255,255,0)_58%)]" />

              <div className="relative space-y-1">
                <h2 className="text-base font-semibold tracking-[-0.03em] text-slate-900">{title}</h2>
                {description ? <p className="text-xs leading-5 text-slate-500">{description}</p> : null}
              </div>

              {licenseNotice && (
                <div
                  className="mt-4 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2 text-xs leading-5 text-[var(--warning-foreground)]"
                  data-testid="license-banner"
                >
                  {licenseNotice}
                </div>
              )}

              <form className="mt-5 space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
                {error && (
                  <Alert variant="destructive" className="bg-white/80">
                    <AlertTitle>{t('auth.error.title')}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="auth-username" className="sr-only">
                    {t('auth.username')}
                  </Label>
                  <Input
                    id="auth-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t('auth.username.placeholder')}
                    className="h-11 rounded-xl border-white/80 bg-white/[0.86] px-4 text-sm shadow-[0_8px_26px_rgba(72,97,170,0.08)] placeholder:text-slate-400 focus-visible:border-primary/50"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="auth-password" className="sr-only">
                    {t('auth.password')}
                  </Label>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={needsSetup || isRegister ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('auth.password.placeholder')}
                    className="h-11 rounded-xl border-white/80 bg-white/[0.86] px-4 text-sm shadow-[0_8px_26px_rgba(72,97,170,0.08)] placeholder:text-slate-400 focus-visible:border-primary/50"
                    required
                  />
                </div>

                {(needsSetup || isRegister) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-confirm-password" className="sr-only">
                      {t('auth.confirmPassword')}
                    </Label>
                    <Input
                      id="auth-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder={t('auth.confirmPassword.placeholder')}
                      className="h-11 rounded-xl border-white/80 bg-white/[0.86] px-4 text-sm shadow-[0_8px_26px_rgba(72,97,170,0.08)] placeholder:text-slate-400 focus-visible:border-primary/50"
                      required
                    />
                  </div>
                )}

                <Button
                  className="h-11 w-full rounded-xl border-0 bg-[linear-gradient(90deg,#2f78ff,#7a56f3)] text-sm font-semibold shadow-[0_12px_28px_rgba(75,96,232,0.32)] hover:brightness-105"
                  type="submit"
                  disabled={submitting}
                >
                  {submitText}
                </Button>

                {needsSetup ? (
                  <p className="text-center text-xs leading-5 text-slate-500">{t('auth.setup.hint')}</p>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
                    {authHint ? <span>{authHint}</span> : null}
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => switchMode(isRegister ? 'login' : 'register')}
                    >
                      {isRegister
                        ? t('auth.register.switchToLogin')
                        : t('auth.login.switchToRegister')}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AuthPage;
