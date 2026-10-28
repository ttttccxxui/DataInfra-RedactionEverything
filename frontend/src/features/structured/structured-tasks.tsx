// Copyright 2026 DataInfra-RedactionEverything Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Search,
  TableProperties,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
import { createJob, deleteJob, getJob, listJobs, updateJobDraft, type JobSummary } from '@/services/jobsApi';
import {
  createStructuredConnection,
  createStructuredJob,
  discoverStructuredConnectionDatasets,
  downloadStructuredJob,
  getStructuredPolicy,
  getStructuredProfile,
  previewStructuredDataset,
  profileStructuredDataset,
  registerStructuredConnectionDatasets,
  saveStructuredPolicy,
  testStructuredConnection,
  uploadStructuredFile,
  type StructuredColumnPolicy,
  type StructuredConnectionPayload,
  type StructuredDataset,
  type StructuredExportFormat,
  type StructuredPreview,
  type StructuredProfile,
} from '@/services/structuredApi';
import { localizeErrorMessage } from '@/utils/localizeError';
import { DatabaseConnectionCard, DiscoveredTablesCard } from './components/database-cards';
import { PreviewCard } from './components/preview-card';
import { ProfilePolicyCard } from './components/profile-policy-card';
import { StructuredFrame } from './components/structured-frame';
import { useNotice } from './hooks/use-notice';
import { useConnections, useDatasets } from './hooks/use-structured-data';
import { emptyConnection, FIELD_POLICY_PAGE_SIZE } from './lib/constants';
import {
  buildDatasetIdentityContexts,
  compareStructuredDatasetsForReview,
  datasetKey,
  isDatasetDeliveryReady,
  toggleSet,
} from './lib/dataset-utils';
import { profileToPolicy } from './lib/policy-utils';

type StructuredTaskSourceType = 'excel' | 'database';
type StructuredTaskStep = 1 | 2 | 3 | 4;
type StructuredTaskStatusFilter = 'all' | 'draft' | 'processing' | 'ready_export' | 'exporting' | 'completed';
type StructuredTaskSourceFilter = 'all' | StructuredTaskSourceType;
type PaginationItem = number | 'ellipsis';
type StructuredTaskConfig = {
  structured_workflow?: boolean;
  structured_source_type?: StructuredTaskSourceType;
  structured_step?: number;
  structured_dataset_ids?: unknown;
  structured_active_dataset_id?: unknown;
  structured_connection_id?: unknown;
  structured_export_format?: StructuredExportFormat;
  structured_delivery_job_id?: unknown;
  structured_delivery_status?: unknown;
};

const TASK_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const JOB_QUERY_PAGE_SIZE = 100;
const TASK_NAME_MAX_LENGTH = 50;
const STEP_ORDER: StructuredTaskStep[] = [1, 2, 3, 4];

const STEP_LABELS: Record<StructuredTaskStep, string> = {
  1: '上传/连接数据源',
  2: '生成匿名化方案',
  3: '预览效果',
  4: '导出匿名化文件',
};

const SOURCE_LABELS: Record<StructuredTaskSourceType, string> = {
  excel: 'Excel 文件',
  database: '数据库表',
};

const SOURCE_FILTER_OPTIONS: Array<{ value: StructuredTaskSourceFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'excel', label: 'Excel 文件' },
  { value: 'database', label: '数据库表' },
];

const TASK_STATUS_FILTER_OPTIONS: Array<{ value: StructuredTaskStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'processing', label: '处理中' },
  { value: 'ready_export', label: '待导出' },
  { value: 'exporting', label: '导出中' },
  { value: 'completed', label: '已完成' },
];

const EXPORT_FORMAT_OPTIONS: Array<{ value: StructuredExportFormat; label: string }> = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'sql', label: 'SQL' },
  { value: 'zip', label: 'ZIP' },
];

function asTaskConfig(job?: JobSummary | null): StructuredTaskConfig {
  return (job?.config ?? {}) as StructuredTaskConfig;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')));
}

function taskSourceType(job?: JobSummary | null): StructuredTaskSourceType {
  const raw = asTaskConfig(job).structured_source_type;
  return raw === 'database' ? 'database' : 'excel';
}

function taskDatasetIds(job?: JobSummary | null): string[] {
  return asStringArray(asTaskConfig(job).structured_dataset_ids);
}

function taskActiveDatasetId(job?: JobSummary | null): string {
  return asString(asTaskConfig(job).structured_active_dataset_id);
}

function taskDeliveryStatus(job?: JobSummary | null): string {
  return asString(asTaskConfig(job).structured_delivery_status);
}

function taskStep(job?: JobSummary | null): StructuredTaskStep {
  const raw = Number(asTaskConfig(job).structured_step ?? 1);
  if (raw >= 4) return 4;
  if (raw >= 3) return 3;
  if (raw >= 2) return 2;
  return 1;
}

function taskProgressPercent(job: JobSummary): number {
  const step = taskStep(job);
  return Math.round(((step - 1) / (STEP_ORDER.length - 1)) * 100);
}

function taskStatusLabel(job: JobSummary): string {
  const status = taskStatusKey(job);
  const label = TASK_STATUS_FILTER_OPTIONS.find((item) => item.value === status)?.label;
  if (label) return label;
  return '草稿';
}

function taskStatusKey(job: JobSummary): Exclude<StructuredTaskStatusFilter, 'all'> {
  const deliveryStatus = taskDeliveryStatus(job);
  if (deliveryStatus === 'completed') return 'completed';
  if (deliveryStatus === 'processing' || deliveryStatus === 'queued' || deliveryStatus === 'running') {
    return 'exporting';
  }
  const datasetCount = taskDatasetIds(job).length;
  if (taskStep(job) >= 4) return 'ready_export';
  if (taskStep(job) >= 2 || datasetCount > 0) return 'processing';
  return 'draft';
}

