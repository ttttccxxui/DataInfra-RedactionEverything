// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { getEntityTypeName } from '@/config/entityTypes';
import type { EntityTypeConfig } from '../hooks/use-entity-types';
import { SettingsListPagination } from './settings-list-pagination';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type TypeFilter = 'all' | 'builtin' | 'custom';
type TextScopeFilter = 'all' | 'semantic' | 'fallback';

interface EntityTypeListProps {
  types: EntityTypeConfig[];
  onEdit: (type: EntityTypeConfig) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
  variant: 'regex' | 'llm';
  compact?: boolean;
}

export function EntityTypeList({
  types,
  onEdit,
  onDelete,
  onAdd,
  variant,
  compact = false,
}: EntityTypeListProps) {
  const t = useT();
  const isRegex = variant === 'regex';
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [textScopeFilter, setTextScopeFilter] = useState<TextScopeFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const filteredTypes = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return types.filter((type) => {
      const matchesTextScope =
        variant !== 'llm' ||
        textScopeFilter === 'all' ||
        (textScopeFilter === 'semantic' && !isFallbackEntityType(type)) ||
        (textScopeFilter === 'fallback' && isFallbackEntityType(type));
      if (!matchesTextScope) return false;
      const systemManaged = isSystemEntityType(type);
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'builtin' && systemManaged) ||
        (typeFilter === 'custom' && !systemManaged);
      if (!matchesType) return false;
      if (!query) return true;
      const name = getEntityDisplayName(type);
      return name.toLowerCase().includes(query);
    });
  }, [keyword, textScopeFilter, typeFilter, types, variant]);
  const totalPages = Math.max(1, Math.ceil(filteredTypes.length / pageSize));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting pagination when variant changes
    setPage(1);
  }, [keyword, pageSize, textScopeFilter, typeFilter, variant]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamping page to valid range when total changes
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const visibleTypes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTypes.slice(start, start + pageSize);
  }, [filteredTypes, page, pageSize]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  return (
    <div
      className={cn(
        'flex min-h-0 w-full flex-col gap-2.5 overflow-hidden',
        compact ? 'shrink-0' : 'flex-1',
      )}
      data-testid={`entity-type-list-${variant}`}
    >
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索名称"
                className="h-9 w-full rounded-[var(--radius-md)] border border-input bg-[var(--surface-control)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-ring"
                data-testid={`search-${variant}-types`}
              />
            </div>
            {variant === 'llm' && (
              <Select
                value={textScopeFilter}
                onValueChange={(value) => setTextScopeFilter(value as TextScopeFilter)}
              >
                <SelectTrigger
                  className="h-9 w-full sm:w-40"
                  data-testid={`category-filter-${variant}`}
                >
                  <SelectValue placeholder="全部类别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类别</SelectItem>
                  <SelectItem value="semantic">语义标签</SelectItem>
                  <SelectItem value="fallback">正则兜底</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              <SelectTrigger className="h-9 w-full sm:w-36" data-testid={`type-filter-${variant}`}>
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="builtin">内置</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 justify-end">
            <Button
              size="sm"
              className="h-9 whitespace-nowrap px-4"
              onClick={onAdd}
              data-testid={`add-${variant}-type`}
            >
              + 新建识别项
            </Button>
          </div>
        </div>

        <div className="min-h-0 w-full overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/35">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 whitespace-nowrap px-4 text-center">
                  {t('settings.table.index')}
                </TableHead>
                <TableHead className="w-32 min-w-28 whitespace-nowrap px-4 text-left">
                  识别项名称
                </TableHead>
                <TableHead className="min-w-[34rem] px-4 text-left">
                  {t('settings.table.description')}
                </TableHead>
                <TableHead className="w-36 whitespace-nowrap px-4 text-center">
                  类别
                </TableHead>
                <TableHead className="w-28 whitespace-nowrap px-4 text-center">
                  类型
                </TableHead>
                <TableHead className="w-32 whitespace-nowrap px-4 text-center">
                  {t('settings.table.updatedBy')}
                </TableHead>
                <TableHead className="w-44 whitespace-nowrap px-4 text-center">
                  {t('settings.table.updatedAt')}
                </TableHead>
                <TableHead className="w-40 whitespace-nowrap px-4 text-center">
                  {t('settings.table.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                visibleTypes.map((type, index) => {
                  const systemManaged = isSystemEntityType(type);
                  const rowNumber = (page - 1) * pageSize + index + 1;
                  const name = systemManaged ? getEntityTypeName(type.id) : type.name;

                  return (
                    <TableRow key={type.id} className="bg-card/50">
                      <TableCell className="px-4 text-center font-medium text-muted-foreground tabular-nums">
                        {rowNumber}
                      </TableCell>
                      <TableCell className="px-4 text-left font-semibold text-foreground">
                        <span className="block truncate" title={name}>
                          {name}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-left text-foreground">
                        <span className="line-clamp-2 leading-6">
                          {getEntityDescription(type, isRegex, t)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-center">
                        <Badge
                          variant="secondary"
                          className={cn('font-medium', textCategoryBadgeClass(type))}
                        >
                          {getTextCategoryLabel(type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-center">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'font-medium',
                            systemManaged
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-primary/10 text-primary',
                          )}
                        >
                          {systemManaged ? '内置' : '自定义'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-center text-foreground">
                        {getUpdatedBy(type)}
                      </TableCell>
                      <TableCell className="px-4 text-center text-foreground tabular-nums">
                        {formatAuditDate(getUpdatedAt(type))}
                      </TableCell>
                      <TableCell className="px-4 text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto whitespace-nowrap px-0"
                            disabled={systemManaged}
                            onClick={() => onEdit(type)}
                            aria-label={t('common.edit')}
                            data-testid={`edit-type-${type.id}`}
                          >
                            {t('common.edit')}
                          </Button>
                          <span className="text-border">·</span>
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto whitespace-nowrap px-0 text-destructive"
                            disabled={systemManaged}
                            onClick={() => onDelete(type.id)}
                            aria-label={t('common.delete')}
                            data-testid={`delete-type-${type.id}`}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {filteredTypes.length > 0 && (
          <SettingsListPagination
            page={page}
            pageSize={pageSize}
            total={filteredTypes.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            testIdPrefix={`entity-${variant}`}
          />
        )}
      </div>
    </div>
  );
}

function getEntityDescription(
  type: EntityTypeConfig,
  isRegex: boolean,
  t: (key: string) => string,
) {
  if (type.description?.trim()) return type.description;
  if (isRegex && type.regex_pattern?.trim()) return type.regex_pattern;
  return t('settings.table.emptyValue');
}

function getEntityDisplayName(type: EntityTypeConfig) {
  return type.id.startsWith('custom_') ? type.name : getEntityTypeName(type.id);
}

function isSystemEntityType(type: EntityTypeConfig) {
  return !type.id.startsWith('custom_');
}

function isFallbackEntityType(type: EntityTypeConfig) {
  return Boolean(type.regex_pattern?.trim());
}

function getTextCategoryLabel(type: EntityTypeConfig) {
  return isFallbackEntityType(type) ? '正则兜底' : '语义标签';
}

function textCategoryBadgeClass(type: EntityTypeConfig) {
  return isFallbackEntityType(type)
    ? 'bg-violet-100 text-violet-700'
    : 'bg-primary/10 text-primary';
}

function getUpdatedBy(type: EntityTypeConfig) {
  return (
    type.updated_by?.trim() ||
    type.updatedBy?.trim() ||
    type.created_by?.trim() ||
    type.createdBy?.trim() ||
    '-'
  );
}

function getUpdatedAt(type: EntityTypeConfig) {
  return type.updated_at || type.updatedAt || type.created_at || type.createdAt || null;
}

function formatAuditDate(value?: string | null) {
  return formatDateTime(value);
}
