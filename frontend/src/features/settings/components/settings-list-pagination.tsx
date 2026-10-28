// Copyright 2026 DataInfra-RedactionEverything Contributors

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SettingsListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  testIdPrefix?: string;
}

export function SettingsListPagination({
  page,
  pageSize,
  total,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  testIdPrefix,
}: SettingsListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageCount = Math.min(totalPages, 5);
  const firstPage = Math.min(
    Math.max(1, currentPage - Math.floor(pageCount / 2)),
    Math.max(1, totalPages - pageCount + 1),
  );
  const pages = Array.from({ length: pageCount }, (_, index) => firstPage + index);

  return (
    <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>共 {total} 条</span>
      <div className="flex items-center justify-end gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            className="h-8 w-28"
            data-testid={testIdPrefix ? `${testIdPrefix}-page-size` : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          data-testid={testIdPrefix ? `${testIdPrefix}-prev-page` : undefined}
        >
          上一页
        </Button>
        {firstPage > 1 && <span className="px-1">...</span>}
        {pages.map((item) => (
          <Button
            key={item}
            variant={item === currentPage ? 'default' : 'outline'}
            size="sm"
            className="h-8 min-w-8 px-2"
            onClick={() => onPageChange(item)}
            data-testid={testIdPrefix ? `${testIdPrefix}-page-${item}` : undefined}
          >
            {item}
          </Button>
        ))}
        {firstPage + pageCount <= totalPages && <span className="px-1">...</span>}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          data-testid={testIdPrefix ? `${testIdPrefix}-next-page` : undefined}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
