// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Search, ShieldCheck, UserCheck, Users, UserX } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-context';
import { authFetch } from '@/services/api-client';
import { localizeErrorMessage } from '@/utils/localizeError';
import { cn } from '@/lib/utils';
import { formatDateTime, getDateTimestamp } from '@/lib/format-date';
import { parseJson } from './shared';

interface AdminUser {
  username: string;
  role: string;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  can_bulk_confirm?: boolean;
  disabled?: boolean;
}

interface AdminRole {
  id: string;
  name: string;
  description: string;
  scope: string;
  userCount: number;
  type: 'builtin' | 'custom';
  permissions: string[];
  updatedBy: string;
  updatedAt: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const ROLE_DESCRIPTION_MAX_LENGTH = 5000;

const permissionOptions = [
  '工作台',
  '单次处理',
  '批量处理',
  '库表处理',
  '医学影像 DICOM',
  '识别项设置',
  '配置清单设置',
  '用户管理',
  '角色管理',
  '服务监控',
  '授权许可',
  '运行配置',
  '操作日志',
];

const defaultRoles: AdminRole[] = [
  {
    id: 'super_admin',
    name: '超级管理员',
    description: '内置角色，拥有系统全部功能权限',
    scope: '全部权限（13/13 模块）',
    userCount: 1,
    type: 'builtin',
    permissions: permissionOptions,
    updatedBy: 'system',
    updatedAt: '2026-09-23 17:30:31',
  },
  {
    id: 'reviewer',
    name: '审核员',
    description: '负责文件复核、结果确认和批量处理',
    scope: '单次处理、批量处理、处理结果',
    userCount: 0,
    type: 'custom',
    permissions: ['工作台', '单次处理', '批量处理', '配置清单设置'],
    updatedBy: 'admin',
    updatedAt: '2026-09-21 09:12:00',
  },
  {
    id: 'operator',
    name: '操作员',
    description: '负责上传、识别和导出，不参与权限配置',
    scope: '单次处理、批量处理、库表处理',
    userCount: 0,
    type: 'custom',
    permissions: ['工作台', '单次处理', '批量处理', '库表处理'],
    updatedBy: 'admin',
    updatedAt: '2026-09-20 14:18:00',
  },
  {
    id: 'viewer',
    name: '只读用户',
    description: '仅可查看任务、结果和运行状态',
    scope: '工作台、服务监控、操作日志',
    userCount: 0,
    type: 'custom',
    permissions: ['工作台', '服务监控', '操作日志'],
    updatedBy: 'admin',
    updatedAt: '2026-09-18 16:40:00',
  },
];

const legacyRoleAliases: Record<string, string> = {
  user: 'reviewer',
};

const roleOptions = defaultRoles.map((role) => ({
  value: role.id,
  label: role.name,
}));

const roleLabels = roleOptions.reduce<Record<string, string>>((labels, role) => {
  labels[role.value] = role.label;
  return labels;
}, {});

function normalizeUserRole(role: string | null | undefined) {
  const value = String(role || 'reviewer').trim();
  return legacyRoleAliases[value] || value;
}

export function AdminAccessPanel() {
  return <AdminUsersPanel />;
}

export function AdminUsersPanel() {
  const { status } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleAssignUser, setRoleAssignUser] = useState<AdminUser | null>(null);
  const [roleDraft, setRoleDraft] = useState('reviewer');
  const [assignedRoles, setAssignedRoles] = useState<Record<string, string>>({});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('reviewer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/auth/users');
      const body = await parseJson<(AdminUser[] & { detail?: string }) | { detail?: string }>(res);
      if (!res.ok || !Array.isArray(body)) {
        throw new Error((body && 'detail' in body && body.detail) || `HTTP ${res.status}`);
      }
      setUsers(body);
    } catch (err) {
      setError(localizeErrorMessage(err, 'system.error.loadUsers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, pageSize]);

  const enrichedUsers = useMemo(
    () =>
      users.map((user) => {
        const role = normalizeUserRole(assignedRoles[user.username] ?? user.role);
        return {
          ...user,
          role,
          roleLabel: roleLabels[role] ?? role,
          statusLabel: user.disabled ? '已冻结' : '启用中',
          updatedBy: user.updated_by || user.created_by || user.username || '-',
          updatedAt: formatDateTime(user.updated_at || user.created_at),
          updatedTime: getSortableTime(user.updated_at || user.created_at),
        };
      }),
    [assignedRoles, users],
  );

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return enrichedUsers
      .filter((user) => {
        const matchesKeyword = !keyword || user.username.toLowerCase().includes(keyword);
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'enabled' && !user.disabled) ||
          (statusFilter === 'disabled' && user.disabled);
        return matchesKeyword && matchesRole && matchesStatus;
      })
      .sort((a, b) => b.updatedTime - a.updatedTime || a.username.localeCompare(b.username));
  }, [enrichedUsers, roleFilter, search, statusFilter]);

  const pageRows = usePagedRows(filteredUsers, page, pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  async function createUser() {
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      });
      const body = await parseJson<{ detail?: string }>(res);
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setRole('reviewer');
      setCreateOpen(false);
      await loadUsers();
    } catch (err) {
      setError(localizeErrorMessage(err, 'system.error.createUser'));
    } finally {
      setSaving(false);
    }
  }

  async function setUserDisabled(user: AdminUser, disabled: boolean) {
    const now = new Date().toISOString();
    setUsers((prev) =>
      prev.map((item) =>
        item.username === user.username
          ? { ...item, disabled, updated_at: now, updated_by: status?.username || item.updated_by }
          : item,
      ),
    );
    setError(null);
    try {
      const res = await authFetch(`/api/v1/auth/users/${encodeURIComponent(user.username)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      const body = await parseJson<{ detail?: string }>(res);
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
      await loadUsers();
    } catch (err) {
      setUsers((prev) =>
        prev.map((item) =>
          item.username === user.username ? { ...item, disabled: !disabled } : item,
        ),
      );
      setError(localizeErrorMessage(err, 'system.error.updatePermission'));
    }
  }

  async function saveAssignedRole() {
    if (!roleAssignUser) return;
    const now = new Date().toISOString();
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/v1/auth/users/${encodeURIComponent(roleAssignUser.username)}/role`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: roleDraft }),
        },
      );
      const body = await parseJson<AdminUser | { detail?: string }>(res);
      if (!res.ok) throw new Error((body && 'detail' in body && body.detail) || `HTTP ${res.status}`);
      setAssignedRoles((prev) => ({
        ...prev,
        [roleAssignUser.username]: roleDraft,
      }));
      const userBody =
        body && 'username' in body && body.username === roleAssignUser.username
          ? (body as AdminUser)
          : null;
      setUsers((prev) =>
        prev.map((item) =>
          item.username === roleAssignUser.username
            ? {
                ...item,
                role: roleDraft,
                updated_at: userBody?.updated_at || now,
                updated_by: userBody?.updated_by || status?.username || item.updated_by,
              }
            : item,
        ),
      );
      setRoleAssignUser(null);
      await loadUsers();
    } catch (err) {
      setError(localizeErrorMessage(err, 'system.error.updatePermission'));
    } finally {
      setSaving(false);
    }
  }

  const metrics = [
    { label: '管理后台用户', value: String(users.length), helper: `当前账号 ${status?.username || '-'}` },
    {
      label: '启用中',
      value: String(users.filter((user) => !user.disabled).length),
      helper: '可登录并使用系统',
      tone: 'success' as const,
    },
    {
      label: '已冻结',
      value: String(users.filter((user) => user.disabled).length),
      helper: '冻结后立即失去登录能力',
      tone: 'danger' as const,
    },
    {
      label: '角色总数',
      value: String(roleOptions.length),
      helper: '含内置超级管理员',
    },
  ];

  return (
    <section className="space-y-4" data-testid="admin-users-panel">
      <ListMetrics metrics={metrics} />

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                placeholder="搜索用户名"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="全部角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                {roleOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="enabled">启用中</SelectItem>
                <SelectItem value="disabled">已冻结</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              新建用户
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="m-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">序号</TableHead>
              <TableHead className="text-center">用户名</TableHead>
              <TableHead className="text-center">角色</TableHead>
              <TableHead className="text-center">更新人</TableHead>
              <TableHead className="text-center">更新时间</TableHead>
              <TableHead className="text-center">状态</TableHead>
              <TableHead className="w-44 text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((user, index) => (
              <TableRow key={user.username}>
                <TableCell className="text-center font-medium text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell className="text-center font-semibold text-foreground">
                  {user.username}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="secondary"
                    className={cn(
                      user.role === 'super_admin'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    {user.roleLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{user.updatedBy}</TableCell>
                <TableCell className="text-center">{user.updatedAt}</TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="secondary"
                    className={cn(
                      user.disabled
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    {user.statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => {
                        setRoleAssignUser(user);
                        setRoleDraft(normalizeUserRole(assignedRoles[user.username] ?? user.role));
                      }}
                    >
                      分配角色
                    </Button>
                    <span className="text-border">·</span>
                    <Button
                      variant="link"
                      size="sm"
                      className={cn(
                        'h-auto px-0',
                        user.disabled ? 'text-primary' : 'text-destructive',
                      )}
                      onClick={() => void setUserDisabled(user, !user.disabled)}
                    >
                      {user.disabled ? '解冻' : '冻结'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!pageRows.length && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {loading ? '正在加载用户...' : '暂无匹配用户'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <ListPagination
          page={Math.min(page, totalPages)}
          pageSize={pageSize}
          total={filteredUsers.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>创建后可在用户列表中分配角色并管理启用状态。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admin-new-username">登录账号</Label>
              <Input
                id="admin-new-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-new-password">密码</Label>
              <Input
                id="admin-new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-new-confirm-password">确认密码</Label>
              <Input
                id="admin-new-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admin-new-role">角色</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="admin-new-role">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={saving || !username || !password} onClick={() => void createUser()}>
              {saving ? '创建中...' : '创建用户'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(roleAssignUser)}
        onOpenChange={(open) => {
          if (!open) setRoleAssignUser(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>分配角色</DialogTitle>
            <DialogDescription>
              为 {roleAssignUser?.username || '-'} 选择角色，保存后列表即时更新。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin-assign-role">角色</Label>
            <Select value={roleDraft} onValueChange={setRoleDraft}>
              <SelectTrigger id="admin-assign-role">
                <SelectValue placeholder="选择角色" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleAssignUser(null)}>
              取消
            </Button>
            <Button
              disabled={saving}
              onClick={() => void saveAssignedRole()}
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function AdminRolesPanel() {
  const { status } = useAuth();
  const [roles, setRoles] = useState(defaultRoles);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleFormSubmitted, setRoleFormSubmitted] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    '工作台',
    '单次处理',
    '批量处理',
  ]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, pageSize]);

  const filteredRoles = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return roles
      .filter((role) => {
        const matchesKeyword =
          !keyword ||
          role.name.toLowerCase().includes(keyword) ||
          role.description.toLowerCase().includes(keyword) ||
          role.scope.toLowerCase().includes(keyword);
        const matchesType = typeFilter === 'all' || role.type === typeFilter;
        return matchesKeyword && matchesType;
      })
      .sort((a, b) => getSortableTime(b.updatedAt) - getSortableTime(a.updatedAt) || a.name.localeCompare(b.name));
  }, [roles, search, typeFilter]);

  const pageRows = usePagedRows(filteredRoles, page, pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const normalizedRoleName = roleName.trim();
  const roleNameDuplicate = roles.some(
    (role) =>
      role.id !== editingRoleId &&
      role.name.trim().toLowerCase() === normalizedRoleName.toLowerCase(),
  );
  const roleNameError = !normalizedRoleName
    ? '请输入角色名称'
    : roleNameDuplicate
      ? '角色名称已存在，请更换'
      : '';
  const permissionError = selectedPermissions.length === 0 ? '请至少选择一个权限范围' : '';
  const descriptionError =
    roleDescription.length > ROLE_DESCRIPTION_MAX_LENGTH
      ? `角色描述最多支持 ${ROLE_DESCRIPTION_MAX_LENGTH} 字符`
      : '';
  const canSaveRole = !roleNameError && !permissionError && !descriptionError;

  function togglePermission(permission: string) {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission],
    );
  }

  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleName('');
    setRoleDescription('');
    setRoleFormSubmitted(false);
    setSelectedPermissions(['工作台', '单次处理', '批量处理']);
  }

  function openCreateRole() {
    resetRoleForm();
    setCreateOpen(true);
  }

  function openEditRole(role: AdminRole) {
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setRoleFormSubmitted(false);
    setSelectedPermissions(role.permissions);
    setCreateOpen(true);
  }

  function saveRole() {
    setRoleFormSubmitted(true);
    if (!canSaveRole) return;
    const now = new Date();
    const actor = status?.username || 'admin';
    const description = roleDescription.trim();
    if (editingRoleId) {
      setRoles((prev) =>
        prev.map((item) =>
          item.id === editingRoleId
            ? {
                ...item,
                name: normalizedRoleName,
                description,
                scope: summarizePermissions(selectedPermissions),
                permissions: selectedPermissions,
                updatedBy: actor,
                updatedAt: formatDateTime(now.toISOString()),
              }
            : item,
        ),
      );
    } else {
      const nextRole: AdminRole = {
        id: `custom-${Date.now()}`,
        name: normalizedRoleName,
        description,
        scope: summarizePermissions(selectedPermissions),
        userCount: 0,
        type: 'custom',
        permissions: selectedPermissions,
        updatedBy: actor,
        updatedAt: formatDateTime(now.toISOString()),
      };
      setRoles((prev) => [...prev, nextRole]);
    }
    resetRoleForm();
    setCreateOpen(false);
  }

  return (
    <section className="space-y-4" data-testid="admin-roles-panel">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                placeholder="搜索角色名称"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="builtin">内置</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={openCreateRole}>
              <Plus className="size-4" />
              新建角色
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">序号</TableHead>
              <TableHead className="text-center">角色名称</TableHead>
              <TableHead className="text-center">角色描述</TableHead>
              <TableHead className="text-center">权限范围</TableHead>
              <TableHead className="text-center">关联用户</TableHead>
              <TableHead className="text-center">类型</TableHead>
              <TableHead className="text-center">更新人</TableHead>
              <TableHead className="text-center">更新时间</TableHead>
              <TableHead className="w-44 text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((role, index) => (
              <TableRow key={role.id}>
                <TableCell className="text-center font-medium text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell className="text-center font-semibold text-foreground">{role.name}</TableCell>
                <TableCell className="text-left text-foreground">{role.description}</TableCell>
                <TableCell className="text-left text-foreground">
                  {role.scope}
                </TableCell>
                <TableCell className="text-center">{role.userCount} 人</TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="secondary"
                    className={cn(
                      role.type === 'builtin'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    {role.type === 'builtin' ? '内置' : '自定义'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{role.updatedBy}</TableCell>
                <TableCell className="text-center">{role.updatedAt}</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    {role.type === 'builtin' ? (
                      <span className="text-sm font-medium text-primary">不可编辑</span>
                    ) : (
                      <>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto px-0"
                          onClick={() => openEditRole(role)}
                        >
                          编辑权限
                        </Button>
                        <span className="text-border">·</span>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto px-0 text-destructive"
                          onClick={() =>
                            setRoles((prev) => prev.filter((item) => item.id !== role.id))
                          }
                        >
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!pageRows.length && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  暂无匹配角色
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <ListPagination
          page={Math.min(page, totalPages)}
          pageSize={pageSize}
          total={filteredRoles.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetRoleForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRoleId ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>选择角色可使用的功能权限，再将角色分配给用户。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="admin-role-name">
                角色名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="admin-role-name"
                value={roleName}
                required
                aria-invalid={Boolean(roleNameError && (roleFormSubmitted || normalizedRoleName || roleNameDuplicate))}
                onChange={(event) => setRoleName(event.target.value)}
              />
              {roleNameError && (roleFormSubmitted || normalizedRoleName || roleNameDuplicate) ? (
                <p className="text-xs text-destructive">{roleNameError}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="admin-role-description">角色描述</Label>
                <span className="text-xs text-muted-foreground">
                  {roleDescription.length}/{ROLE_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="admin-role-description"
                className="min-h-32 resize-y"
                maxLength={ROLE_DESCRIPTION_MAX_LENGTH}
                value={roleDescription}
                onChange={(event) => setRoleDescription(event.target.value)}
                placeholder="可选，最多输入 5000 字符"
              />
              {descriptionError ? <p className="text-xs text-destructive">{descriptionError}</p> : null}
            </div>
            <div className="space-y-3">
              <Label>
                权限范围 <span className="text-destructive">*</span>
              </Label>
              <div
                className={cn(
                  'grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3',
                  permissionError && roleFormSubmitted ? 'border-destructive' : 'border-border/70',
                )}
              >
                {permissionOptions.map((permission) => (
                  <label
                    key={permission}
                    className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={selectedPermissions.includes(permission)}
                      onCheckedChange={() => togglePermission(permission)}
                    />
                    <span>{permission}</span>
                  </label>
                ))}
              </div>
              {permissionError && roleFormSubmitted ? (
                <p className="text-xs text-destructive">{permissionError}</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetRoleForm();
              }}
            >
              取消
            </Button>
            <Button disabled={!canSaveRole} onClick={saveRole}>
              {editingRoleId ? '保存角色' : '创建角色'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ListMetrics({
  metrics,
}: {
  metrics: Array<{ label: string; value: string; helper: string; tone?: 'success' | 'danger' }>;
}) {
  const icons = [Users, UserCheck, UserX, ShieldCheck];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => {
        const Icon = icons[index] ?? KeyRound;
        return (
          <div
            key={metric.label}
            className="rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-control)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {metric.value}
            </div>
            <div
              className={cn(
                'mt-2 text-xs font-medium text-muted-foreground',
                metric.tone === 'success' && 'text-emerald-600',
                metric.tone === 'danger' && 'text-destructive',
              )}
            >
              {metric.helper}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1);

  return (
    <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>共 {total} 条</span>
      <div className="flex items-center justify-end gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          上一页
        </Button>
        {pages.map((item) => (
          <Button
            key={item}
            variant={item === currentPage ? 'default' : 'outline'}
            size="sm"
            className="h-8 min-w-8 px-2"
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ))}
        {totalPages > pages.length && <span className="px-1">...</span>}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function usePagedRows<T>(rows: T[], page: number, pageSize: number): T[] {
  return useMemo(() => {
    const safePage = Math.max(1, page);
    return rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [rows, page, pageSize]);
}

function summarizePermissions(permissions: string[]): string {
  if (permissions.length >= permissionOptions.length) {
    return `全部权限（${permissionOptions.length}/${permissionOptions.length} 模块）`;
  }
  if (!permissions.length) return '未配置权限';
  return permissions.slice(0, 3).join('、') + (permissions.length > 3 ? `（${permissions.length} 模块）` : '');
}

function getSortableTime(value?: string | null): number {
  return getDateTimestamp(value);
}
