// Copyright 2026 DataInfra-RedactionEverything Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsListPagination } from '@/features/settings/components/settings-list-pagination';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import type {
  StructuredColumnPolicy,
  StructuredColumnProfile,
  StructuredDataset,
  StructuredPolicyAction,
  StructuredProfile,
} from '@/services/structuredApi';
import { getActionOptions, EMPTY_STRUCTURED_COLUMNS } from '../lib/constants';
import { displayValue } from '../lib/dataset-utils';
import {
  defaultEnabledPolicyAction,
  isPolicyAdjusted,
  orderColumnsForPolicyReview,
  profileToPolicy,
  updatePolicy,
} from '../lib/policy-utils';
import { EmptyState } from './shared';

const POLICY_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_POLICY_PAGE_SIZE = 10;

export function ProfilePolicyCard({
  dataset,
  profile,
  policy,
  fieldPage,
  currentPageReviewed: _currentPageReviewed,
  reviewedPageCount: _reviewedPageCount,
  pageCount: _pageCount,
  onFieldPageChange,
  onPolicyChange,
}: {
  dataset: StructuredDataset | null;
  profile: StructuredProfile | null;
  policy: StructuredColumnPolicy[];
  fieldPage: number;
  currentPageReviewed: boolean;
  reviewedPageCount: number;
  pageCount: number;
  onFieldPageChange: (page: number) => void;
  onPolicyChange: (policy: StructuredColumnPolicy[]) => void;
}) {
  const t = useT();
  const actionOptions = getActionOptions();
  const profileColumns = profile?.columns ?? EMPTY_STRUCTURED_COLUMNS;
  const policyByColumn = new Map(policy.map((item) => [item.column, item]));
  const reviewColumns = React.useMemo(() => orderColumnsForPolicyReview(profileColumns), [profileColumns]);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_POLICY_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(profileColumns.length / pageSize));
  const safePage = Math.min(fieldPage, pageCount - 1);
  const visibleColumns = reviewColumns.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const visiblePolicyRows = visibleColumns.map((column) => ({
    column,
    current: policyByColumn.get(column.name) ?? profileToPolicy(column),
  }));

  React.useEffect(() => {
    if (fieldPage > pageCount - 1) onFieldPageChange(pageCount - 1);
  }, [fieldPage, onFieldPageChange, pageCount]);

  return (
    <Card className="page-surface flex min-h-0 flex-col border-border/70 shadow-[var(--shadow-control)]">
      <CardHeader className="flex-row items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{dataset ? dataset.name : t('structured.policy.title')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 px-0 pb-0 pt-0">
        <div className="min-h-0 overflow-x-auto" data-testid="policy-table-frame">
          {profileColumns.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              text={dataset ? t('structured.policy.emptyWithDataset') : t('structured.policy.emptyNoDataset')}
            />
          ) : (
            <>
              <table className="w-full min-w-[64rem] table-fixed border-collapse text-xs" data-testid="policy-table">
                <thead className="sticky top-0 bg-[var(--background-secondary)] text-xs text-muted-foreground">
                  <tr className="border-b border-border-light">
                    <th className="h-9 w-[7%] px-3 text-center font-medium">序号</th>
                    <th className="h-9 w-[27%] px-3 text-left font-medium">{t('structured.policy.th.field')}</th>
                    <th className="h-9 w-[15%] px-3 text-left font-medium">{t('structured.policy.th.entity')}</th>
                    <th className="h-9 w-[12%] px-3 text-left font-medium">{t('structured.policy.th.risk')}</th>
                    <th className="h-9 w-[12%] px-3 text-left font-medium">{t('structured.policy.th.confidence')}</th>
                    <th className="h-9 w-[20%] px-3 text-left font-medium">{t('structured.policy.th.action')}</th>
                    <th className="h-9 w-[7%] px-3 text-left font-medium">{t('structured.policy.th.enabled')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePolicyRows.map(({ column, current }, index) => {
                    const adjusted = isPolicyAdjusted(column, current);
                    return (
                      <tr
                        key={column.name}
                        className={cn(
                          'border-b border-border-light transition-colors hover:bg-[var(--background-secondary)]',
                          adjusted && 'bg-[var(--warning-surface)] hover:bg-[var(--warning-surface)]',
                        )}
                        data-testid="policy-row"
                        data-policy-column={column.name}
                        data-policy-adjusted={adjusted ? 'true' : 'false'}
                      >
                        <td className="px-3 py-2.5 text-center font-medium text-muted-foreground">
                          {safePage * pageSize + index + 1}
                        </td>
                        <td className="max-w-56 px-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-1.5 leading-tight" title={column.name}>
                            <span className="min-w-0 truncate font-medium">{column.name}</span>
                            {adjusted ? (
                              <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--warning-foreground)]">
                                {t('structured.policy.adjusted')}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className="block truncate text-[10px] leading-[1.05] text-muted-foreground"
                            title={column.sample_values.map(displayValue).join(' / ')}
                          >
                            {column.sample_values.map(displayValue).join(' / ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{column.entity_type}</td>
                        <td className="px-3 py-2.5">
                          <RiskBadge risk={column.risk_level} />
                        </td>
                        <td className="px-3 py-2.5">{Math.round(column.confidence * 100)}%</td>
                        <td className="px-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Select
                              value={current.action}
                              onValueChange={(action) => {
                                const nextAction = action as StructuredPolicyAction;
                                onPolicyChange(
                                  updatePolicy(policy, column, {
                                    action: nextAction,
                                    enabled: nextAction !== 'keep',
                                  }),
                                );
                              }}
                            >
                              <SelectTrigger className="h-8 min-w-[5.5rem] flex-1 justify-between px-2.5 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {actionOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {adjusted ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 px-2.5 text-xs"
                                data-testid="policy-reset-recommendation"
                                onClick={() => onPolicyChange(updatePolicy(policy, column, profileToPolicy(column)))}
                              >
                                {t('structured.policy.restore')}
                              </Button>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Checkbox
                            checked={current.enabled && current.action !== 'keep'}
                            onCheckedChange={(checked) => {
                              const enabled = checked === true;
                              onPolicyChange(
                                updatePolicy(policy, column, {
                                  enabled,
                                  action: enabled ? defaultEnabledPolicyAction(column, current) : 'keep',
                                }),
                              );
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SettingsListPagination
                page={safePage + 1}
                pageSize={pageSize}
                total={profileColumns.length}
                pageSizeOptions={POLICY_PAGE_SIZE_OPTIONS}
                onPageChange={(page) => onFieldPageChange(page - 1)}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  onFieldPageChange(0);
                }}
                testIdPrefix="policy-fields"
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskBadge({ risk }: { risk: StructuredColumnProfile['risk_level'] }) {
  const t = useT();
  const meta = {
    low: { label: t('structured.risk.low'), tone: 'border-border text-muted-foreground' },
    medium: { label: t('structured.risk.medium'), tone: 'border-[var(--warning-foreground)] text-[var(--warning-foreground)]' },
    high: { label: t('structured.risk.high'), tone: 'border-[var(--error-foreground)] text-[var(--error-foreground)]' },
    critical: {
      label: t('structured.risk.critical'),
      tone: 'border-[var(--error-foreground)] bg-[var(--error-surface)] text-[var(--error-foreground)]',
    },
  }[risk];
  return (
    <Badge variant="outline" className={cn(meta.tone)} title={risk}>
      {meta.label}
    </Badge>
  );
}
