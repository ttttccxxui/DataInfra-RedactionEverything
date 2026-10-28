// Copyright 2026 DataInfra-RedactionEverything Contributors

import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useServiceHealth } from '@/hooks/use-service-health';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
import type { BatchWizardMode } from '@/services/batchPipeline';

import {
  type BatchRow,
  RECOGNITION_ACTIVE_STATUSES,
  RECOGNITION_DONE_STATUSES,
  isRecognitionSettledForReview,
  type Step,
} from '../types';
import { getBatchModeReadiness } from '../lib/batch-mode-readiness';

interface BatchStep3RecognizeProps {
  mode?: BatchWizardMode;
  rows: BatchRow[];
  activeJobId: string | null;
  failedRows: BatchRow[];
  goStep: (s: Step) => void;
  submitQueueToWorker: () => Promise<void>;
  requeueFailedItems: () => Promise<void>;
}

type StatusFilter = 'all' | 'active' | 'ready' | 'failed' | 'pending';

const STATUS_DEFAULT_PAGE_SIZE = 10;
const STATUS_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
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
  if (
    raw.includes('docx') ||
    raw.includes('doc') ||
    raw.includes('word') ||
    /\.(docx?|wps)$/i.test(name)
  ) {
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

function BatchStep3RecognizeInner({
  mode = 'smart',
  rows,
  activeJobId,
  failedRows,
  goStep,
  submitQueueToWorker,
  requeueFailedItems,
}: BatchStep3RecognizeProps) {
  const t = useT();
  const { health } = useServiceHealth();
  const doneCount = rows.filter((r) => RECOGNITION_DONE_STATUSES.has(r.analyzeStatus)).length;
  const failedCount = failedRows.length;
  const pendingCount = rows.filter((r) => r.analyzeStatus === 'pending').length;
  const workingCount = rows.filter(
    (r) => r.analyzeStatus === 'parsing' || r.analyzeStatus === 'analyzing',
  ).length;
  const submittableCount = rows.filter(
    (r) => !RECOGNITION_DONE_STATUSES.has(r.analyzeStatus) && r.analyzeStatus !== 'failed',
  ).length;
  const visibleProgressCount = Math.min(rows.length, doneCount + workingCount);
  const allDone = rows.length > 0 && doneCount === rows.length;
  const canReview = isRecognitionSettledForReview(rows);
  const [everSubmitted, setEverSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requeueing, setRequeueing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusPage, setStatusPage] = useState(1);
  const [statusPageSize, setStatusPageSize] = useState(STATUS_DEFAULT_PAGE_SIZE);

  const isProcessing =
    (everSubmitted || workingCount > 0) &&
    rows.some((row) => RECOGNITION_ACTIVE_STATUSES.has(row.analyzeStatus));
  const filters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: t('batchWizard.step3.filterAll'), count: rows.length },
    { key: 'ready', label: t('batchWizard.step3.filterReady'), count: doneCount },
    { key: 'active', label: t('batchWizard.step3.filterActive'), count: workingCount },
    { key: 'pending', label: t('batchWizard.step3.filterPending'), count: pendingCount },
    { key: 'failed', label: t('batchWizard.step3.filterFailed'), count: failedCount },
  ];
  const filteredRows = useMemo(() => {
    if (statusFilter === 'ready') {
      return rows.filter((row) => RECOGNITION_DONE_STATUSES.has(row.analyzeStatus));
    }
    if (statusFilter === 'failed') return rows.filter((row) => row.analyzeStatus === 'failed');
    if (statusFilter === 'pending') return rows.filter((row) => row.analyzeStatus === 'pending');
    if (statusFilter === 'active') {
      return rows.filter(
        (row) => row.analyzeStatus === 'parsing' || row.analyzeStatus === 'analyzing',
      );
    }
    return rows;
  }, [rows, statusFilter]);
  const statusTotalPages = Math.max(1, Math.ceil(filteredRows.length / statusPageSize));
  const safeStatusPage = Math.min(Math.max(1, statusPage), statusTotalPages);
  const visibleRows = useMemo(
    () => filteredRows.slice((safeStatusPage - 1) * statusPageSize, safeStatusPage * statusPageSize),
    [filteredRows, safeStatusPage, statusPageSize],
  );
  const statusPaginationItems = useMemo(
    () => getPaginationItems(safeStatusPage, statusTotalPages),
    [safeStatusPage, statusTotalPages],
  );

  useEffect(() => {
    setStatusPage(1);
  }, [statusFilter, statusPageSize]);

  useEffect(() => {
    setStatusPage((current) => Math.min(Math.max(1, current), statusTotalPages));
  }, [statusTotalPages]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setEverSubmitted(true);
    try {
      await submitQueueToWorker();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequeueFailed = async () => {
    if (requeueing) return;
    setRequeueing(true);
    try {
      await requeueFailedItems();
    } finally {
      setRequeueing(false);
    }
  };
  const handleStatusPageSizeChange = (pageSize: number) => {
    setStatusPageSize(pageSize);
    setStatusPage(1);
  };

  const progressLabel = allDone
    ? t('batchWizard.step3.allDone')
    : canReview
      ? `${t('batchWizard.step3.readyForReview')} ${doneCount}/${rows.length}`
      : isProcessing
        ? `${t('batchWizard.step3.processing')} ${visibleProgressCount}/${rows.length} (${t('batchWizard.step3.readyForReview')} ${doneCount}/${rows.length})`
        : `${rows.length} ${t('batchWizard.step3.pending')}`;
  const statusLabel = (status: BatchRow['analyzeStatus']) => {
    switch (status) {
      case 'pending':
        return t('batchWizard.status.pending');
      case 'parsing':
        return t('batchWizard.status.parsing');
      case 'analyzing':
        return t('batchWizard.status.analyzing');
      case 'awaiting_review':
        return t('batchWizard.status.awaitingReview');
      case 'review_approved':
        return t('batchWizard.status.reviewApproved');
      case 'redacting':
        return t('batchWizard.status.redacting');
      case 'completed':
        return t('batchWizard.status.completed');
      case 'failed':
        return t('batchWizard.status.failed');
      default:
        return status;
    }
  };
  const rowProgressLabel = (row: BatchRow): string | null => {
    const current = Number(row.recognitionCurrent ?? 0);
    const total = Number(row.recognitionTotal ?? 0);
    const rawMessage = row.recognitionMessage?.trim();
    if (
      row.recognitionStage === 'vision' &&
      total > 1 &&
      (row.analyzeStatus === 'analyzing' || row.analyzeStatus === 'parsing')
    ) {
      return t('batchWizard.step3.filePageProgress')
        .replace('{current}', String(Math.max(0, current)))
        .replace('{total}', String(total));
    }
    if (
      row.recognitionStage === 'ner' &&
      (row.analyzeStatus === 'analyzing' || row.analyzeStatus === 'parsing')
    ) {
      return t('batchWizard.step3.fileTextProgress');
    }
    if (!rawMessage) return null;
    switch (rawMessage) {
      case 'text_recognition_running':
      case 'Text recognition running':
        return t('batchWizard.step3.fileTextProgress');
      case 'text_recognition_complete':
      case 'Text recognition complete':
        return t('batchWizard.step3.fileTextComplete');
      case 'vision_recognition_complete':
      case 'Vision recognition complete':
        return t('batchWizard.step3.fileVisionComplete');
      case 'Requeued after stale processing heartbeat':
        return t('batchWizard.step3.requeuedAfterStale');
      default:
        return rawMessage;
    }
  };

  const pct = rows.length > 0 ? Math.min(100, (visibleProgressCount / rows.length) * 100) : 0;
  const displayPct = isProcessing && pct === 0 ? 3 : pct;
  const modeReadiness = getBatchModeReadiness(mode, health);
  const hasUnavailableService = Boolean(health && !modeReadiness.ready);
  const blockSubmitForServiceState = hasUnavailableService;

  return (
    <Card
      className="page-surface border-border/70 shadow-[var(--shadow-control)]"
      data-testid="batch-step3-recognize"
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 xl:overflow-hidden">
        {/* Progress */}
        {rows.length > 0 && (
          <div
            className="flex flex-col gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-2"
            data-testid="recognition-progress-block"
          >
            <div className="flex min-w-0 justify-between gap-3 text-xs">
              <span
                className={cn(
                  'min-w-0 truncate',
                  allDone && 'font-medium text-[var(--success-foreground)]',
                  isProcessing && !allDone && 'text-primary',
                  !isProcessing && !allDone && 'text-muted-foreground',
                )}
              >
                {progressLabel}
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {visibleProgressCount} / {rows.length}
              </span>
            </div>
            <Progress
              value={displayPct}
              className="h-1.5"
              indicatorClassName={cn(
                allDone && 'tone-progress-success',
                isProcessing && !allDone && 'tone-progress-brand batch-recognition-progress-active',
              )}
              data-testid="recognition-progress"
            />
          </div>
        )}

        {failedCount > 0 && doneCount > 0 && canReview && (
          <Alert data-testid="recognition-partial-ready">
            <AlertDescription>
              {t('batchWizard.step3.partialReadyHint')
                .replace('{ready}', String(doneCount))
                .replace('{failed}', String(failedCount))}
            </AlertDescription>
          </Alert>
        )}

        {hasUnavailableService && (
          <Alert data-testid="recognition-service-state">
            <AlertDescription>{t('batchWizard.step3.serviceUnavailableHint')}</AlertDescription>
          </Alert>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 flex-nowrap gap-2 overflow-x-auto pb-1">
          <Button
            variant="outline"
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => goStep(2)}
            data-testid="step3-prev"
          >
            <ChevronLeft className="size-4" />
            {t('batchWizard.step3.prevStep')}
          </Button>

          <Button
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => void handleSubmit()}
            disabled={
              !activeJobId ||
              !rows.length ||
              submittableCount === 0 ||
              isProcessing ||
              submitting ||
              blockSubmitForServiceState
            }
            data-testid="submit-queue"
          >
            {blockSubmitForServiceState
              ? t('batchWizard.step3.submitBlocked')
              : t('batchWizard.step3.submitQueue')}
          </Button>

          {failedRows.length > 0 && (
            <Button
              variant="outline"
              className="h-9 shrink-0 whitespace-nowrap border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => void handleRequeueFailed()}
              disabled={blockSubmitForServiceState || requeueing}
              data-testid="retry-failed"
            >
              {t('batchWizard.step3.retryFailed')} ({failedRows.length})
            </Button>
          )}

          <Button
            variant={canReview ? 'default' : 'outline'}
            onClick={() => goStep(4)}
            disabled={!canReview}
            className={cn(
              'h-9 shrink-0 whitespace-nowrap',
              canReview && 'bg-primary hover:bg-primary/90',
            )}
            data-testid="step3-next"
            data-reviewable={canReview ? 'true' : 'false'}
            data-reviewable-count={doneCount}
          >
            {canReview
              ? t('batchWizard.step3.nextReview')
              : `${t('batchWizard.step3.nextReview')} (${doneCount}/${rows.length})`}
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div
          className="flex shrink-0 flex-nowrap gap-1.5 overflow-x-auto pb-1"
          data-testid="recognition-status-filters"
        >
          {filters.map(({ key, label, count }) => (
            <Button
              key={key}
              type="button"
              variant={statusFilter === key ? 'default' : 'outline'}
              size="sm"
              className="h-7 shrink-0 rounded-full px-2.5 text-xs whitespace-nowrap"
              onClick={() => setStatusFilter(key)}
              data-testid={`recognition-filter-${key}`}
            >
              {label} {count}
            </Button>
          ))}
        </div>

        {/* Per-file status list */}
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="min-w-[52rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">序号</TableHead>
                <TableHead className="min-w-48 text-left">文件名</TableHead>
                <TableHead className="w-24 text-center">文件大小</TableHead>
                <TableHead className="w-24 text-center">文件类型</TableHead>
                <TableHead className="w-24 text-center">状态</TableHead>
                <TableHead className="min-w-40 text-left">处理进度</TableHead>
                <TableHead className="min-w-36 text-left">异常信息</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t('batchWizard.step3.noRowsInFilter')}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((r, index) => {
                  const detail = rowProgressLabel(r);
                  return (
                    <TableRow key={r.file_id} data-testid={`recognition-row-${r.file_id}`}>
                      <TableCell className="text-center text-muted-foreground">
                        {(safeStatusPage - 1) * statusPageSize + index + 1}
                      </TableCell>
                      <TableCell className="text-left font-medium text-foreground">
                        <span className="block max-w-[22rem] truncate" title={r.original_filename}>
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
                        <Badge
                          variant={
                            r.analyzeStatus === 'completed'
                              ? 'default'
                              : r.analyzeStatus === 'failed'
                                ? 'destructive'
                                : RECOGNITION_DONE_STATUSES.has(r.analyzeStatus)
                                  ? 'secondary'
                                  : 'outline'
                          }
                          className="whitespace-nowrap text-xs"
                        >
                          {statusLabel(r.analyzeStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-left text-muted-foreground">
                        <span
                          className="block max-w-[16rem] truncate"
                          title={detail ?? undefined}
                          data-testid={`row-progress-${r.file_id}`}
                        >
                          {detail ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-left text-destructive">
                        <span className="block max-w-[14rem] truncate" title={r.analyzeError}>
                          {r.analyzeError ?? ''}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {filteredRows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/70 px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>共 {filteredRows.length} 条</span>
            <div className="flex items-center justify-end gap-2">
              <Select
                value={String(statusPageSize)}
                onValueChange={(value) => handleStatusPageSizeChange(Number(value))}
              >
                <SelectTrigger className="h-8 w-28" data-testid="step3-status-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_PAGE_SIZE_OPTIONS.map((size) => (
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
                onClick={() => setStatusPage((current) => Math.max(1, current - 1))}
                disabled={safeStatusPage <= 1}
                data-testid="step3-status-prev"
              >
                上一页
              </Button>
              {statusPaginationItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span
                    key={`step3-status-ellipsis-${index}`}
                    className="flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-foreground"
                  >
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={item === safeStatusPage ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 min-w-8 px-2"
                    onClick={() => setStatusPage(item)}
                    aria-current={item === safeStatusPage ? 'page' : undefined}
                    data-testid={`step3-status-page-${item}`}
                  >
                    {item}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                onClick={() =>
                  setStatusPage((current) => Math.min(statusTotalPages, current + 1))
                }
                disabled={safeStatusPage >= statusTotalPages}
                data-testid="step3-status-next"
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const BatchStep3Recognize = memo(BatchStep3RecognizeInner);
