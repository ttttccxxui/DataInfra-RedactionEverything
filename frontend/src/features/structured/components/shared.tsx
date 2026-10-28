// Copyright 2026 DataInfra-RedactionEverything Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { PaginationRail } from '@/components/PaginationRail';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import type { StructuredDataset } from '@/services/structuredApi';
import {
  datasetSchemaLabel,
  datasetTypeLabel,
  shortEntityId,
  type DatasetIdentityContext,
} from '../lib/dataset-utils';

export const STRUCTURED_DEFAULT_PAGE_SIZE = 10;
export const STRUCTURED_LIST_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function DatasetIdentity({
  dataset,
  compact,
  identityContext,
}: {
  dataset: StructuredDataset;
  compact?: boolean;
  identityContext?: DatasetIdentityContext;
}) {
  const t = useT();
  const isDbDataset = Boolean(dataset.connection_id);
  const primaryName = isDbDataset ? dataset.table_name || dataset.name : dataset.name;
  const rowText =
    dataset.row_count_estimate == null
      ? t('structured.common.rowsPending')
      : t('structured.common.rowCount').replace('{count}', String(dataset.row_count_estimate));
  const columnText = t('structured.common.columnCount').replace('{count}', String(dataset.column_count));
  const metaItems = isDbDataset
    ? [
        identityContext?.connectionName,
        datasetSchemaLabel(dataset),
        datasetTypeLabel(dataset),
        columnText,
        rowText,
      ]
    : [
        identityContext && identityContext.duplicateCount > 1
          ? t('structured.identity.duplicate')
              .replace('{index}', String(identityContext.duplicateIndex))
              .replace('{count}', String(identityContext.duplicateCount))
          : '',
        identityContext && identityContext.duplicateCount > 1 && dataset.source_id
          ? t('structured.identity.source').replace('{id}', shortEntityId(dataset.source_id))
          : '',
        datasetTypeLabel(dataset),
        columnText,
        rowText,
      ];
  return (
    <span className="min-w-0">
      <span className={cn('block truncate font-medium', compact ? 'text-xs' : 'text-sm')} title={dataset.name}>
        {primaryName}
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
        <Badge variant="outline" title={dataset.source_kind}>
          {dataset.source_kind.toUpperCase()}
        </Badge>
        {metaItems.filter((item): item is string => Boolean(item)).map((item, index) => (
          <span key={`${index}:${item}`} className="truncate">
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  const childArray = React.Children.toArray(children);
  const controlIndex = childArray.findIndex((child) => React.isValidElement<{ id?: string }>(child));
  const items = childArray.map((child, index) =>
    index === controlIndex && React.isValidElement<{ id?: string }>(child)
      ? React.cloneElement(child, { id: child.props.id ?? id })
      : child,
  );
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {items}
    </div>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: React.FC<{ className?: string }>; text: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-muted-foreground">
      <Icon className="size-5" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function ListPager({
  label,
  page,
  pageCount,
  total,
  pageSize,
  visibleCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
}: {
  label: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}) {
  const t = useT();
  const rangeLabel = t('structured.common.pagerRange').replace('{label}', label);
  return (
    <PaginationRail
      page={page + 1}
      pageSize={pageSize}
      totalItems={total}
      totalPages={pageCount}
      onPageChange={(nextPage) => onPageChange(Math.max(0, nextPage - 1))}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={pageSizeOptions}
      rangeLabel={rangeLabel}
      compact
      reserveWhenEmpty={visibleCount === 0}
    />
  );
}
