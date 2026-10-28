// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authFetch } from '@/services/api-client';
import { localizeErrorMessage } from '@/utils/localizeError';
import { formatDateTime, getDateTimestamp } from '@/lib/format-date';
import { SettingsListPagination } from '../components/settings-list-pagination';
import { parseJson } from './shared';

interface AuditEntry {
  timestamp?: string;
  user?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function AdminAuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (userFilter.trim()) params.set('user', userFilter.trim());
    if (actionFilter.trim()) params.set('action', actionFilter.trim());
    if (keyword.trim()) params.set('q', keyword.trim());
    return params.toString();
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery();
      const res = await authFetch(`/api/v1/audit/logs${qs ? `?${qs}` : ''}`);
      const body = await parseJson<{ entries?: AuditEntry[]; detail?: string }>(res);
      if (!res.ok || !body?.entries) throw new Error(body?.detail || `HTTP ${res.status}`);
      setEntries(body.entries);
    } catch (err) {
      setError(localizeErrorMessage(err, 'system.error.loadAudit'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [entries, pageSize]);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          getDateTimestamp(b.timestamp) - getDateTimestamp(a.timestamp) ||
          String(a.user ?? '').localeCompare(String(b.user ?? '')),
      ),
    [entries],
  );
  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const visibleEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedEntries.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedEntries]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const qs = buildQuery();
      const res = await authFetch(`/api/v1/audit/logs/export${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-logs.csv';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(localizeErrorMessage(err, 'system.error.exportAudit'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-4" data-testid="admin-audit-panel">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="audit-q"
                className="pl-9"
                placeholder="搜索关键字"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
            <Input
              id="audit-user"
              className="w-full sm:w-44"
              placeholder="用户"
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
            />
            <Input
              id="audit-action"
              className="w-full sm:w-44"
              placeholder="动作"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              <Download className="size-4" />
              {exporting ? '导出中...' : '导出 CSV'}
            </Button>
            <Button type="button" disabled={loading} onClick={() => void load()}>
              {loading ? '查询中...' : '查询'}
            </Button>
          </div>
        </div>

        <TooltipProvider delayDuration={150}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">序号</TableHead>
                <TableHead className="text-center">操作时间</TableHead>
                <TableHead className="text-center">用户</TableHead>
                <TableHead className="text-center">动作</TableHead>
                <TableHead className="text-center">资源类型</TableHead>
                <TableHead className="text-center">资源ID</TableHead>
                <TableHead className="text-center">详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEntries.map((entry, index) => (
                <TableRow key={`${entry.timestamp}-${entry.action}-${index}`}>
                  <TableCell className="text-center font-medium text-muted-foreground">
                    {(currentPage - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {formatDateTime(entry.timestamp)}
                  </TableCell>
                  <TableCell className="text-center">{entry.user || '-'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {entry.action || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{entry.resource_type || '-'}</TableCell>
                  <TableCell className="text-center">
                    <span className="mx-auto block max-w-[14rem] truncate text-center" title={entry.resource_id}>
                      {entry.resource_id || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <AuditDetailText detail={entry.detail} />
                  </TableCell>
                </TableRow>
              ))}
              {!visibleEntries.length && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {loading ? '正在加载操作日志...' : '暂无匹配操作日志'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>

        {sortedEntries.length > 0 && (
          <SettingsListPagination
            page={currentPage}
            pageSize={pageSize}
            total={sortedEntries.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            testIdPrefix="audit"
          />
        )}
      </div>
    </section>
  );
}

function AuditDetailText({ detail }: { detail?: Record<string, unknown> }) {
  const compact = formatAuditDetail(detail);
  const full = formatAuditDetail(detail, true);
  if (compact === '-') {
    return <span className="mx-auto block max-w-[28rem] truncate text-center">-</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mx-auto block max-w-[28rem] cursor-default truncate text-center" title={compact}>
          {compact}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="max-h-80 max-w-[min(42rem,calc(100vw-2rem))] !overflow-auto whitespace-pre-wrap break-words text-left font-mono text-[11px] leading-relaxed"
      >
        {full}
      </TooltipContent>
    </Tooltip>
  );
}

function formatAuditDetail(detail?: Record<string, unknown>, pretty = false) {
  if (!detail || Object.keys(detail).length === 0) return '-';
  return JSON.stringify(detail, null, pretty ? 2 : 0);
}