function taskStatusBadgeClass(job: JobSummary): string {
  switch (taskStatusKey(job)) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'exporting':
    case 'processing':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'ready_export':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-muted bg-muted/60 text-muted-foreground';
  }
}

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);

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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function defaultTaskName(date = new Date()): string {
  return `任务${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeTaskTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function mergeDatasetIds(current: string[], next: string[]): string[] {
  return Array.from(new Set([...current, ...next].filter(Boolean)));
}

function sourceIcon(type: StructuredTaskSourceType) {
  return type === 'database' ? Database : FileSpreadsheet;
}

function isWorkflowTask(job: JobSummary): boolean {
  return asTaskConfig(job).structured_workflow === true;
}

export function StructuredTasks() {
  const navigate = useNavigate();
  const [rows, setRows] = React.useState<JobSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState<StructuredTaskSourceFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<StructuredTaskStatusFilter>('all');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [taskName, setTaskName] = React.useState('');
  const [taskNamePlaceholder, setTaskNamePlaceholder] = React.useState(defaultTaskName);
  const [sourceType, setSourceType] = React.useState<StructuredTaskSourceType | ''>('');
  const [createError, setCreateError] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<JobSummary | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loaded: JobSummary[] = [];
      let nextPage = 1;
      let totalRows = 0;
      do {
        const response = await listJobs({
          job_type: 'structured_batch',
          page: nextPage,
          page_size: JOB_QUERY_PAGE_SIZE,
        });
        loaded.push(...response.jobs);
        totalRows = response.total;
        nextPage += 1;
      } while (loaded.length < totalRows);
      setRows(loaded.filter(isWorkflowTask));
    } catch (err) {
      setError(localizeErrorMessage(err, '任务加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRows();
  }, [loadRows]);

  React.useEffect(() => {
    setPage(1);
  }, [pageSize, search, sourceFilter, statusFilter]);

  const filteredRows = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows
      .filter((row) => !keyword || row.title.toLowerCase().includes(keyword))
      .filter((row) => sourceFilter === 'all' || taskSourceType(row) === sourceFilter)
      .filter((row) => statusFilter === 'all' || taskStatusKey(row) === statusFilter)
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  }, [rows, search, sourceFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = React.useMemo(
    () => getPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  );

  async function handleCreateTask() {
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
    if (rows.some((row) => normalizeTaskTitle(row.title) === normalizeTaskTitle(title))) {
      setCreateError('任务名称不可重复');
      return;
    }
    if (sourceType !== 'excel' && sourceType !== 'database') {
      setCreateError('请选择处理类型');
      return;
    }
    setCreating(true);
    setCreateError('');
    setError('');
    try {
      const job = await createJob({
        job_type: 'structured_batch',
        title,
        config: {
          structured_workflow: true,
          structured_source_type: sourceType,
          structured_step: 1,
          structured_dataset_ids: [],
          structured_export_format: 'csv',
        },
      });
      setCreateOpen(false);
      navigate(`/structured/tasks/${encodeURIComponent(job.id)}?step=1`);
    } catch (err) {
      setError(localizeErrorMessage(err, '新建任务失败'));
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteJob(deleteTarget.id);
      setDeleteTarget(null);
      await loadRows();
    } catch (err) {
      setError(localizeErrorMessage(err, '删除任务失败'));
    } finally {
      setDeleting(false);
    }
  }

  function openCreateDialog() {
    setTaskName('');
    setTaskNamePlaceholder(defaultTaskName());
    setSourceType('');
    setCreateOpen(true);
    setCreateError('');
    setError('');
  }

  return (
    <>
      <div className="saas-page flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="page-shell !max-w-[min(100%,1920px)] !px-3 !py-2 sm:!px-4 sm:!py-3">
          <div className="page-stack gap-3 overflow-visible">
            <div className="min-w-[84rem] overflow-visible rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
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
                    value={sourceFilter}
                    onValueChange={(value) => setSourceFilter(value as StructuredTaskSourceFilter)}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder="全部类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_FILTER_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as StructuredTaskStatusFilter)}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUS_FILTER_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button onClick={openCreateDialog} data-testid="structured-create-task">
                    <Plus className="size-4" />
                    新建任务
                  </Button>
                </div>
              </div>

              {error ? (
                <Alert variant="destructive" className="m-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Table className="min-w-[84rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">序号</TableHead>
                    <TableHead className="min-w-44 text-left">任务名称</TableHead>
                    <TableHead className="w-32 text-center">处理类型</TableHead>
                    <TableHead className="w-32 text-center">当前步骤</TableHead>
                    <TableHead className="w-32 text-center">数据集</TableHead>
                    <TableHead className="min-w-36 text-center">进度</TableHead>
                    <TableHead className="w-28 text-center">状态</TableHead>
                    <TableHead className="w-28 text-center">更新人</TableHead>
                    <TableHead className="w-56 min-w-56 text-center">更新时间</TableHead>
                    <TableHead className="w-40 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
                        暂无任务
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((job, index) => {
                      const sourceTypeValue = taskSourceType(job);
                      const Icon = sourceIcon(sourceTypeValue);
                      const progress = taskProgressPercent(job);
                      return (
                        <TableRow key={job.id}>
                          <TableCell className="text-center font-medium text-muted-foreground">
                            {(safePage - 1) * pageSize + index + 1}
                          </TableCell>
                          <TableCell className="text-left font-semibold text-foreground">
                            <span className="block max-w-[18rem] truncate" title={job.title}>
                              {job.title}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-foreground">
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <Icon className="size-4 text-muted-foreground" />
                              {SOURCE_LABELS[sourceTypeValue]}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-foreground">
                            {STEP_LABELS[taskStep(job)]}
                          </TableCell>
                          <TableCell className="text-center text-foreground">
                            {taskDatasetIds(job).length}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Progress value={progress} className="h-2 w-20" />
                              <span className="w-10 text-right text-foreground">{progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={taskStatusBadgeClass(job)}>
                              {taskStatusLabel(job)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-foreground">
                            {job.updated_by || job.created_by || '-'}
                          </TableCell>
                          <TableCell className="min-w-56 whitespace-nowrap text-center text-foreground">
                            {formatDateTime(job.updated_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="link" size="sm" className="h-auto px-0" asChild>
                                <Link to={`/structured/tasks/${encodeURIComponent(job.id)}?step=${taskStep(job)}`}>
                                  进入
                                </Link>
                              </Button>
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
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>共 {filteredRows.length} 条</span>
                <div className="flex items-center justify-end gap-2">
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PAGE_SIZE_OPTIONS.map((size) => (
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
                    disabled={safePage <= 1 || loading}
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
                        variant={item === safePage ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 min-w-8 px-2"
                        onClick={() => setPage(item)}
                        disabled={loading}
                        aria-current={item === safePage ? 'page' : undefined}
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
                    disabled={safePage >= totalPages || loading}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建库表处理任务</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="structured-task-name">
                任务名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="structured-task-name"
                value={taskName}
                onChange={(event) => {
                  setTaskName(event.target.value);
                  if (createError) setCreateError('');
                }}
                placeholder={taskNamePlaceholder}
                maxLength={TASK_NAME_MAX_LENGTH}
                aria-required="true"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label>
                处理类型 <span className="text-destructive">*</span>
              </Label>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="处理类型">
                {(['excel', 'database'] as const).map((type) => {
                  const Icon = sourceIcon(type);
                  const selected = sourceType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setSourceType(type);
                        if (createError) setCreateError('');
                      }}
                      className={cn(
                        'grid min-h-24 gap-2 rounded-xl border px-3 py-3 text-left transition hover:bg-muted/40',
                        selected ? 'border-primary bg-primary/5' : 'border-border',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <Icon className="size-4 text-primary" />
                          {SOURCE_LABELS[type]}
                        </span>
                        {selected ? <CheckCircle2 className="size-4 text-primary" /> : null}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {type === 'excel'
                          ? '上传 Excel 文件后生成匿名化方案。'
                          : '连接数据库，选择表或视图后生成匿名化方案。'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={() => void handleCreateTask()} disabled={creating}>
              {creating ? '创建中...' : '创建任务'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除任务"
        message={`确定删除任务「${deleteTarget?.title ?? ''}」吗？已上传的数据集不会被删除。`}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export function StructuredTaskWizard() {
  const { taskId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetsState = useDatasets();
  const connectionsState = useConnections();
  const notice = useNotice();
  const [job, setJob] = React.useState<JobSummary | null>(null);
  const [jobLoading, setJobLoading] = React.useState(true);
  const [jobError, setJobError] = React.useState('');
  const [step, setStep] = React.useState<StructuredTaskStep>(1);
  const [activeDatasetId, setActiveDatasetId] = React.useState('');
  const [profile, setProfile] = React.useState<StructuredProfile | null>(null);
  const [policy, setPolicy] = React.useState<StructuredColumnPolicy[]>([]);
  const [policyDirty, setPolicyDirty] = React.useState(false);
  const [savedPolicyDatasetId, setSavedPolicyDatasetId] = React.useState('');
  const [preview, setPreview] = React.useState<StructuredPreview | null>(null);
  const [fieldPage, setFieldPage] = React.useState(0);
  const [selectedExportIds, setSelectedExportIds] = React.useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = React.useState<StructuredExportFormat>('csv');
  const [payload, setPayload] = React.useState<StructuredConnectionPayload>(emptyConnection);
  const [activeConnectionId, setActiveConnectionId] = React.useState('');
  const [liveDiscovered, setLiveDiscovered] = React.useState<StructuredDataset[]>([]);
  const [discoveryMode, setDiscoveryMode] = React.useState<'registered' | 'live'>('registered');
  const [selectedDiscovered, setSelectedDiscovered] = React.useState<Set<string>>(new Set());

  const config = asTaskConfig(job);
  const sourceTypeValue = taskSourceType(job);
  const datasetIds = taskDatasetIds(job);
  const activeConnection =
    connectionsState.connections.find((connection) => connection.id === activeConnectionId) ?? null;
  const registeredConnectionDatasets = React.useMemo(
    () =>
      datasetsState.datasets
        .filter((dataset) => dataset.connection_id === activeConnectionId)
        .sort(compareStructuredDatasetsForReview),
    [activeConnectionId, datasetsState.datasets],
  );
  const taskDatasets = React.useMemo(
    () => {
      const explicitDatasets = datasetIds
        .map((datasetId) => datasetsState.datasets.find((dataset) => dataset.id === datasetId) ?? null)
        .filter((dataset): dataset is StructuredDataset => dataset !== null)
        .sort(compareStructuredDatasetsForReview);
      if (explicitDatasets.length || sourceTypeValue !== 'database') return explicitDatasets;
      return registeredConnectionDatasets;
    },
    [datasetIds, datasetsState.datasets, registeredConnectionDatasets, sourceTypeValue],
  );
  const selectedDataset =
    taskDatasets.find((dataset) => dataset.id === activeDatasetId) ?? taskDatasets[0] ?? null;
  const selectedDatasetReady = Boolean(selectedDataset?.policy_reviewed_at);
  const canEnterPreview = Boolean(
    selectedDataset && !policyDirty && (preview || selectedDatasetReady || savedPolicyDatasetId === selectedDataset.id),
  );
  const readyDatasets = taskDatasets.filter(isDatasetDeliveryReady);
  const discoveryDatasets = discoveryMode === 'live' ? liveDiscovered : registeredConnectionDatasets;

  const refreshJob = React.useCallback(async () => {
    if (!taskId) return null;
    setJobLoading(true);
    setJobError('');
    try {
      const nextJob = await getJob(taskId, { performance: false });
      setJob(nextJob);
      return nextJob;
    } catch (err) {
      setJobError(localizeErrorMessage(err, '库表处理任务加载失败'));
      return null;
    } finally {
      setJobLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    void refreshJob();
  }, [refreshJob]);

  React.useEffect(() => {
    const requestedStep = Number(searchParams.get('step'));
    if (requestedStep >= 1 && requestedStep <= 4) {
      setStep(requestedStep as StructuredTaskStep);
      return;
    }
    setStep(taskStep(job));
  }, [job, searchParams]);

  React.useEffect(() => {
    if (!job) return;
    setActiveDatasetId((current) => current || taskActiveDatasetId(job) || taskDatasetIds(job)[0] || '');
    setExportFormat(config.structured_export_format ?? 'csv');
    const connectionId = asString(config.structured_connection_id);
    if (connectionId) setActiveConnectionId(connectionId);
  }, [config.structured_connection_id, config.structured_export_format, job]);

  React.useEffect(() => {
    if (!activeConnectionId) {
      setActiveConnectionId(connectionsState.connections[0]?.id ?? '');
    }
  }, [activeConnectionId, connectionsState.connections]);

  React.useEffect(() => {
    setSelectedExportIds(new Set(readyDatasets.map((dataset) => dataset.id)));
  }, [readyDatasets.map((dataset) => dataset.id).join('|')]);

  React.useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setPolicy([]);
    setPolicyDirty(false);
    setPreview(null);
    setFieldPage(0);
    if (!selectedDataset) return undefined;
    const hasStoredState = Boolean(
      selectedDataset.profile_updated_at || selectedDataset.policy_updated_at || selectedDataset.policy_reviewed_at,
    );
    if (!hasStoredState) return undefined;
    void notice.run('restoreStructuredTaskPolicy', async () => {
      const [storedProfile, storedPolicy] = await Promise.all([
        getStructuredProfile(selectedDataset.id),
        getStructuredPolicy(selectedDataset.id),
      ]);
      if (cancelled) return;
      const restoredPolicy = storedPolicy.columns.length
        ? storedPolicy.columns
        : storedProfile.columns.map(profileToPolicy);
      const restoredPreview = selectedDataset.policy_reviewed_at
        ? await previewStructuredDataset(selectedDataset.id)
        : null;
      if (cancelled) return;
      setProfile(storedProfile);
      setPolicy(restoredPreview?.policy ?? restoredPolicy);
      setPolicyDirty(false);
      setPreview(restoredPreview);
    });
    return () => {
      cancelled = true;
    };
  }, [
    selectedDataset?.id,
    selectedDataset?.policy_reviewed_at,
    selectedDataset?.policy_updated_at,
    selectedDataset?.profile_updated_at,
  ]);

  async function patchTaskConfig(patch: Partial<StructuredTaskConfig>, baseJob = job) {
    if (!baseJob) return null;
    const nextJob = await updateJobDraft(baseJob.id, {
      config: {
        ...baseJob.config,
        ...patch,
        structured_workflow: true,
      },
    });
    setJob(nextJob);
    return nextJob;
  }

  async function ensureDatabaseTaskDatasets() {
    if (sourceTypeValue !== 'database') return null;
    if (!activeConnectionId || registeredConnectionDatasets.length === 0) return null;
    const nextIds = mergeDatasetIds(datasetIds, registeredConnectionDatasets.map((dataset) => dataset.id));
    if (
      nextIds.length === datasetIds.length &&
      nextIds.every((datasetId, index) => datasetId === datasetIds[index]) &&
      config.structured_connection_id === activeConnectionId
    ) {
      return job;
    }
    setActiveDatasetId((current) => current || registeredConnectionDatasets[0]?.id || '');
    return patchTaskConfig({
      structured_dataset_ids: nextIds,
      structured_active_dataset_id: activeDatasetId || registeredConnectionDatasets[0]?.id || '',
      structured_connection_id: activeConnectionId,
      structured_step: Math.max(taskStep(job), 2),
    });
  }

  function goStep(nextStep: StructuredTaskStep) {
    if (!canGoStep(nextStep)) return;
    void (async () => {
      const ensuredJob = nextStep === 2 ? await ensureDatabaseTaskDatasets() : null;
      const baseJob = ensuredJob ?? job;
      setStep(nextStep);
      setSearchParams({ step: String(nextStep) });
      void patchTaskConfig({ structured_step: Math.max(taskStep(baseJob), nextStep) }, baseJob);
    })();
  }

  function canGoStep(targetStep: StructuredTaskStep): boolean {
    if (targetStep === 1) return true;
    if (targetStep === 2) return taskDatasets.length > 0;
    if (targetStep === 3) return canEnterPreview;
    if (targetStep === 4) return readyDatasets.length > 0;
    return false;
  }

  async function handleUpload(files: FileList | null) {
    const fileList = Array.from(files ?? []);
    if (!fileList.length) return;
    await notice.run('structuredTaskUpload', async () => {
      const uploaded: StructuredDataset[] = [];
      const failures: string[] = [];
      for (const file of fileList) {
        try {
          const response = await uploadStructuredFile(file);
          uploaded.push(...response.datasets);
        } catch (err) {
          failures.push(`${file.name}: ${localizeErrorMessage(err, '上传失败')}`);
        }
      }
      if (uploaded.length) {
        await datasetsState.refresh();
        const nextIds = mergeDatasetIds(datasetIds, uploaded.map((dataset) => dataset.id));
        setActiveDatasetId(uploaded[0].id);
        await patchTaskConfig({
          structured_dataset_ids: nextIds,
          structured_active_dataset_id: uploaded[0].id,
          structured_step: Math.max(taskStep(job), 2),
        });
        setStep(2);
        setSearchParams({ step: '2' });
      }
      if (failures.length && !uploaded.length) throw new Error(failures.join('；'));
      if (failures.length) {
        notice.setMessage(`成功导入 ${uploaded.length} 个数据集，${failures.length} 个文件失败：${failures.join('；')}`);
      }
    });
  }

  function selectConnection(connectionId: string) {
    if (connectionId === activeConnectionId) return;
    setActiveConnectionId(connectionId);
    setLiveDiscovered([]);
    setDiscoveryMode('registered');
    setSelectedDiscovered(new Set());
  }

  async function handleTestConnection() {
    await notice.run('testConnection', async () => {
      const result = await testStructuredConnection(payload);
      if (!result.ok) throw new Error(result.message);
      notice.setMessage(`连接成功，发现 ${result.dataset_count} 个表/视图`);
    });
  }

  async function handleSaveConnection() {
    await notice.run('saveConnection', async () => {
      const connection = await createStructuredConnection(payload);
      await connectionsState.refresh();
      setActiveConnectionId(connection.id);
      setLiveDiscovered([]);
      setDiscoveryMode('registered');
      setSelectedDiscovered(new Set());
      await patchTaskConfig({ structured_connection_id: connection.id });
      notice.setMessage('数据库连接已保存');
    });
  }

  async function handleDiscover() {
    if (!activeConnectionId) return;
    await notice.run('discover', async () => {
      const response = await discoverStructuredConnectionDatasets(activeConnectionId);
      setLiveDiscovered(response.datasets);
      setDiscoveryMode('live');
      setSelectedDiscovered(new Set());
      notice.setMessage(`发现 ${response.datasets.length} 个表/视图`);
    });
  }

  async function handleRegisterDiscovered() {
    if (!activeConnectionId || selectedDiscovered.size === 0) return;
    await notice.run('register', async () => {
      const selections = liveDiscovered
        .filter((dataset) => selectedDiscovered.has(datasetKey(dataset)))
        .map((dataset) => ({
          schema_name: dataset.schema_name,
          table_name: dataset.table_name,
          name: dataset.name,
        }));
      const response = await registerStructuredConnectionDatasets(activeConnectionId, selections);
      await datasetsState.refresh();
      const nextIds = mergeDatasetIds(datasetIds, response.datasets.map((dataset) => dataset.id));
      setActiveDatasetId(response.datasets[0]?.id ?? activeDatasetId);
      await patchTaskConfig({
        structured_dataset_ids: nextIds,
        structured_active_dataset_id: response.datasets[0]?.id ?? activeDatasetId,
        structured_connection_id: activeConnectionId,
        structured_step: Math.max(taskStep(job), 2),
      });
      setStep(2);
      setSearchParams({ step: '2' });
    });
  }

  async function handleProfile() {
    if (!selectedDataset) return;
    await notice.run('profileStructuredTask', async () => {
      const nextProfile = await profileStructuredDataset(selectedDataset.id);
      setProfile(nextProfile);
      setPolicy(nextProfile.columns.map(profileToPolicy));
      setPolicyDirty(true);
      setSavedPolicyDatasetId('');
      setPreview(null);
      setFieldPage(0);
      await patchTaskConfig({
        structured_active_dataset_id: selectedDataset.id,
        structured_step: Math.max(taskStep(job), 2),
      });
    });
  }

  async function handleSavePolicy() {
    if (!selectedDataset || !profile) return;
    await notice.run('saveStructuredTaskPolicy', async () => {
      const saved = await saveStructuredPolicy(selectedDataset.id, policy);
      setPolicy(saved.columns.length ? saved.columns : policy);
      setPolicyDirty(false);
      setSavedPolicyDatasetId(selectedDataset.id);
      setPreview(null);
      await datasetsState.refresh();
      await patchTaskConfig({
        structured_active_dataset_id: selectedDataset.id,
        structured_step: Math.max(taskStep(job), 2),
      });
      showToast('匿名化方案已保存。', 'success');
    });
  }

  async function handleGeneratePreview() {
    if (!selectedDataset) return;
    await notice.run('previewStructuredTask', async () => {
      const nextPreview = await previewStructuredDataset(selectedDataset.id);
      setPreview(nextPreview);
      setPolicy(nextPreview.policy);
      setPolicyDirty(false);
    });
  }

  async function waitForStructuredDeliveryJob(jobId: string): Promise<string> {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const detail = await getJob(jobId, { performance: false });
      if (['completed', 'failed', 'cancelled'].includes(detail.status)) return detail.status;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return 'processing';
  }

  async function handleExportAndDownloadDelivery() {
    const ids = readyDatasets.map((dataset) => dataset.id).filter((datasetId) => selectedExportIds.has(datasetId));
    if (!ids.length) {
      notice.setError('请至少选择一个已完成字段策略的数据集');
      return;
    }
    await notice.run('structuredTaskExport', async () => {
      const response = await createStructuredJob({
        title: `${job?.title ?? '库表处理任务'} - 匿名化导出`,
        dataset_ids: ids,
        export_format: exportFormat,
        skip_review: true,
        auto_submit: true,
      });
      const jobWithDelivery = await patchTaskConfig({
        structured_export_format: exportFormat,
        structured_delivery_job_id: response.job.id,
        structured_delivery_status: response.job.status || 'queued',
        structured_step: 4,
      });
      const finalStatus = await waitForStructuredDeliveryJob(response.job.id);
      await patchTaskConfig(
        {
          structured_delivery_job_id: response.job.id,
          structured_delivery_status: finalStatus,
          structured_step: 4,
        },
        jobWithDelivery ?? job,
      );
      if (finalStatus === 'completed') {
        await downloadStructuredJob(response.job.id);
        showToast('匿名化文件已生成并开始下载。', 'success');
        notice.setMessage(`匿名化文件已生成并开始下载：${response.job.id}`);
      } else if (finalStatus === 'failed' || finalStatus === 'cancelled') {
        throw new Error(`导出任务未完成：${finalStatus}`);
      } else {
        notice.setMessage(`导出任务仍在处理，可稍后刷新：${response.job.id}`);
      }
    });
  }

  if (jobLoading) {
    return (
      <StructuredFrame eyebrow="库表处理" title="库表处理任务" description="正在加载任务...">
        <Card className="page-surface border-border/70 p-8 text-center text-muted-foreground">
          正在加载任务...
        </Card>
      </StructuredFrame>
    );
  }

  if (jobError || !job) {
    return (
      <StructuredFrame eyebrow="库表处理" title="库表处理任务" description="任务不可用">
        <Alert variant="destructive">
          <AlertDescription>{jobError || '任务不存在'}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/structured">
            <ChevronLeft className="size-4" />
            返回任务列表
          </Link>
        </Button>
      </StructuredFrame>
    );
  }

  return (
    <StructuredFrame
      eyebrow=""
      title={job.title}
      description=""
      notices={notice}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/structured">
            <ChevronLeft className="size-4" />
            返回任务列表
          </Link>
        </Button>
      }
    >
      <TaskStepProgress currentStep={step} canGoStep={canGoStep} goStep={goStep} />
      <TaskDatasetStrip
        datasets={taskDatasets}
        activeDatasetId={selectedDataset?.id ?? ''}
        onSelect={(datasetId) => {
          setActiveDatasetId(datasetId);
          void patchTaskConfig({ structured_active_dataset_id: datasetId });
        }}
      />
      {step === 1 ? (
        <TaskStepDataSource
          sourceType={sourceTypeValue}
          taskDatasets={taskDatasets}
          noticeBusy={notice.busy}
          onUpload={handleUpload}
          payload={payload}
          connections={connectionsState.connections}
          activeConnection={activeConnection}
          activeConnectionId={activeConnectionId}
          discoveryDatasets={discoveryDatasets}
          discoveryMode={discoveryMode}
          selectedDiscovered={selectedDiscovered}
          onPayloadChange={setPayload}
          onSelectConnection={selectConnection}
          onTestConnection={() => void handleTestConnection()}
          onSaveConnection={() => void handleSaveConnection()}
          onDiscover={() => void handleDiscover()}
          onToggleDiscovered={(key) => setSelectedDiscovered(toggleSet(selectedDiscovered, key))}
          onSelectAllDiscovered={() => setSelectedDiscovered(new Set(discoveryDatasets.map(datasetKey)))}
          onSelectDiscoveredKeys={(keys) => setSelectedDiscovered(new Set([...selectedDiscovered, ...keys]))}
          onClearDiscovered={() => setSelectedDiscovered(new Set())}
          onRegisterDiscovered={() => void handleRegisterDiscovered()}
          canNext={taskDatasets.length > 0}
          onNext={() => goStep(2)}
        />
      ) : null}
      {step === 2 ? (
        <TaskStepPolicy
          dataset={selectedDataset}
          profile={profile}
          policy={policy}
          fieldPage={fieldPage}
          busy={notice.busy}
          onFieldPageChange={setFieldPage}
          onPolicyChange={(nextPolicy) => {
            setPolicy(nextPolicy);
            setPolicyDirty(true);
            setSavedPolicyDatasetId('');
            setPreview(null);
          }}
          onProfile={() => void handleProfile()}
          onSave={() => void handleSavePolicy()}
          onNext={() => goStep(3)}
          canNext={canEnterPreview}
          onBack={() => goStep(1)}
        />
      ) : null}
      {step === 3 ? (
        <TaskStepPreview
          dataset={selectedDataset}
          profile={profile}
          preview={preview}
          busy={notice.busy}
          onBack={() => goStep(2)}
          onPreview={() => void handleGeneratePreview()}
          onNext={() => goStep(4)}
          canNext={readyDatasets.length > 0}
        />
      ) : null}
      {step === 4 ? (
        <TaskStepExport
          datasets={readyDatasets}
          selectedIds={selectedExportIds}
          exportFormat={exportFormat}
          busy={notice.busy}
          onToggle={(datasetId) => setSelectedExportIds(toggleSet(selectedExportIds, datasetId))}
          onSelectAll={() => setSelectedExportIds(new Set(readyDatasets.map((dataset) => dataset.id)))}
          onClear={() => setSelectedExportIds(new Set())}
          onFormatChange={(value) => {
            setExportFormat(value);
            void patchTaskConfig({ structured_export_format: value, structured_delivery_job_id: '', structured_delivery_status: '' });
          }}
          onExport={() => void handleExportAndDownloadDelivery()}
          onBack={() => goStep(3)}
        />
      ) : null}
    </StructuredFrame>
  );
}

function TaskStepProgress({
  currentStep,
  canGoStep,
  goStep,
}: {
  currentStep: StructuredTaskStep;
  canGoStep: (step: StructuredTaskStep) => boolean;
  goStep: (step: StructuredTaskStep) => void;
}) {
  return (
    <nav className="shrink-0 overflow-x-auto pb-1" aria-label="库表处理步骤">
      <ol className="mx-auto flex min-w-[38rem] max-w-4xl items-start justify-between px-8 py-3">
        {STEP_ORDER.map((stepNumber, index) => {
          const completed = stepNumber < currentStep;
          const current = stepNumber === currentStep;
          const visitable = canGoStep(stepNumber);
          return (
            <li key={stepNumber} className="relative flex flex-1 flex-col items-center gap-2">
              {index < STEP_ORDER.length - 1 ? (
                <span
                  className={cn(
                    'absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                    stepNumber < currentStep ? 'bg-primary' : 'bg-border',
                  )}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                className={cn(
                  'relative z-10 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  (completed || current) && 'border-primary bg-primary text-primary-foreground',
                  !completed && !current && visitable && 'border-primary/70 bg-background text-primary',
                  !completed && !current && !visitable && 'cursor-not-allowed border-border bg-white text-muted-foreground',
                )}
                disabled={current || !visitable}
                onClick={() => goStep(stepNumber)}
              >
                {completed ? <Check className="size-4" /> : stepNumber}
              </button>
              <span className={cn('relative z-10 text-center text-sm font-medium', (completed || current) ? 'text-primary' : 'text-muted-foreground')}>
                {STEP_LABELS[stepNumber]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TaskDatasetStrip({
  datasets,
  activeDatasetId,
  onSelect,
}: {
  datasets: StructuredDataset[];
  activeDatasetId: string;
  onSelect: (datasetId: string) => void;
}) {
  if (!datasets.length) return null;
  const identityContextById = buildDatasetIdentityContexts(datasets, []);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <span className="text-sm font-medium">当前任务数据集</span>
      {datasets.map((dataset) => {
        const active = dataset.id === activeDatasetId;
        return (
          <button
            key={dataset.id}
            type="button"
            onClick={() => onSelect(dataset.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition hover:bg-muted/50',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
            )}
          >
            {dataset.table_name || dataset.name}
            {identityContextById.get(dataset.id)?.duplicateCount ? '' : ''}
          </button>
        );
      })}
    </div>
  );
}

function TaskStepDataSource({
  sourceType,
  taskDatasets,
  noticeBusy,
  onUpload,
  payload,
  connections,
  activeConnection,
  activeConnectionId,
  discoveryDatasets,
  discoveryMode,
  selectedDiscovered,
  onPayloadChange,
  onSelectConnection,
  onTestConnection,
  onSaveConnection,
  onDiscover,
  onToggleDiscovered,
  onSelectAllDiscovered,
  onSelectDiscoveredKeys,
  onClearDiscovered,
  onRegisterDiscovered,
  canNext,
  onNext,
}: {
  sourceType: StructuredTaskSourceType;
  taskDatasets: StructuredDataset[];
  noticeBusy: string;
  onUpload: (files: FileList | null) => void;
  payload: StructuredConnectionPayload;
  connections: ReturnType<typeof useConnections>['connections'];
  activeConnection: ReturnType<typeof useConnections>['connections'][number] | null;
  activeConnectionId: string;
  discoveryDatasets: StructuredDataset[];
  discoveryMode: 'registered' | 'live';
  selectedDiscovered: Set<string>;
  onPayloadChange: (payload: StructuredConnectionPayload) => void;
  onSelectConnection: (id: string) => void;
  onTestConnection: () => void;
  onSaveConnection: () => void;
  onDiscover: () => void;
  onToggleDiscovered: (key: string) => void;
  onSelectAllDiscovered: () => void;
  onSelectDiscoveredKeys: (keys: string[]) => void;
  onClearDiscovered: () => void;
  onRegisterDiscovered: () => void;
  canNext: boolean;
  onNext: () => void;
}) {
  if (sourceType === 'database') {
    return (
      <>
        <section className="grid gap-3 xl:grid-cols-[minmax(23rem,0.78fr)_minmax(0,1.22fr)]">
          <DatabaseConnectionCard
            payload={payload}
            connections={connections}
            activeConnection={activeConnection}
            activeConnectionId={activeConnectionId}
            busy={noticeBusy}
            onPayloadChange={onPayloadChange}
            onSelectConnection={onSelectConnection}
            onTest={onTestConnection}
            onSave={onSaveConnection}
            onDeleteConnection={() => undefined}
            onDiscover={onDiscover}
          />
          <DiscoveredTablesCard
            datasets={discoveryDatasets}
            selected={selectedDiscovered}
            mode={discoveryMode}
            activeConnectionId={activeConnectionId}
            hasActiveConnection={Boolean(activeConnectionId)}
            busy={noticeBusy}
            onToggle={onToggleDiscovered}
            onSelectAll={onSelectAllDiscovered}
            onSelectKeys={onSelectDiscoveredKeys}
            onClear={onClearDiscovered}
            onRegister={onRegisterDiscovered}
          />
        </section>
        <TaskStepFooterNext canNext={canNext} onNext={onNext} />
      </>
    );
  }

  return (
    <>
      <section className="grid min-h-[30rem] items-stretch gap-3 xl:grid-cols-[minmax(0,1.14fr)_minmax(22rem,0.86fr)]">
        <div className="flex min-h-[30rem]">
          <Label
            htmlFor="structured-task-upload"
            className="group flex min-h-[30rem] flex-1 cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-muted-foreground/20 bg-card px-5 py-4 text-center transition-all hover:border-muted-foreground/40 hover:bg-muted/20"
          >
            <Upload className="mb-4 size-8 text-primary transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
            <span className="text-base font-medium">拖放 Excel 文件，或点击选择</span>
            <span className="mt-2 text-xs text-muted-foreground">支持 .xlsx、.xls、.csv</span>
          </Label>
          <Input
            id="structured-task-upload"
            className="hidden"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              onUpload(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
        </div>
        <DatasetSummaryCard datasets={taskDatasets} />
      </section>
      <TaskStepFooterNext canNext={canNext} onNext={onNext} />
    </>
  );
}

function TaskStepFooterNext({ canNext, onNext }: { canNext: boolean; onNext: () => void }) {
  return (
    <div className="flex justify-center rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[var(--shadow-control)]">
      <Button onClick={onNext} disabled={!canNext}>
        下一步：生成匿名化方案
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function DatasetSummaryCard({ datasets }: { datasets: StructuredDataset[] }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const totalPages = Math.max(1, Math.ceil(datasets.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleDatasets = datasets.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = React.useMemo(
    () => getPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  );

  React.useEffect(() => {
    setPage(1);
  }, [datasets.length, pageSize]);

  return (
    <Card className="page-surface flex min-h-[30rem] flex-col border-border/70 shadow-[var(--shadow-control)]">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="text-sm">已上传队列</CardTitle>
        </div>
        <Badge variant="outline">已上传 {datasets.length}</Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 overflow-x-auto">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 whitespace-nowrap text-center">序号</TableHead>
                <TableHead className="text-left">数据集</TableHead>
                <TableHead className="w-28 text-center">总字段数</TableHead>
                <TableHead className="w-28 text-center">总行数</TableHead>
                <TableHead className="w-28 text-center">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-[24rem] text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <TableProperties className="size-5" />
                      <span className="text-sm">暂无数据集</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                visibleDatasets.map((dataset, index) => (
                  <TableRow key={dataset.id}>
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {(safePage - 1) * pageSize + index + 1}
                    </TableCell>
                    <TableCell className="text-left">
                      <span
                        className="block max-w-[18rem] truncate font-medium"
                        title={dataset.table_name || dataset.name}
                      >
                        {dataset.table_name || dataset.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{dataset.column_count}</TableCell>
                    <TableCell className="text-center">{dataset.row_count_estimate ?? '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="border-[var(--success-border)] text-[var(--success-foreground)]">
                        已上传
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>共 {datasets.length} 条</span>
          <div className="flex items-center justify-end gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PAGE_SIZE_OPTIONS.map((size) => (
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
              disabled={safePage <= 1}
            >
              上一页
            </Button>
            {paginationItems.map((item, index) =>
              item === 'ellipsis' ? (
                <span
                  key={`registered-dataset-ellipsis-${index}`}
                  className="flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-foreground"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={item}
                  variant={item === safePage ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 min-w-8 px-2"
                  onClick={() => setPage(item)}
                  aria-current={item === safePage ? 'page' : undefined}
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
              disabled={safePage >= totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskStepPolicy({
  dataset,
  profile,
  policy,
  fieldPage,
  busy,
  onFieldPageChange,
  onPolicyChange,
  onProfile,
  onSave,
  onNext,
  canNext,
  onBack,
}: {
  dataset: StructuredDataset | null;
  profile: StructuredProfile | null;
  policy: StructuredColumnPolicy[];
  fieldPage: number;
  busy: string;
  onFieldPageChange: (page: number) => void;
  onPolicyChange: (policy: StructuredColumnPolicy[]) => void;
  onProfile: () => void;
  onSave: () => void;
  onNext: () => void;
  canNext: boolean;
  onBack: () => void;
}) {
  const pageCount = Math.max(1, Math.ceil((profile?.columns.length ?? 0) / FIELD_POLICY_PAGE_SIZE));
  return (
    <section className="grid min-h-[34rem] content-start gap-3">
      <ProfilePolicyCard
        dataset={dataset}
        profile={profile}
        policy={policy}
        fieldPage={Math.min(fieldPage, pageCount - 1)}
        currentPageReviewed={false}
        reviewedPageCount={0}
        pageCount={pageCount}
        onFieldPageChange={onFieldPageChange}
        onPolicyChange={onPolicyChange}
      />
      <Card className="page-surface border-border/70 shadow-[var(--shadow-control)]">
        <CardContent className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="size-4" />
              上一步
            </Button>
            <Button onClick={onProfile} disabled={!dataset || Boolean(busy)}>
              <ListChecks className="size-4" />
              {busy === 'profileStructuredTask' ? '生成中...' : '生成匿名化方案'}
            </Button>
            <Button
              variant="default"
              onClick={onSave}
              disabled={!dataset || !profile || policy.length === 0 || Boolean(busy)}
            >
              <Save className="size-4" />
              {busy === 'saveStructuredTaskPolicy' ? '保存中...' : '保存'}
            </Button>
            <Button onClick={onNext} disabled={!canNext || Boolean(busy)}>
              下一步：预览效果
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TaskStepPreview({
  dataset,
  profile,
  preview,
  busy,
  onBack,
  onPreview,
  onNext,
  canNext,
}: {
  dataset: StructuredDataset | null;
  profile: StructuredProfile | null;
  preview: StructuredPreview | null;
  busy: string;
  onBack: () => void;
  onPreview: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <section className="grid min-h-[34rem] gap-3">
      <PreviewCard
        preview={preview}
        profile={profile}
        loading={busy === 'previewStructuredTask' || busy === 'saveStructuredTaskPolicy'}
      />
      <Card className="page-surface border-border/70 shadow-[var(--shadow-control)]">
        <CardContent className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="size-4" />
              上一步
            </Button>
            <Button variant="outline" onClick={onPreview} disabled={!dataset || Boolean(busy)}>
              <RefreshCw className="size-4" />
              {busy === 'previewStructuredTask' ? '生成中...' : '重新生成预览'}
            </Button>
            <Button onClick={onNext} disabled={!canNext}>
              下一步：导出匿名化文件
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TaskStepExport({
  datasets,
  selectedIds,
  exportFormat,
  busy,
  onToggle,
  onSelectAll,
  onClear,
  onFormatChange,
  onExport,
  onBack,
}: {
  datasets: StructuredDataset[];
  selectedIds: Set<string>;
  exportFormat: StructuredExportFormat;
  busy: string;
  onToggle: (datasetId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onFormatChange: (format: StructuredExportFormat) => void;
  onExport: () => void;
  onBack: () => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [policyCounts, setPolicyCounts] = React.useState<Record<string, number>>({});
  const totalPages = Math.max(1, Math.ceil(datasets.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleDatasets = datasets.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = React.useMemo(
    () => getPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  );

  React.useEffect(() => {
    setPage(1);
  }, [datasets.length, pageSize]);

  React.useEffect(() => {
    let cancelled = false;
    const readyIds = datasets.map((dataset) => dataset.id).join('|');
    if (!readyIds) {
      setPolicyCounts({});
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(
      datasets.map(async (dataset) => {
        try {
          const response = await getStructuredPolicy(dataset.id);
          const count = response.columns.filter((column) => column.enabled && column.action !== 'keep').length;
          return [dataset.id, count] as const;
        } catch {
          return [dataset.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      entries.forEach(([datasetId, count]) => {
        if (typeof count === 'number') next[datasetId] = count;
      });
      setPolicyCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [datasets]);

  return (
    <section className="grid gap-3">
      <Card className="page-surface border-border/70 shadow-[var(--shadow-control)]">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <CardTitle className="text-sm">选择导出数据集</CardTitle>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-sm text-muted-foreground">导出格式</Label>
              <Select value={exportFormat} onValueChange={(value) => onFormatChange(value as StructuredExportFormat)}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={onSelectAll} disabled={datasets.length === 0}>
              全选
            </Button>
            <Button variant="outline" size="sm" onClick={onClear} disabled={selectedIds.size === 0}>
                清空
              </Button>
            <Badge variant="outline">已选 {selectedIds.size}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
              <Table className="min-w-[54rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 whitespace-nowrap text-center">选择</TableHead>
                    <TableHead className="w-16 whitespace-nowrap text-center">序号</TableHead>
                    <TableHead className="text-left">数据集</TableHead>
                    <TableHead className="w-28 text-center">总字段数</TableHead>
                    <TableHead className="w-36 text-center">匿名化字段数量</TableHead>
                    <TableHead className="w-28 text-center">总行数</TableHead>
                    <TableHead className="w-28 text-center">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                        暂无可导出的数据集
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleDatasets.map((dataset, index) => (
                      <TableRow key={dataset.id}>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={selectedIds.has(dataset.id)}
                              onCheckedChange={() => onToggle(dataset.id)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium text-muted-foreground">
                          {(safePage - 1) * pageSize + index + 1}
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="font-medium">{dataset.table_name || dataset.name}</div>
                        </TableCell>
                        <TableCell className="text-center">{dataset.column_count}</TableCell>
                        <TableCell className="text-center">
                          {Object.prototype.hasOwnProperty.call(policyCounts, dataset.id) ? policyCounts[dataset.id] : '-'}
                        </TableCell>
                        <TableCell className="text-center">{dataset.row_count_estimate ?? '-'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="border-[var(--success-border)] text-[var(--success-foreground)]">
                            已复核
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>共 {datasets.length} 条</span>
              <div className="flex items-center justify-end gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PAGE_SIZE_OPTIONS.map((size) => (
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
                  disabled={safePage <= 1}
                >
                  上一页
                </Button>
                {paginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`structured-export-ellipsis-${index}`}
                      className="flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === safePage ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 min-w-8 px-2"
                      onClick={() => setPage(item)}
                      aria-current={item === safePage ? 'page' : undefined}
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
                  disabled={safePage >= totalPages}
                >
                  下一页
                </Button>
              </div>
          </div>
        </CardContent>
      </Card>
      <Card className="page-surface border-border/70 shadow-[var(--shadow-control)]">
        <CardContent className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="size-4" />
              上一步
            </Button>
            <Button onClick={onExport} disabled={selectedIds.size === 0 || Boolean(busy)}>
              <Download className="size-4" />
              {busy === 'structuredTaskExport' ? '导出中...' : '导出匿名化文件'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
