// Copyright 2026 DataInfra-RedactionEverything Contributors

import { memo, useEffect, useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight, Upload, X } from 'lucide-react';
import type { useDropzone } from 'react-dropzone';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ImportInboxDialog } from './import-inbox-dialog';

import type { BatchWizardMode } from '@/services/batchPipeline';
import { isPreviewBatchJobId } from '../lib/batch-preview-fixtures';
import type { BatchRow, BatchUploadIssue, BatchUploadProgress, Step } from '../types';

const QUEUE_DEFAULT_PAGE_SIZE = 10;
const QUEUE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type PaginationItem = number | 'ellipsis';

function formatFileSize(bytes: number | undefined): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileType(fileType: unknown, filename?: string): string {
  const raw = String(fileType ?? '').toLowerCase();
  const name = String(filename ?? '').toLowerCase();
  if (raw.includes('image') || /\.(jpe?g|png|webp|tiff?|bmp)$/i.test(name)) return 'image';
  if (raw.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (raw.includes('docx') || raw.includes('doc') || raw.includes('word') || /\.(docx?|wps)$/i.test(name)) {
    return 'docx';
  }
  if (raw.includes('txt') || raw.includes('text') || name.endsWith('.txt')) return 'txt';
  return raw || '-';
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

interface BatchStep2UploadProps {
  mode: BatchWizardMode;
  activeJobId: string | null;
  rows: BatchRow[];
  loading: boolean;
  isDragActive: boolean;
  getRootProps: () => Record<string, unknown>;
  getInputProps: ReturnType<typeof useDropzone>['getInputProps'];
  uploadIssues: BatchUploadIssue[];
  uploadProgress?: BatchUploadProgress | null;
  clearUploadIssues: () => void;
  failedUploadCount?: number;
  retryFailedUploads?: () => void;
  goStep: (s: Step) => void;
  removeRow: (fileId: string) => Promise<void>;
  clearRows: () => Promise<void>;
  /** 内网落地目录导入完成后的 rows 刷新回调（缺省不显示导入入口） */
  onInboxImported?: () => void;
}

function BatchStep2UploadInner({
  mode,
  activeJobId,
  rows,
  loading,
  isDragActive,
  getRootProps,
  getInputProps,
  uploadIssues,
  uploadProgress,
  clearUploadIssues,
  failedUploadCount = 0,
  retryFailedUploads,
  goStep,
  removeRow,
  clearRows,
  onInboxImported,
}: BatchStep2UploadProps) {
  const t = useT();
  const previewJob = activeJobId ? isPreviewBatchJobId(activeJobId) : false;
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  // 万级队列不能无界渲染（6720 文件 ≈ 4 万 DOM 节点且每个进度 tick 全量重渲）。
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(QUEUE_DEFAULT_PAGE_SIZE);
  const queueTotalPages = Math.max(1, Math.ceil(rows.length / queuePageSize));
  const queueSafePage = Math.min(Math.max(1, queuePage), queueTotalPages);
  const queuePaginationItems = useMemo(
    () => getPaginationItems(queueSafePage, queueTotalPages),
    [queueSafePage, queueTotalPages],
  );
  useEffect(() => {
    setQueuePage((prev) => Math.min(Math.max(1, prev), queueTotalPages));
  }, [queueTotalPages]);
  const pagedRows = useMemo(
    () => rows.slice((queueSafePage - 1) * queuePageSize, queueSafePage * queuePageSize),
    [rows, queueSafePage, queuePageSize],
  );
  const handleQueuePageSizeChange = (pageSize: number) => {
    setQueuePageSize(pageSize);
    setQueuePage(1);
  };

  const handleRemove = async (fileId: string) => {
    setPendingRemoveId(fileId);
    try {
      await removeRow(fileId);
    } finally {
      setPendingRemoveId(null);
    }
  };

  const handleClear = async () => {
    if (!rows.length) return;
    if (
      !window.confirm(t('batchWizard.step2.clearConfirm').replace('{count}', String(rows.length)))
    ) {
      return;
    }
    setClearing(true);
    try {
      await clearRows();
    } finally {
      setClearing(false);
    }
  };

  const dropHint =
    mode === 'smart'
      ? t('batchWizard.step2.dropHintSmart')
      : mode === 'image'
        ? t('batchWizard.step2.dropHintImage')
        : t('batchWizard.step2.dropHintText');
  const uploadPercent =
    uploadProgress && uploadProgress.total > 0
      ? Math.round((uploadProgress.completed / uploadProgress.total) * 100)
      : 0;
  const nextDisabled = !rows.length || loading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="batch-step2-upload">
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto xl:grid-cols-[minmax(0,1.14fr)_minmax(22rem,0.86fr)] xl:overflow-hidden">
        <div className="flex min-h-0 flex-col gap-3">
          {uploadIssues.length > 0 && (
            <Card
              className="rounded-[20px] border-destructive/30 bg-destructive/5 shadow-[var(--shadow-control)]"
              role="alert"
              aria-live="polite"
              data-testid="upload-issues"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-3 py-2">
                <CardTitle className="text-sm text-destructive">
                  {t('batchWizard.step2.uploadIssuesTitle').replace(
                    '{count}',
                    String(uploadIssues.length),
                  )}
                </CardTitle>
                <div className="flex items-center gap-1">
                  {failedUploadCount > 0 && retryFailedUploads && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={loading}
                      onClick={retryFailedUploads}
                      data-testid="retry-failed-uploads"
                    >
                      {t('batchWizard.step2.retryFailed').replace(
                        '{count}',
                        String(failedUploadCount),
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearUploadIssues}
                    data-testid="upload-issues-dismiss"
                  >
                    {t('batchWizard.step2.dismissIssues')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-28 space-y-1.5 overflow-y-auto px-3 pb-3 pt-0">
                {uploadIssues.slice(0, 5).map((issue) => (
                  <div
                    key={issue.id}
                    className="grid gap-0.5 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.8fr)] sm:gap-2"
                  >
                    <p className="truncate font-medium text-foreground" title={issue.filename}>
                      {issue.filename}
                    </p>
                    <p className="truncate text-muted-foreground" title={issue.reason}>
                      {issue.reason}
                    </p>
                  </div>
                ))}
                {uploadIssues.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    {t('batchWizard.step2.moreIssues').replace(
                      '{count}',
                      String(uploadIssues.length - 5),
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Drop zone */}
          <Card
            {...getRootProps()}
            className={cn(
              'min-h-[160px] flex-1 border-2 border-dashed flex flex-col items-center justify-center rounded-[20px] px-5 py-4 cursor-pointer transition-all xl:min-h-[190px]',
              isDragActive
                ? 'border-primary bg-background shadow-sm'
                : 'border-muted-foreground/20 hover:border-muted-foreground/40',
              loading && 'opacity-50 pointer-events-none',
            )}
            data-testid="drop-zone"
          >
            <input {...getInputProps({ 'aria-label': t('batchWizard.step2.dropHint') })} />
            <Upload
              className={cn(
                'mb-4 size-8 text-primary transition-transform duration-300',
                isDragActive && 'scale-110 animate-pulse',
              )}
              aria-hidden="true"
            />
            <p className="text-base font-medium">{t('batchWizard.step2.dropHint')}</p>
            <p className="mt-2 max-w-full truncate text-xs text-muted-foreground" title={dropHint}>
              {dropHint}
            </p>
          </Card>

          {loading && uploadProgress && (
            <Card
              className="rounded-[20px] border-border/70 shadow-[var(--shadow-control)]"
              data-testid="upload-progress"
            >
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">
                    {t('batchWizard.step2.uploadProgressTitle')}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {t('batchWizard.step2.uploadProgressCount')
                      .replace('{completed}', String(uploadProgress.completed))
                      .replace('{total}', String(uploadProgress.total))}
                  </span>
                </div>
                <Progress
                  value={uploadPercent}
                  aria-label={t('batchWizard.step2.uploadProgressTitle')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('batchWizard.step2.uploadProgressActive')
                    .replace('{active}', String(uploadProgress.inFlight))
                    .replace('{failed}', String(uploadProgress.failed))}
                </p>
                {uploadProgress.currentFile && (
                  <p
                    className="truncate text-xs text-muted-foreground"
                    data-testid="upload-current-file"
                  >
                    {t('batchWizard.step2.uploadProgressCurrent').replace(
                      '{filename}',
                      uploadProgress.currentFile,
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              className="h-9 whitespace-nowrap"
              onClick={() => goStep(1)}
              data-testid="step2-prev"
            >
              <ChevronLeft className="size-4" />
              {t('batchWizard.step2.prevStep')}
            </Button>
            <Button
              className="h-9 whitespace-nowrap"
              onClick={() => goStep(3)}
              disabled={nextDisabled}
              title={loading ? t('batchWizard.step2.waitUploadBeforeRecognize') : undefined}
              data-testid="step2-next"
            >
              {t('batchWizard.step2.nextRecognize')}
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {loading && (
            <p className="text-xs text-muted-foreground" data-testid="step2-next-disabled-reason">
              {t('batchWizard.step2.waitUploadBeforeRecognize')}
            </p>
          )}
        </div>

        {/* Upload queue */}
        <Card className="page-surface flex min-h-0 flex-col overflow-hidden rounded-[20px] border-border/70 shadow-[var(--shadow-control)]">
          <CardHeader className="border-b border-border/70 px-3 py-2 flex flex-row items-center justify-between gap-2 space-y-0">
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">
                {t('batchWizard.step2.uploadQueue')}
              </CardTitle>
              <p className="truncate text-xs text-muted-foreground">
                {t('batchWizard.step2.queueCount').replace('{count}', String(rows.length))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!previewJob && onInboxImported && (
                <ImportInboxDialog jobId={activeJobId} onImported={onInboxImported} />
              )}
              {rows.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 whitespace-nowrap text-xs text-muted-foreground hover:text-destructive"
                  onClick={handleClear}
                  disabled={clearing || loading}
                  data-testid="step2-clear-all"
                >
                  {clearing ? t('batchWizard.step2.clearing') : t('batchWizard.step2.clearAll')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto p-0">
            <Table className="min-w-[32rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-center">序号</TableHead>
                  <TableHead className="min-w-44 text-left">文件名</TableHead>
                  <TableHead className="w-24 text-center">文件大小</TableHead>
                  <TableHead className="w-24 text-center">文件类型</TableHead>
                  <TableHead className="w-16 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      {t('batchWizard.step2.noFiles')}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRows.map((r, index) => (
                    <TableRow key={r.file_id} data-testid={`step2-row-${r.file_id}`}>
                      <TableCell className="text-center text-muted-foreground">
                        {(queueSafePage - 1) * queuePageSize + index + 1}
                      </TableCell>
                      <TableCell className="text-left font-medium text-foreground">
                        <span className="block max-w-[18rem] truncate" title={r.original_filename}>
                          {r.original_filename}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-foreground">
                        {formatFileSize(r.file_size)}
                      </TableCell>
                      <TableCell className="text-center text-foreground">
                        {formatFileType(r.file_type, r.original_filename)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mx-auto size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleRemove(r.file_id)}
                          disabled={pendingRemoveId === r.file_id || clearing || loading}
                          title={t('batchWizard.step2.removeFile')}
                          data-testid={`step2-remove-${r.file_id}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
          {rows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border/70 px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>共 {rows.length} 条</span>
              <div className="flex items-center justify-end gap-2">
                <Select
                  value={String(queuePageSize)}
                  onValueChange={(value) => handleQueuePageSizeChange(Number(value))}
                >
                  <SelectTrigger className="h-8 w-28" data-testid="step2-queue-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUEUE_PAGE_SIZE_OPTIONS.map((size) => (
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
                  onClick={() => setQueuePage((current) => Math.max(1, current - 1))}
                  disabled={queueSafePage <= 1}
                  data-testid="step2-queue-prev"
                >
                  上一页
                </Button>
                {queuePaginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`step2-queue-ellipsis-${index}`}
                      className="flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === queueSafePage ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 min-w-8 px-2"
                      onClick={() => setQueuePage(item)}
                      aria-current={item === queueSafePage ? 'page' : undefined}
                      data-testid={`step2-queue-page-${item}`}
                    >
                      {item}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setQueuePage((current) => Math.min(queueTotalPages, current + 1))}
                  disabled={queueSafePage >= queueTotalPages}
                  data-testid="step2-queue-next"
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export const BatchStep2Upload = memo(BatchStep2UploadInner);
