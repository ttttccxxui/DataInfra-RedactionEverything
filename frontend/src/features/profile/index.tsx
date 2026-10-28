// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '@/i18n';
import { brandName } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/auth-context';
import { authFetch } from '@/services/api-client';
import { formatDateTime } from '@/lib/format-date';
import { localizeErrorMessage } from '@/utils/localizeError';

interface AuditEntry {
  timestamp?: string;
  user?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
}

export function ProfileCenter() {
  const t = useT();
  const { status, refresh } = useAuth();
  const username = status?.username?.trim() || t('auth.adminNameFallback');
  const roleLabel = status?.is_super_admin
    ? t('auth.superAdminRole')
    : status?.role?.trim() || t('auth.userRole');
  const userInitial = username.slice(0, 1).toUpperCase();
  const [recentActions, setRecentActions] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (!username || !status?.is_super_admin) {
      setRecentActions([]);
      return;
    }
    let active = true;
    const params = new URLSearchParams({ user: username, limit: '3' });
    void authFetch(`/api/v1/audit/logs?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { entries?: AuditEntry[] };
      })
      .then((body) => {
        if (!active) return;
        setRecentActions(Array.isArray(body?.entries) ? body.entries.slice(0, 3) : []);
      })
      .catch(() => {
        if (active) setRecentActions([]);
      });
    return () => {
      active = false;
    };
  }, [status?.is_super_admin, username]);

  const recentLogin = useMemo(() => {
    const loginEntry = recentActions.find((entry) => entry.action === 'login');
    return formatDateTime(loginEntry?.timestamp || recentActions[0]?.timestamp);
  }, [recentActions]);

  return (
    <div className="saas-page flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-background">
      <div className="page-shell !max-w-[min(100%,1920px)] !px-3 !py-4 sm:!px-4 lg:!px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
          <div className="grid content-start gap-4">
            <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
              <div className="border-b border-border/70 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold text-foreground">个人信息</h2>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-[var(--shadow-control)]">
                    {userInitial}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-foreground">{username}</div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {roleLabel} · {brandName(t)}
                    </div>
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 text-sm">
                  <ProfileMeta label="登录账号" value={username} />
                  <ProfileMeta
                    label="角色"
                    value={
                      status?.is_super_admin
                        ? '超级管理员（内置 · 全部权限）'
                        : roleLabel
                    }
                  />
                  <ProfileMeta label="最近登录" value={recentLogin || '-'} />
                </dl>
              </div>
            </section>

            <PasswordPanel onChanged={() => void refresh()} />
          </div>

          <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-foreground">我的最近操作</h2>
              {status?.is_super_admin && (
                <Link
                  to="/settings/system/audit"
                  className="text-sm font-semibold text-primary hover:text-primary/80"
                >
                  操作日志 →
                </Link>
              )}
            </div>
            <div className="divide-y divide-border/70">
              {recentActions.length > 0 ? (
                recentActions.map((entry, index) => (
                  <RecentActionRow key={`${entry.timestamp}-${entry.action}-${index}`} entry={entry} />
                ))
              ) : (
                <div className="px-5 py-10 text-sm text-muted-foreground">暂无最近操作</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

function PasswordPanel({ onChanged }: { onChanged: () => void }) {
  const t = useT();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (newPassword !== confirmPassword) {
      setError(t('auth.changePassword.mismatch'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { detail?: string };
          if (body?.detail) detail = body.detail;
        } catch {
          // keep status text
        }
        throw new Error(detail);
      }
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast(t('auth.changePassword.success'), 'success');
      onChanged();
    } catch (err) {
      setError(localizeErrorMessage(err, 'auth.changePassword.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
      <div className="border-b border-border/70 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-foreground">修改密码</h2>
      </div>
      <form
        className="grid gap-5 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!oldPassword || !newPassword || !confirmPassword || saving) return;
          void submit();
        }}
      >
        <PasswordField
          id="profile-old-password"
          label="旧密码"
          required
          placeholder="请输入当前密码"
          value={oldPassword}
          autoComplete="current-password"
          onChange={setOldPassword}
        />
        <PasswordField
          id="profile-new-password"
          label="新密码"
          required
          placeholder="≥8 位，须包含字母和数字"
          value={newPassword}
          autoComplete="new-password"
          onChange={setNewPassword}
        />
        <PasswordField
          id="profile-confirm-password"
          label="确认新密码"
          required
          placeholder="再次输入新密码"
          value={confirmPassword}
          autoComplete="new-password"
          onChange={setConfirmPassword}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div>
          <Button type="submit" disabled={saving || !oldPassword || !newPassword || !confirmPassword}>
            {saving ? '保存中...' : '保存新密码'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordField({
  id,
  label,
  required,
  placeholder,
  value,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  required?: boolean;
  placeholder: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground" htmlFor={id}>
      <span>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <Input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RecentActionRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="grid grid-cols-[10rem_5rem_minmax(0,1fr)] gap-3 px-4 py-4 text-sm sm:px-5">
      <div className="text-muted-foreground tabular-nums">{formatDateTime(entry.timestamp)}</div>
      <div>
        <Badge variant="secondary" className="bg-primary/10 text-primary">
          {actionBadge(entry)}
        </Badge>
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-foreground">{actionTitle(entry)}</div>
        <div className="mt-1 truncate text-muted-foreground">{actionDetail(entry)}</div>
      </div>
    </div>
  );
}

function actionBadge(entry: AuditEntry): string {
  const action = entry.action || '';
  if (action === 'login') return '认证';
  if (entry.resource_type === 'role') return '系统管理';
  if (entry.resource_type === 'preset') return '配置';
  if (entry.resource_type === 'job') return '任务';
  return action || '操作';
}

function actionTitle(entry: AuditEntry): string {
  const action = entry.action || '操作';
  if (action === 'login') return `登录 · ${entry.user || '-'}`;
  const resource = entry.resource_type || '资源';
  return `${formatAction(action)} · ${entry.resource_id || resource}`;
}

function actionDetail(entry: AuditEntry): string {
  if (entry.detail && Object.keys(entry.detail).length > 0) {
    return JSON.stringify(entry.detail);
  }
  return entry.resource_type || '-';
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    create: '新建',
    update: '编辑',
    delete: '删除',
    login: '登录',
    logout: '退出',
  };
  return map[action] ?? action;
}
