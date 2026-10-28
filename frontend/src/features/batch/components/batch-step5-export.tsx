// Copyright 2026 DataInfra-RedactionEverything Contributors

import { memo, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, Download, FileJson, RefreshCw, ShieldCheck } from 'lucide-react';

import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SettingsListPagination } from '@/features/settings/components/settings-list-pagination';
import { getJobExportReport } from '@/services/jobsApi';
import {
  batchExportApi,
  type BatchExportEstimate,
  type BatchExportTask,
} from '@/services/api';

import {
  BATCH_EXPORT_BLOCKING_REASONS,
  BATCH_EXPORT_DELIVERY_STATUS,
  type BatchExportReport,
  type BatchExportReportFile,
  buildBatchExportReport,
  buildBatchExportReportBlob,
  isBatchRowReadyForDelivery,
} from '../lib/batch-export-report';
import type { BatchRow, Step } from '../types';
import { triggerDownload } from '../hooks/use-batch-wizard-utils';

type DeliveryGroup = 'ready' | 'review' | 'redact' | 'retry';

// 与后端 EXPORT_SYNC_MAX_FILES 对齐：超过走异步分卷导出
const ASYNC_EXPORT_FILE_THRESHOLD = 200;
const EXPORT_DEFAULT_PAGE_SIZE = 10;
const EXPORT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function formatBytesHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
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

function statusLabel(t: (key: string) => string, status: BatchRow['analyzeStatus']) {
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
}

function rowProgressPercent(row: BatchRow): number {
  if (row.analyzeStatus === 'completed') return 100;
  if (row.analyzeStatus === 'failed') return 100;
  const current = Number(row.recognitionCurrent ?? 0);
  const total = Number(row.recognitionTotal ?? 0);
  if (total > 0) {
    return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }
  return 0;
}

const DELIVERY_GROUP_ORDER: DeliveryGroup[] = ['ready', 'review', 'redact', 'retry'];

function getDeliveryGroup(row: BatchRow, reportFile?: BatchExportReportFile): DeliveryGroup {
  if (reportFile?.delivery_status === BATCH_EXPORT_DELIVERY_STATUS.readyForDelivery) return 'ready';
  if (reportFile?.delivery_status === BATCH_EXPORT_DELIVERY_STATUS.actionRequired) {
    const blockingReasons = reportFile.blocking_reasons ?? [];
    if (
      reportFile.status === 'failed' ||
      blockingReasons.includes(BATCH_EXPORT_BLOCKING_REASONS.failed)
    ) {
      return 'retry';
    }
    if (
      reportFile.review_confirmed !== true ||
      blockingReasons.includes(BATCH_EXPORT_BLOCKING_REASONS.reviewNotConfirmed)
    ) {
      return 'review';
    }
    return 'redact';
  }
  if (isBatchRowReadyForDelivery(row)) return 'ready';
  if (row.analyzeStatus === 'failed') return 'retry';
  if (row.reviewConfirmed !== true) return 'review';
  return 'redact';
}

function deliveryGroupLabelKey(group: DeliveryGroup): string {
  if (group === 'ready') return 'batchWizard.step5.group.ready';
  if (group === 'review') return 'batchWizard.step5.group.review';
  if (group === 'redact') return 'batchWizard.step5.group.redact';
  return 'batchWizard.step5.group.retry';
}

interface BatchStep5ExportProps {
  activeJobId?: string | null;
  rows: BatchRow[];
  selected: Set<string>;
  selectedIds: string[];
  zipLoading: boolean;
  toggle: (id: string) => void;
  selectReadyForDelivery: () => void;
  resolveExportIssue?: (fileId?: string) => void;
  goStep: (s: Step) => void;
  downloadZip: (redacted: boolean) => Promise<void>;
}

