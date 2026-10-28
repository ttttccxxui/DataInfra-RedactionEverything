// Copyright 2026 DataInfra-RedactionEverything Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import type {
  StructuredPreview,
  StructuredProfile,
} from '@/services/structuredApi';
import { displayValue } from '../lib/dataset-utils';
import { EmptyState } from './shared';

export function PreviewCard({
  preview,
  loading = false,
}: {
  preview: StructuredPreview | null;
  profile: StructuredProfile | null;
  loading?: boolean;
}) {
  const t = useT();
  const columns = React.useMemo(() => {
    if (!preview) return [];
    return preview.columns;
  }, [preview]);
  const previewStats = React.useMemo(() => {
    const changedColumns = new Set<string>();
    if (!preview) {
      return {
        changedColumns,
      };
    }
    const rowCount = Math.min(preview.original_rows.length, preview.redacted_rows.length, 5);
    for (const column of preview.columns) {
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const originalValue = displayValue(preview.original_rows[rowIndex]?.[column]);
        const redactedValue = displayValue(preview.redacted_rows[rowIndex]?.[column]);
        if (originalValue !== redactedValue) {
          changedColumns.add(column);
        }
      }
    }
    return {
      changedColumns,
    };
  }, [columns, preview]);
  const previewDescription = loading
    ? t('structured.preview.descLoading')
    : preview
    ? `展示全部 ${columns.length} 个字段的前 5 行样本。`
    : t('structured.preview.descIdle');
  return (
    <Card className="page-surface flex min-h-0 flex-col border-border/70 shadow-[var(--shadow-control)]">
      <CardHeader className="px-4 py-3">
        <CardTitle className="flex flex-wrap items-baseline gap-2 text-sm">
          <span>{t('structured.preview.title')}</span>
          <span className="text-xs font-normal text-muted-foreground">{previewDescription}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-3 pt-0">
        {!preview ? (
          <EmptyState icon={Eye} text={loading ? t('structured.preview.emptyLoading') : t('structured.preview.emptyIdle')} />
        ) : (
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <PreviewTable title={t('structured.preview.original')} columns={columns} rows={preview.original_rows} />
            <PreviewTable
              title={t('structured.preview.redacted')}
              columns={columns}
              rows={preview.redacted_rows}
              muted
              compareRows={preview.original_rows}
              changedColumns={previewStats.changedColumns}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewTable({
  title,
  columns,
  rows,
  muted,
  compareRows,
  changedColumns,
}: {
  title: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  muted?: boolean;
  compareRows?: Array<Record<string, unknown>>;
  changedColumns?: Set<string>;
}) {
  const tableMinWidth = columns.length > 6 ? `${columns.length * 10}rem` : '100%';
  return (
    <div className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-border">
      <div className={cn('border-b border-border px-3 py-2 text-sm font-medium', muted && 'bg-muted/40')}>
        {title}
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="table-fixed text-xs" style={{ minWidth: tableMinWidth }}>
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-2 py-2 text-left">
                  <span className="block truncate" title={column}>
                    {column}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row, index) => (
              <tr key={index} className="border-t border-border">
                {columns.map((column) => {
                  const value = displayValue(row[column]);
                  const changed =
                    Boolean(muted && compareRows && changedColumns?.has(column)) &&
                    displayValue(compareRows?.[index]?.[column]) !== value;
                  return (
                    <td
                      key={column}
                      className={cn('px-2 py-2', changed && 'bg-[var(--success-surface)]')}
                      data-preview-changed={changed ? 'true' : undefined}
                    >
                      <span className="block truncate" title={value}>
                        {value}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
