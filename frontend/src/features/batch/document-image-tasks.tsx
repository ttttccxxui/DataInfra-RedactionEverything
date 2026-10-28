// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { fileApi, getBatchZipManifest } from '@/services/api';
import {
  createJob,
  deleteJob,
  getJob,
  listJobs,
  type JobStatusFilterApi,
  type JobSummary,
} from '@/services/jobsApi';
import { fetchPresets, type RecognitionPreset } from '@/services/presetsApi';
import { formatAggregateJobStatus } from '@/utils/jobStatusLabels';
import { JobStatusBadge } from '../jobs/components/jobs-status-badge';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DELETABLE_STATUSES = new Set(['draft', 'awaiting_review', 'completed', 'failed', 'cancelled']);
const JOB_QUERY_PAGE_SIZE = 100;
const TASK_NAME_MAX_LENGTH = 50;

type StatusFilterValue = 'all' | JobStatusFilterApi;
type PaginationItem = number | 'ellipsis';

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '处理中' },
  { value: 'awaiting_review', label: '待审核' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function taskTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function defaultTaskName(): string {
  return `任务${taskTimestamp()}`;
}

function normalizeTaskTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

async function jobTitleExists(title: string): Promise<boolean> {
  const normalizedTitle = normalizeTaskTitle(title);
  const loaded: JobSummary[] = [];
  let nextPage = 1;
  let totalRows = 0;
  do {
    const result = await listJobs({
      job_type: 'smart_batch',
      page: nextPage,
      page_size: JOB_QUERY_PAGE_SIZE,
    });
    loaded.push(...result.jobs);
    totalRows = result.total;
    nextPage += 1;
  } while (loaded.length < totalRows);
  return loaded.some((job) => normalizeTaskTitle(job.title) === normalizedTitle);
}

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    totalPages,
    currentPage,
    currentPage - 1,
    currentPage + 1,
  ]);

  if (currentPage <= 2) pages.add(3);
  if (currentPage >= totalPages - 1) pages.add(totalPages - 2);

  const sortedPages = Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((a, b) => a - b);

  const items: PaginationItem[] = [];
  sortedPages.forEach((pageNumber, index) => {
    const previous = sortedPages[index - 1];
    if (previous && pageNumber - previous > 1) {
      items.push(pageNumber - previous === 2 ? previous + 1 : 'ellipsis');
    }
    items.push(pageNumber);
  });
  return items;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function safeZipFilename(title: string): string {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]/g, '_') || '文档图片处理任务';
  return `${safeTitle}_匿名化结果.zip`;
}

