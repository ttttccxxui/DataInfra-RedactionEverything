// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Layers,
  ListChecks,
  Play,
  Server,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useT } from '@/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConnections, useDatasets } from '@/features/structured/hooks/use-structured-data';
import { isFileDataset } from '@/features/structured/lib/dataset-utils';
import { cn } from '@/lib/utils';
import { listJobs, type JobListStats } from '@/services/jobsApi';

const EMPTY_STATS: JobListStats = {
  total_jobs: 0,
  draft_jobs: 0,
  active_jobs: 0,
  awaiting_review_jobs: 0,
  completed_jobs: 0,
  risk_jobs: 0,
  total_items: 0,
  active_items: 0,
  awaiting_review_items: 0,
  completed_items: 0,
  risk_items: 0,
};

export function StartPage() {
  const t = useT();
  const [stats, setStats] = useState<JobListStats>(EMPTY_STATS);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const datasetsState = useDatasets();
  const connectionsState = useConnections();

  useEffect(() => {
    let active = true;

    setLoadingStats(true);
    setStatsError(false);
    listJobs({ page: 1, page_size: 1 })
      .then((result) => {
        if (!active) return;
        setStats(result.stats);
      })
      .catch(() => {
        if (!active) return;
        setStatsError(true);
      })
      .finally(() => {
        if (active) setLoadingStats(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const quickEntries = useMemo(
    () => [
      {
        key: 'single',
        title: t('workbench.quick.single.title'),
        desc: t('workbench.quick.single.desc'),
        to: '/single',
        Icon: Play,
        iconTone: 'border-blue-100 bg-blue-50 text-blue-600',
      },
      {
        key: 'batch',
        title: t('workbench.quick.batch.title'),
        desc: t('workbench.quick.batch.desc'),
        to: '/batch',
        Icon: ListChecks,
        iconTone: 'border-emerald-100 bg-emerald-50 text-emerald-600',
      },
      {
        key: 'structured',
        title: t('workbench.quick.structured.title'),
        desc: t('workbench.quick.structured.desc'),
        to: '/structured',
        Icon: Database,
        iconTone: 'border-amber-100 bg-amber-50 text-amber-600',
      },
      {
        key: 'redaction',
        title: t('workbench.quick.redaction.title'),
        desc: t('workbench.quick.redaction.desc'),
        to: '/settings/redaction',
        Icon: ClipboardList,
        iconTone: 'border-violet-100 bg-violet-50 text-violet-600',
      },
    ],
    [t],
  );

  const metrics = useMemo(
    () => [
      {
        key: 'totalTasks',
        label: t('workbench.metric.totalTasks'),
        value: stats.total_jobs,
        Icon: ClipboardList,
        iconTone: 'border-blue-100 bg-blue-50 text-blue-600',
      },
      {
        key: 'pendingReviewFiles',
        label: t('workbench.metric.pendingReviewFiles'),
        value: stats.awaiting_review_items,
        Icon: ClipboardCheck,
        iconTone: 'border-amber-100 bg-amber-50 text-amber-600',
      },
      {
        key: 'completedFiles',
        label: t('workbench.metric.completedFiles'),
        value: stats.completed_items,
        Icon: CheckCircle2,
        iconTone: 'border-emerald-100 bg-emerald-50 text-emerald-600',
      },
      {
        key: 'abnormalFiles',
        label: t('workbench.metric.abnormalFiles'),
        value: stats.risk_items,
        Icon: AlertTriangle,
        iconTone: 'border-rose-100 bg-rose-50 text-rose-600',
      },
    ],
    [stats, t],
  );

  const fileCount = datasetsState.datasets.filter(isFileDataset).length;
  const dbCount = datasetsState.datasets.filter((dataset) => Boolean(dataset.connection_id)).length;
  const structuredMetrics = useMemo(
    () => [
      {
        key: 'datasets',
        label: t('structured.overview.metric.datasets'),
        value: datasetsState.datasets.length,
        Icon: Layers,
        iconTone: 'border-blue-100 bg-blue-50 text-blue-600',
      },
      {
        key: 'fileDatasets',
        label: t('structured.overview.metric.fileDatasets'),
        value: fileCount,
        Icon: FileSpreadsheet,
        iconTone: 'border-emerald-100 bg-emerald-50 text-emerald-600',
      },
      {
        key: 'dbDatasets',
        label: t('structured.overview.metric.dbDatasets'),
        value: dbCount,
        Icon: Database,
        iconTone: 'border-amber-100 bg-amber-50 text-amber-600',
      },
      {
        key: 'connections',
        label: t('structured.overview.metric.connections'),
        value: connectionsState.connections.length,
        Icon: Server,
        iconTone: 'border-violet-100 bg-violet-50 text-violet-600',
      },
    ],
    [connectionsState.connections.length, datasetsState.datasets.length, dbCount, fileCount, t],
  );

  return (
    <div className="saas-page flex h-full min-h-0 overflow-auto bg-background">
      <div className="page-shell-narrow !max-w-[118rem] !px-3 !py-4 sm:!px-5 sm:!py-5 2xl:!max-w-[124rem]">
        <div className="grid gap-4">
          <WorkbenchSection title={t('workbench.quick.title')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickEntries.map(({ key, title, desc, to, Icon, iconTone }) => (
                <QuickEntryCard
                  key={key}
                  title={title}
                  desc={desc}
                  to={to}
                  Icon={Icon}
                  iconTone={iconTone}
                  testId={`workbench-entry-${key}`}
                />
              ))}
            </div>
          </WorkbenchSection>

          <WorkbenchSection title="文档图片处理情况">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map(({ key, label, value, Icon, iconTone }) => (
                <MetricEntryCard
                  key={key}
                  label={label}
                  value={loadingStats ? '...' : statsError ? '--' : value.toLocaleString()}
                  Icon={Icon}
                  iconTone={iconTone}
                  testId={`workbench-metric-${key}`}
                />
              ))}
            </div>
          </WorkbenchSection>

          <WorkbenchSection title="库表处理情况">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {structuredMetrics.map(({ key, label, value, Icon, iconTone }) => (
                <MetricEntryCard
                  key={key}
                  label={label}
                  value={value.toLocaleString()}
                  Icon={Icon}
                  iconTone={iconTone}
                  testId={`workbench-structured-metric-${key}`}
                />
              ))}
            </div>
          </WorkbenchSection>
        </div>
      </div>
    </div>
  );
}

function WorkbenchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
      <div className="border-b border-border/70 bg-card px-4 py-3 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="bg-card p-4 sm:p-5">{children}</div>
    </section>
  );
}

function QuickEntryCard({
  title,
  desc,
  to,
  Icon,
  iconTone,
  testId,
}: {
  title: string;
  desc: string;
  to: string;
  Icon: LucideIcon;
  iconTone: string;
  testId: string;
}) {
  return (
    <Card className="group min-h-[10.25rem] border-border/70 bg-card shadow-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[0_12px_32px_rgba(37,99,235,0.14)] hover:ring-1 hover:ring-primary/20">
      <Link to={to} className="flex h-full flex-col justify-end p-5" data-testid={testId}>
        <CardHeader className="gap-4 p-0">
          <div className="flex items-start">
            <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl border', iconTone)}>
              <Icon className="size-5" />
            </span>
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
              {title}
            </CardTitle>
            <CardDescription className="mt-2 text-sm leading-5 text-muted-foreground">{desc}</CardDescription>
          </div>
        </CardHeader>
      </Link>
    </Card>
  );
}

function MetricEntryCard({
  label,
  value,
  Icon,
  iconTone,
  testId,
}: {
  label: string;
  value: string;
  Icon: LucideIcon;
  iconTone: string;
  testId: string;
}) {
  return (
    <Card className="group min-h-[10.25rem] border-border/70 bg-card shadow-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[0_12px_32px_rgba(37,99,235,0.14)] hover:ring-1 hover:ring-primary/20">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl border', iconTone)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p
            className="mt-2 text-3xl font-semibold leading-none tracking-tight text-foreground"
            data-testid={testId}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