function BatchStep5ExportInner({
  activeJobId,
  rows,
  selected,
  selectedIds,
  zipLoading,
  toggle,
  selectReadyForDelivery,
  resolveExportIssue,
  goStep,
  downloadZip,
}: BatchStep5ExportProps) {
  const t = useT();
  const [reportLoading, setReportLoading] = useState(false);
  const [exportEstimate, setExportEstimate] = useState<BatchExportEstimate | null>(null);
  const [exportTask, setExportTask] = useState<BatchExportTask | null>(null);
  const [exportStarting, setExportStarting] = useState(false);
  const [serverReport, setServerReport] = useState<BatchExportReport | null>(null);
  const [serverReportLoading, setServerReportLoading] = useState(false);
  const [serverReportFailed, setServerReportFailed] = useState(false);
  const [reportReloadNonce, setReportReloadNonce] = useState(0);
  const [filePage, setFilePage] = useState(1);
  const [filePageSize, setFilePageSize] = useState(EXPORT_DEFAULT_PAGE_SIZE);
  const localReport = useMemo(() => buildBatchExportReport(rows, selectedIds), [rows, selectedIds]);
  const report = serverReport ?? localReport;
  const deliveryStatus =
    report.summary.delivery_status ??
    (report.summary.ready_for_delivery
      ? BATCH_EXPORT_DELIVERY_STATUS.readyForDelivery
      : report.summary.selected_files === 0
        ? BATCH_EXPORT_DELIVERY_STATUS.noSelection
        : BATCH_EXPORT_DELIVERY_STATUS.actionRequired);
  const hasIncompleteSelected = deliveryStatus === BATCH_EXPORT_DELIVERY_STATUS.actionRequired;
  const readyForDeliveryCount = useMemo(
    () => rows.filter(isBatchRowReadyForDelivery).length,
    [rows],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.file_id)),
    [rows, selected],
  );
  const reportFilesById = useMemo(
    () => new Map(report.files.map((file) => [file.file_id, file])),
    [report.files],
  );
  const deliveryGroups = useMemo(() => {
    const groups: Record<DeliveryGroup, BatchRow[]> = {
      ready: [],
      review: [],
      redact: [],
      retry: [],
    };
    selectedRows.forEach((row) => {
      groups[getDeliveryGroup(row, reportFilesById.get(row.file_id))].push(row);
    });
    return groups;
  }, [reportFilesById, selectedRows]);
  const selectedKey = selectedIds.join('\u0000');
  const fileTotalPages = Math.max(1, Math.ceil(rows.length / filePageSize));
  const safeFilePage = Math.min(Math.max(1, filePage), fileTotalPages);
  const visibleRows = useMemo(
    () => rows.slice((safeFilePage - 1) * filePageSize, safeFilePage * filePageSize),
    [filePageSize, rows, safeFilePage],
  );
  const requiresServerReport = Boolean(activeJobId && selectedIds.length > 0);
  const authoritativeReportReady = !requiresServerReport || Boolean(serverReport);
  const authoritativeReportUnavailable = requiresServerReport && serverReportFailed;
  const redactedZipDisabled =
    zipLoading || !selectedIds.length || hasIncompleteSelected || !authoritativeReportReady;
  const qualityReportDisabled =
    !selectedIds.length || reportLoading || serverReportLoading || authoritativeReportUnavailable;
  const firstIssueFileId = useMemo(() => {
    for (const group of DELIVERY_GROUP_ORDER) {
      if (group === 'ready') continue;
      const row = deliveryGroups[group][0];
      if (row) return row.file_id;
    }
    return undefined;
  }, [deliveryGroups]);
  const handleResolveIssue = (fileId?: string) => {
    if (resolveExportIssue) {
      resolveExportIssue(fileId);
      return;
    }
    goStep(4);
  };

  // 超过阈值时同步打包必 413，改走异步分卷导出
  const useAsyncExport = selectedIds.length > ASYNC_EXPORT_FILE_THRESHOLD;

  // 导出体积预估（选择变化 500ms 防抖，st_size 求和秒回）
  useEffect(() => {
    if (!activeJobId || selectedIds.length === 0) {
      setExportEstimate(null);
      return;
    }
    const timer = window.setTimeout(() => {
      batchExportApi
        .estimate(selectedIds, true, activeJobId)
        .then(setExportEstimate)
        .catch(() => setExportEstimate(null));
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedKey encodes selectedIds
  }, [activeJobId, selectedKey]);

  // 异步导出任务轮询
  useEffect(() => {
    if (!exportTask || (exportTask.status !== 'queued' && exportTask.status !== 'running')) return;
    const timer = window.setInterval(() => {
      batchExportApi
        .get(exportTask.export_id)
        .then(setExportTask)
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [exportTask]);

  const startAsyncExport = async () => {
    setExportStarting(true);
    try {
      const task = await batchExportApi.create(selectedIds, true, activeJobId);
      setExportTask(task);
    } catch {
      setExportTask(null);
    } finally {
      setExportStarting(false);
    }
  };

  const startDataExport = async () => {
    if (!activeJobId) return;
    setExportStarting(true);
    try {
      const task = await batchExportApi.createJobData(activeJobId, selectedIds);
      setExportTask(task);
    } catch {
      setExportTask(null);
    } finally {
      setExportStarting(false);
    }
  };

  useEffect(() => {
    setFilePage((current) => Math.min(Math.max(1, current), fileTotalPages));
  }, [fileTotalPages]);

  useEffect(() => {
    if (!activeJobId || selectedIds.length === 0) {
      setServerReport(null);
      setServerReportLoading(false);
      setServerReportFailed(false);
      return;
    }

    let cancelled = false;
    setServerReportLoading(true);
    setServerReportFailed(false);
    // 大 job 只拉聚合头：十万级明细 JSON 会同时压垮后端与浏览器，明细走 CSV 导出
    void getJobExportReport(activeJobId, selectedIds, selectedIds.length > 2000)
      .then((backendReport) => {
        if (cancelled) return;
        if (isExportReportLike(backendReport)) {
          setServerReport(backendReport);
        } else {
          setServerReport(null);
          setServerReportFailed(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setServerReport(null);
        setServerReportFailed(true);
      })
      .finally(() => {
        if (!cancelled) setServerReportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, reportReloadNonce, selectedKey, selectedIds]);

  const downloadReport = async () => {
    let reportToDownload: BatchExportReport = report;
    if (activeJobId) {
      setReportLoading(true);
      try {
        const backendReport = await getJobExportReport(activeJobId, selectedIds);
        if (isExportReportLike(backendReport)) {
          reportToDownload = backendReport;
          setServerReport(backendReport);
          setServerReportFailed(false);
        } else {
          setServerReport(null);
          setServerReportFailed(true);
          return;
        }
      } catch {
        setServerReport(null);
        setServerReportFailed(true);
        return;
      } finally {
        setReportLoading(false);
      }
    }
    const blob = buildBatchExportReportBlob(reportToDownload);
    triggerDownload(blob, 'batch_quality_report.json');
  };

  return (
    <Card
      className="page-surface border-border/70 shadow-[var(--shadow-control)]"
      data-testid="batch-step5-export"
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 xl:overflow-hidden">
        {authoritativeReportUnavailable && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] px-3 py-2 text-xs text-[var(--error-foreground)]"
            role="alert"
            aria-live="polite"
            data-testid="export-authoritative-report-unavailable"
          >
            <span>{t('batchWizard.step5.reportUnavailable')}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 whitespace-nowrap bg-white/70 text-xs"
              disabled={serverReportLoading}
              onClick={() => setReportReloadNonce((value) => value + 1)}
              data-testid="retry-quality-report"
            >
              <RefreshCw data-icon="inline-start" />
              {t('batchWizard.step5.retryReport')}
            </Button>
          </div>
        )}

        <div className="flex shrink-0 flex-nowrap gap-2 overflow-x-auto pb-1">
          <Button
            variant="outline"
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => handleResolveIssue(firstIssueFileId)}
            data-testid="step5-back-review"
          >
            <ChevronLeft className="size-4" />
            {t('batchWizard.step5.backReview')}
          </Button>
          <Button
            variant={hasIncompleteSelected ? 'secondary' : 'outline'}
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={selectReadyForDelivery}
            disabled={readyForDeliveryCount === 0}
            data-testid="select-ready-for-delivery"
          >
            <CheckCircle2 data-icon="inline-start" />
            {t('batchWizard.step5.selectReady')}
          </Button>
          {hasIncompleteSelected && (
            <Button
              variant="outline"
              className="h-9 shrink-0 whitespace-nowrap"
              onClick={() => handleResolveIssue(firstIssueFileId)}
              data-testid="fix-selected-issues"
            >
              {t('batchWizard.step5.fixSelectedIssues')}
            </Button>
          )}
          <Button
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => void (useAsyncExport ? startAsyncExport() : downloadZip(true))}
            disabled={useAsyncExport ? exportStarting || redactedZipDisabled : redactedZipDisabled}
            data-testid="download-redacted"
          >
            <ShieldCheck data-icon="inline-start" />
            {useAsyncExport
              ? t('batchWizard.step5.asyncExportStart')
              : zipLoading
                ? t('batchWizard.step5.downloading')
                : t('batchWizard.step5.downloadRedacted')}
          </Button>
          <Button
            variant="outline"
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => void startDataExport()}
            disabled={!activeJobId || !selectedIds.length || exportStarting}
            data-testid="export-data-csv"
          >
            <FileJson data-icon="inline-start" />
            {t('batchWizard.step5.exportDataCsv')}
          </Button>
          <Button
            variant="outline"
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => void downloadReport()}
            disabled={qualityReportDisabled}
            data-testid="download-quality-report"
          >
            <FileJson data-icon="inline-start" />
            {reportLoading
              ? t('batchWizard.step5.preparingReport')
              : t('batchWizard.step5.downloadReport')}
          </Button>
          <Button
            variant="outline"
            className="h-9 shrink-0 whitespace-nowrap"
            onClick={() => void downloadZip(false)}
            disabled={zipLoading || !selectedIds.length}
            data-testid="download-original"
          >
            <Download data-icon="inline-start" />
            {zipLoading
              ? t('batchWizard.step5.downloading')
              : t('batchWizard.step5.downloadOriginal')}
          </Button>
        </div>

        {exportEstimate && (
          <div className="text-xs text-muted-foreground" data-testid="export-estimate">
            {t('batchWizard.step5.exportEstimate')
              .replace('{size}', formatBytesHuman(exportEstimate.total_bytes))
              .replace('{files}', String(exportEstimate.file_count))
              .replace('{volumes}', String(exportEstimate.estimated_volume_count))}
          </div>
        )}

        {exportTask && (
          <div
            className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs"
            data-testid="export-task-panel"
          >
            {exportTask.status === 'queued' && t('batchWizard.step5.asyncExportQueued')}
            {exportTask.status === 'running' && (
              <span>
                {t('batchWizard.step5.asyncExportRunning')
                  .replace('{current}', String(exportTask.progress.current))
                  .replace('{total}', String(exportTask.progress.total))}
              </span>
            )}
            {exportTask.status === 'failed' && (
              <span className="text-destructive">
                {t('batchWizard.step5.asyncExportFailed').replace('{error}', exportTask.error ?? '')}
              </span>
            )}
            {exportTask.status === 'completed' && (
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {t('batchWizard.step5.asyncExportDone').replace(
                    '{volumes}',
                    String(exportTask.volumes.length),
                  )}
                </span>
                {exportTask.volumes.map((volume) => (
                  <a
                    key={volume.name}
                    href={batchExportApi.volumeUrl(exportTask.export_id, volume.name)}
                    className="font-medium text-primary underline underline-offset-2"
                    download
                  >
                    {volume.name}（{formatBytesHuman(volume.size_bytes)}）
                  </a>
                ))}
                <a
                  href={batchExportApi.volumeUrl(exportTask.export_id, 'manifest.json')}
                  className="text-muted-foreground underline underline-offset-2"
                  download
                >
                  manifest.json
                </a>
              </div>
            )}
          </div>
        )}

        {hasIncompleteSelected && (
          <div
            className="max-h-28 overflow-y-auto rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2 text-xs text-[var(--warning-foreground)]"
            data-testid="export-delivery-breakdown"
          >
            <div className="font-medium">{t('batchWizard.step5.issueFilesTitle')}</div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
              {DELIVERY_GROUP_ORDER.filter((group) => group !== 'ready').map((group) => {
                const groupRows = deliveryGroups[group];
                return (
                  <div
                    key={group}
                    className="rounded-md border border-[var(--warning-border)] bg-white/55 px-2 py-1"
                    data-testid={`export-delivery-group-${group}`}
                  >
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <span className="truncate">{t(deliveryGroupLabelKey(group))}</span>
                      <span className="tabular-nums">{groupRows.length}</span>
                    </div>
                    {groupRows.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-[var(--warning-foreground)]">
                        {groupRows.slice(0, 3).map((row) => (
                          <li key={row.file_id}>
                            <button
                              type="button"
                              className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-[var(--warning-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning-border)]"
                              title={row.original_filename}
                              aria-label={t('batchWizard.step5.resolveIssueFile').replace(
                                '{name}',
                                row.original_filename,
                              )}
                              onClick={() => handleResolveIssue(row.file_id)}
                              data-testid={`resolve-export-issue-${row.file_id}`}
                            >
                              {row.original_filename}
                            </button>
                          </li>
                        ))}
                        {groupRows.length > 3 && (
                          <li>
                            {t('batchWizard.step5.moreIssueFiles').replace(
                              '{count}',
                              String(groupRows.length - 3),
                            )}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="min-w-[64rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 px-4 text-center" />
                <TableHead className="w-16 whitespace-nowrap px-4 text-center">序号</TableHead>
                <TableHead className="min-w-56 px-4 text-left">文件名</TableHead>
                <TableHead className="w-28 whitespace-nowrap px-4 text-center">文件大小</TableHead>
                <TableHead className="w-28 whitespace-nowrap px-4 text-center">文件类型</TableHead>
                <TableHead className="w-28 whitespace-nowrap px-4 text-center">状态</TableHead>
                <TableHead className="w-40 whitespace-nowrap px-4 text-center">处理进度</TableHead>
                <TableHead className="min-w-56 px-4 text-left">异常信息</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    {t('batchWizard.step2.noFiles')}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((r, index) => {
                  const progress = rowProgressPercent(r);
                  const errorText = r.analyzeError?.trim() || '-';
                  return (
                    <TableRow key={r.file_id}>
                      <TableCell className="px-4 text-center">
                        <Checkbox
                          checked={selected.has(r.file_id)}
                          aria-label={t('batchWizard.step5.selectFile').replace(
                            '{name}',
                            r.original_filename,
                          )}
                          onCheckedChange={() => toggle(r.file_id)}
                          data-testid={`export-check-${r.file_id}`}
                        />
                      </TableCell>
                      <TableCell className="px-4 text-center font-medium text-muted-foreground tabular-nums">
                        {(safeFilePage - 1) * filePageSize + index + 1}
                      </TableCell>
                      <TableCell className="px-4 text-left font-semibold text-foreground">
                        <span className="block max-w-[24rem] truncate" title={r.original_filename}>
                          {r.original_filename}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-center text-foreground">
                        {formatBytesHuman(r.file_size)}
                      </TableCell>
                      <TableCell className="px-4 text-center text-foreground">
                        {formatFileType(r.file_type, r.original_filename)}
                      </TableCell>
                      <TableCell className="px-4 text-center">
                        <Badge
                          variant={r.analyzeStatus === 'failed' ? 'destructive' : 'secondary'}
                          className="whitespace-nowrap text-xs"
                        >
                          {statusLabel(t, r.analyzeStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-center text-foreground">
                        <div className="mx-auto flex max-w-36 items-center justify-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${progress}%` }}
                            />
                          </span>
                          <span className="min-w-9 text-left text-xs tabular-nums">{progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 text-left text-foreground">
                        <span className="block max-w-[18rem] truncate" title={errorText}>
                          {errorText}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {rows.length > 0 && (
          <SettingsListPagination
            page={safeFilePage}
            pageSize={filePageSize}
            total={rows.length}
            pageSizeOptions={EXPORT_PAGE_SIZE_OPTIONS}
            onPageChange={setFilePage}
            onPageSizeChange={(pageSize) => {
              setFilePageSize(pageSize);
              setFilePage(1);
            }}
            testIdPrefix="step5-files"
          />
        )}
      </CardContent>
    </Card>
  );
}

function isExportReportLike(value: unknown): value is BatchExportReport {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<BatchExportReport>;
  return typeof raw.generated_at === 'string' && Boolean(raw.summary) && Array.isArray(raw.files);
}

export const BatchStep5Export = memo(BatchStep5ExportInner);