function getSortableTime(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getCounts(job: JobSummary) {
  return {
    total: job.nav_hints?.item_count ?? job.progress.total_items,
    completed: job.progress.completed,
    awaitingReview: job.progress.awaiting_review,
    failed: job.progress.failed + (job.progress.cancelled ?? 0),
    reviewApproved: job.progress.review_approved,
    redacting: job.progress.redacting,
  };
}

function getProgressPercent(job: JobSummary): number {
  const counts = getCounts(job);
  if (counts.total <= 0) return job.status === 'completed' ? 100 : 0;
  const handled =
    counts.completed +
    counts.awaitingReview +
    counts.reviewApproved +
    counts.redacting +
    counts.failed;
  return Math.min(100, Math.max(0, Math.round((handled / counts.total) * 100)));
}

function progressTone(job: JobSummary): string {
  if (job.status === 'failed' || getCounts(job).failed > 0) return 'bg-destructive';
  if (job.status === 'completed') return 'bg-emerald-500';
  if (job.status === 'awaiting_review') return 'bg-amber-500';
  return 'bg-primary';
}

function configListLabel(job: JobSummary, presetById: Record<string, RecognitionPreset>): string {
  const config = job.config ?? {};
  const textId = asString(config.preset_text_id ?? config.presetTextId);
  const visionId = asString(config.preset_vision_id ?? config.presetVisionId);
  const labels: string[] = [];

  if (textId) labels.push(`文本：${presetById[textId]?.name ?? textId}`);
  if (visionId) labels.push(`图像：${presetById[visionId]?.name ?? visionId}`);
  return labels.length > 0 ? labels.join(' / ') : '默认配置清单';
}

function viewHref(job: JobSummary): string {
  return `/jobs/${encodeURIComponent(job.id)}`;
}

function reviewHref(job: JobSummary): string {
  return `/batch/smart?jobId=${encodeURIComponent(job.id)}&step=4`;
}

export function DocumentImageTasks() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<JobSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presetById, setPresetById] = useState<Record<string, RecognitionPreset>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskNamePlaceholder, setTaskNamePlaceholder] = useState(defaultTaskName);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded: JobSummary[] = [];
      let nextPage = 1;
      let totalRows = 0;
      do {
        const result = await listJobs({
          job_type: 'smart_batch',
          status: statusFilter === 'all' ? undefined : statusFilter,
          page: nextPage,
          page_size: JOB_QUERY_PAGE_SIZE,
        });
        loaded.push(...result.jobs);
        totalRows = result.total;
        nextPage += 1;
      } while (loaded.length < totalRows);
      setRows(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : '任务列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    let active = true;
    void fetchPresets()
      .then((presets) => {
        if (!active) return;
        setPresetById(Object.fromEntries(presets.map((preset) => [preset.id, preset])));
      })
      .catch(() => {
        if (active) setPresetById({});
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [pageSize, search, statusFilter]);

  const openCreateDialog = () => {
    setTaskName('');
    setTaskNamePlaceholder(defaultTaskName());
    setCreateOpen(true);
    setCreateError('');
    setError(null);
  };

  const createTask = async () => {
    if (creating) return;
    const title = taskName.trim();
    if (!title) {
      setCreateError('任务名称必填');
      return;
    }
    if (title.length > TASK_NAME_MAX_LENGTH) {
      setCreateError(`任务名称不能超过 ${TASK_NAME_MAX_LENGTH} 个字符`);
      return;
    }
    setCreating(true);
    setCreateError('');
    setError(null);
    try {
      if (await jobTitleExists(title)) {
        setCreateError('任务名称不可重复');
        return;
      }
      const job = await createJob({
        job_type: 'smart_batch',
        title,
        config: {
          batch_wizard_mode: 'smart',
          wizard_furthest_step: 1,
        },
      });
      setCreateOpen(false);
      navigate(`/batch/smart?jobId=${encodeURIComponent(job.id)}&step=1`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '新建任务失败');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteJob(deleteTarget.id);
      setDeleteTarget(null);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const downloadRedactedZip = async (job: JobSummary) => {
    if (downloadingJobId) return;
    setDownloadingJobId(job.id);
    setError(null);
    try {
      const detail = await getJob(job.id, { performance: false });
      const fileIds = Array.from(
        new Set(detail.items.map((item) => item.file_id).filter(Boolean)),
      );
      if (!fileIds.length) {
        showToast('当前任务没有可下载文件。', 'info');
        return;
      }
      const blob = await fileApi.batchDownloadZip(fileIds, true, job.id);
      triggerDownload(blob, safeZipFilename(job.title));
      const manifest = getBatchZipManifest(blob);
      if (manifest && manifest.skipped_count > 0) {
        showToast(
          `匿名ZIP已开始下载，包含 ${manifest.included_count} 个文件，跳过 ${manifest.skipped_count} 个文件。`,
          'info',
        );
      } else {
        showToast('匿名ZIP已开始下载。', 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '匿名ZIP下载失败';
      setError(message);
      showToast(message, 'error');
    } finally {
      setDownloadingJobId(null);
    }
  };

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows
      .filter((job) => !keyword || job.title.toLowerCase().includes(keyword))
      .sort(
        (a, b) =>
          getSortableTime(b.updated_at) - getSortableTime(a.updated_at) ||
          a.title.localeCompare(b.title),
      );
  }, [rows, search]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginationItems = useMemo(
    () => getPaginationItems(Math.min(Math.max(1, page), totalPages), totalPages),
    [page, totalPages],
  );
  const tableRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), totalPages);
    return filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [filteredRows, page, pageSize, totalPages]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="saas-page flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="page-shell !max-w-[min(100%,1920px)] !px-3 !py-2 sm:!px-4 sm:!py-3">
        <div className="page-stack gap-3 overflow-visible">
          <div className="min-w-[96rem] overflow-visible rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
            <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={search}
                    placeholder="搜索任务名称"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button onClick={openCreateDialog} data-testid="document-task-create">
                  <Plus className="size-4" />
                  新建任务
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="m-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Table className="min-w-[96rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">序号</TableHead>
                  <TableHead className="min-w-44 text-left">任务名称</TableHead>
                  <TableHead className="min-w-52 text-left">配置清单</TableHead>
                  <TableHead className="w-20 text-center">总数</TableHead>
                  <TableHead className="w-24 text-center">已完成</TableHead>
                  <TableHead className="w-24 text-center">待审核</TableHead>
                  <TableHead className="min-w-36 text-center">进度</TableHead>
                  <TableHead className="w-28 text-center">状态</TableHead>
                  <TableHead className="w-28 text-center">更新人</TableHead>
                  <TableHead className="w-56 min-w-56 text-center">更新时间</TableHead>
                  <TableHead className="w-48 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center">
                      暂无文档图片处理任务
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((job, index) => {
                    const counts = getCounts(job);
                    const progress = getProgressPercent(job);
                    const canDelete = DELETABLE_STATUSES.has(job.status);
                    const canDownload = job.status === 'completed';
                    const isDownloading = downloadingJobId === job.id;
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="text-center font-medium text-muted-foreground">
                          {(page - 1) * pageSize + index + 1}
                        </TableCell>
                        <TableCell className="text-left font-semibold text-foreground">
                          <span className="block max-w-[18rem] truncate" title={job.title}>
                            {job.title}
                          </span>
                        </TableCell>
                        <TableCell className="text-left text-foreground">
                          <span
                            className="block max-w-[18rem] truncate"
                            title={configListLabel(job, presetById)}
                          >
                            {configListLabel(job, presetById)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-foreground">{counts.total}</TableCell>
                        <TableCell className="text-center text-foreground">
                          {counts.completed}
                        </TableCell>
                        <TableCell className="text-center text-foreground">
                          {counts.awaitingReview}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full', progressTone(job))}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-foreground">{progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <JobStatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="text-center text-foreground">
                          {job.updated_by || job.created_by || '-'}
                        </TableCell>
                        <TableCell className="min-w-56 whitespace-nowrap text-center text-foreground">
                          {formatDateTime(job.updated_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            {job.status === 'awaiting_review' && (
                              <Button variant="link" size="sm" className="h-auto px-0" asChild>
                                <Link to={reviewHref(job)}>
                                  继续审阅
                                </Link>
                              </Button>
                            )}
                            {job.status === 'awaiting_review' && <span className="text-border">·</span>}
                            <Button variant="link" size="sm" className="h-auto px-0" asChild>
                              <Link to={viewHref(job)} title={formatAggregateJobStatus(job.status)}>
                                查看
                              </Link>
                            </Button>
                            {canDownload && (
                              <>
                                <span className="text-border">·</span>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto px-0"
                                  onClick={() => void downloadRedactedZip(job)}
                                  disabled={Boolean(downloadingJobId)}
                                >
                                  {isDownloading ? '下载中...' : '下载'}
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <>
                                <span className="text-border">·</span>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto px-0 text-destructive"
                                  onClick={() => setDeleteTarget(job)}
                                  disabled={deleting}
                                >
                                  删除
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>共 {total} 条</span>
              <div className="flex items-center justify-end gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value))}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} 条/页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || loading}
                >
                  上一页
                </Button>
                {paginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === page ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 min-w-8 px-2"
                      onClick={() => setPage(item)}
                      disabled={loading}
                      aria-current={item === page ? 'page' : undefined}
                    >
                      {item}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages || loading}
                >
                  下一页
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建文档图片处理任务</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="document-task-name">
              任务名称 <span className="text-destructive">*</span>
            </label>
            <Input
              id="document-task-name"
              value={taskName}
              onChange={(event) => {
                setTaskName(event.target.value);
                if (createError) setCreateError('');
              }}
              placeholder={taskNamePlaceholder}
              maxLength={TASK_NAME_MAX_LENGTH}
              aria-required="true"
              autoFocus
              data-testid="document-task-name"
            />
            {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={() => void createTask()} disabled={creating}>
              {creating ? '新建中...' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除任务"
        message={`确认删除“${deleteTarget?.title ?? ''}”？`}
        confirmText={deleting ? '删除中...' : '删除'}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
