// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/i18n';
import { formatDateTime, getDateTimestamp } from '@/lib/format-date';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InteractionLockOverlay } from '@/components/InteractionLockOverlay';
import { getEntityTypeName } from '@/config/entityTypes';
import { type RecognitionPreset } from '@/services/presetsApi';
import { useRedactionPresets } from './hooks/use-redaction-presets';
import { RedactionPresetDialog } from './redaction-preset-dialog';
import type { EntityTypeConfig, PipelineConfig } from './hooks/use-entity-types';
import { SettingsListPagination } from './components/settings-list-pagination';

type PresetTab = 'text' | 'vision';
type TypeFilter = 'all' | 'builtin' | 'custom';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function RedactionList() {
  const t = useT();
  const state = useRedactionPresets();
  const [operationLoading, setOperationLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<PresetTab>('text');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailPreset, setDetailPreset] = useState<RecognitionPreset | null>(null);

  const runLocked = async (action: () => void | Promise<void>) => {
    if (operationLoading) return;
    setOperationLoading(true);
    try {
      await action();
    } finally {
      setOperationLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [activeTab, keyword, pageSize, typeFilter]);

  const textRows = useMemo(
    () => sortPresetsByUpdated([{ ...state.defaultTextPreset, readonly: true }, ...state.textPresets]),
    [state.defaultTextPreset, state.textPresets],
  );
  const visionRows = useMemo(
    () => sortPresetsByUpdated([{ ...state.defaultVisionPreset, readonly: true }, ...state.visionPresets]),
    [state.defaultVisionPreset, state.visionPresets],
  );
  const activeRows = activeTab === 'text' ? textRows : visionRows;

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return activeRows.filter((preset) => {
      const readonly = Boolean(preset.readonly);
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'builtin' && readonly) ||
        (typeFilter === 'custom' && !readonly);
      if (!matchesType) return false;
      return !query || preset.name.toLowerCase().includes(query);
    });
  }, [activeRows, keyword, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = useMemo(() => {
    const start = (Math.max(1, page) - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);
  const entityNameById = useMemo(
    () => buildEntityNameMap(state.effectiveEntityTypes),
    [state.effectiveEntityTypes],
  );
  const pipelineTypeNameById = useMemo(
    () => buildPipelineTypeNameMap(state.effectivePipelines),
    [state.effectivePipelines],
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const handleDelete = (preset: RecognitionPreset) => {
    if (preset.readonly) return;
    state.setConfirmState({
      title: t('common.delete'),
      message: t('settings.redaction.confirmDelete'),
      danger: true,
      onConfirm: () => state.removePreset(preset.id),
    });
  };

  if (state.loading) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="saas-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="page-shell !max-w-[min(100%,1920px)] !px-3 !py-2 sm:!px-4 sm:!py-3">
        <div className="page-stack gap-3 overflow-hidden">
          {state.loadError && (
            <Alert variant="destructive">
              <AlertDescription>{state.loadError}</AlertDescription>
            </Alert>
          )}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="inline-flex h-10 rounded-xl bg-card p-1 shadow-[var(--shadow-control)]">
              <button
                type="button"
                className={tabButtonClass(activeTab === 'text')}
                onClick={() => setActiveTab('text')}
                data-testid="preset-tab-text"
              >
                文本配置清单
              </button>
              <button
                type="button"
                className={tabButtonClass(activeTab === 'vision')}
                onClick={() => setActiveTab('vision')}
                data-testid="preset-tab-vision"
              >
                图像配置清单
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]">
            <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="搜索清单名称"
                    className="h-9 w-full rounded-[var(--radius-md)] border border-input bg-[var(--surface-control)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-ring"
                    data-testid="preset-search"
                  />
                </div>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
                  <SelectTrigger className="h-9 w-full sm:w-36" data-testid="preset-type-filter">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    <SelectItem value="builtin">内置</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="h-9 whitespace-nowrap px-4"
                onClick={() => state.openNew(activeTab)}
                data-testid="preset-new"
              >
                + {activeTab === 'text' ? '新建文本清单' : '新建图像清单'}
              </Button>
            </div>

            <Table>
              <TableHeader className="bg-muted/35">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-center">序号</TableHead>
                  <TableHead className="w-48 text-center">清单名称</TableHead>
                  {activeTab === 'text' ? (
                    <TableHead className="w-[44rem] min-w-[38rem] text-left">文本识别项</TableHead>
                  ) : (
                    <>
                      <TableHead className="min-w-52 text-left">图像文字识别项</TableHead>
                      <TableHead className="min-w-52 text-left">视觉特征项</TableHead>
                    </>
                  )}
                  <TableHead className="w-28 text-center">类型</TableHead>
                  <TableHead className="w-36 text-center">更新人</TableHead>
                  <TableHead className="w-52 text-center">更新时间</TableHead>
                  <TableHead className="w-52 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((preset, index) => {
                  const readonly = Boolean(preset.readonly);
                  return (
                    <TableRow key={`${activeTab}-${preset.id}`} className="bg-card/50">
                      <TableCell className="text-center text-sm text-muted-foreground tabular-nums">
                        {(page - 1) * pageSize + index + 1}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-foreground">
                        {preset.name}
                      </TableCell>
                      {activeTab === 'text' ? (
                        <TableCell className="w-[44rem] min-w-[38rem] text-left text-foreground">
                          <PresetItemsCell
                            items={resolvePresetItems(preset.selectedEntityTypeIds, entityNameById)}
                            wide
                          />
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="text-left text-foreground">
                            <PresetItemsCell items={resolvePresetItems(preset.ocrHasTypes, pipelineTypeNameById)} />
                          </TableCell>
                          <TableCell className="text-left text-foreground">
                            <PresetItemsCell
                              items={resolvePresetItems(preset.visualFeatureTypes ?? [], pipelineTypeNameById)}
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={
                            readonly
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-primary/10 text-primary'
                          }
                        >
                          {readonly ? '内置' : '自定义'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-foreground">
                        {getPresetUpdatedBy(preset)}
                      </TableCell>
                      <TableCell className="text-center text-foreground tabular-nums">
                        {formatAuditDate(getPresetUpdatedAt(preset))}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto px-0"
                            disabled={readonly}
                            onClick={() => state.openEdit(preset)}
                          >
                            编辑
                          </Button>
                          <span className="text-border">·</span>
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto px-0"
                            onClick={() => setDetailPreset(preset)}
                          >
                            详情
                          </Button>
                          <span className="text-border">·</span>
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto px-0 text-destructive"
                            disabled={readonly}
                            onClick={() => handleDelete(preset)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!visibleRows.length && (
                  <TableRow>
                    <TableCell
                      colSpan={activeTab === 'text' ? 7 : 8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      暂无匹配清单
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {filteredRows.length > 0 && (
              <SettingsListPagination
                page={page}
                pageSize={pageSize}
                total={filteredRows.length}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                testIdPrefix={`preset-${activeTab}`}
              />
            )}
          </div>
        </div>
      </div>

      <PresetDetailDialog
        preset={detailPreset}
        tab={activeTab}
        entityTypes={state.effectiveEntityTypes}
        pipelines={state.effectivePipelines}
        onClose={() => setDetailPreset(null)}
      />

      <RedactionPresetDialog
        modalOpen={state.modalOpen}
        editingPresetId={state.editingPresetId}
        presetForm={state.presetForm}
        saving={state.saving}
        regexTypes={state.regexTypes}
        semanticTypes={state.semanticTypes}
        effectivePipelines={state.effectivePipelines}
        presetKindLabel={state.presetKindLabel}
        setPresetForm={state.setPresetForm}
        setModalOpen={state.setModalOpen}
        saveModal={state.saveModal}
      />
      {state.confirmState && (
        <ConfirmDialog
          open
          title={state.confirmState.title}
          message={state.confirmState.message}
          danger={state.confirmState.danger}
          onConfirm={() =>
            void runLocked(async () => {
              const action = state.confirmState?.onConfirm;
              state.setConfirmState(null);
              await action?.();
            })
          }
          onCancel={() => state.setConfirmState(null)}
        />
      )}
      <InteractionLockOverlay active={operationLoading || state.saving} />
    </div>
  );
}

function PresetDetailDialog({
  preset,
  tab,
  entityTypes,
  pipelines,
  onClose,
}: {
  preset: RecognitionPreset | null;
  tab: PresetTab;
  entityTypes: EntityTypeConfig[];
  pipelines: PipelineConfig[];
  onClose: () => void;
}) {
  const entityNameById = useMemo(
    () => buildEntityNameMap(entityTypes),
    [entityTypes],
  );
  const pipelineTypeNameById = useMemo(
    () => buildPipelineTypeNameMap(pipelines),
    [pipelines],
  );

  if (!preset) return null;

  const textItems = resolvePresetItems(preset.selectedEntityTypeIds, entityNameById);
  const ocrItems = resolvePresetItems(preset.ocrHasTypes, pipelineTypeNameById);
  const visualItems = resolvePresetItems(preset.visualFeatureTypes ?? [], pipelineTypeNameById);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{preset.name}</DialogTitle>
          <DialogDescription>配置清单详情</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-3">
            <DetailMeta label="更新人" value={getPresetUpdatedBy(preset)} />
            <DetailMeta label="更新时间" value={formatAuditDate(getPresetUpdatedAt(preset))} />
            <DetailMeta label="清单类型" value={tab === 'text' ? '文本配置清单' : '图像配置清单'} />
          </div>
          {(tab === 'text' || preset.kind === 'full') && (
            <DetailSection title="文本识别项" items={textItems} />
          )}
          {(tab === 'vision' || preset.kind === 'full') && (
            <>
              <DetailSection title="图像文字识别项" items={ocrItems} />
              <DetailSection title="视觉特征项" items={visualItems} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function DetailSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-sm text-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">暂无配置项</p>
      )}
    </section>
  );
}

function PresetItemsCell({ items, wide = false }: { items: string[]; wide?: boolean }) {
  const label = items.length > 0 ? items.join('、') : '-';
  return (
    <span className={wide ? 'block max-w-[42rem] truncate' : 'block max-w-[24rem] truncate'} title={label}>
      {label}
    </span>
  );
}

function buildEntityNameMap(entityTypes: EntityTypeConfig[]): Map<string, string> {
  return new Map(
    entityTypes.map((type) => [
      type.id,
      type.id.startsWith('custom_') ? type.name : getEntityTypeName(type.id),
    ]),
  );
}

function buildPipelineTypeNameMap(pipelines: PipelineConfig[]): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const pipeline of pipelines) {
    for (const type of pipeline.types ?? []) entries.push([type.id, type.name]);
  }
  return new Map(entries);
}

function resolvePresetItems(ids: string[], nameById: Map<string, string>): string[] {
  return ids.map((id) => nameById.get(id) ?? id).filter(Boolean);
}

function tabButtonClass(active: boolean) {
  return [
    'h-8 rounded-lg px-4 text-sm font-semibold transition-colors',
    active ? 'bg-primary text-primary-foreground shadow-[var(--shadow-control)]' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  ].join(' ');
}

function sortPresetsByUpdated(presets: RecognitionPreset[]): RecognitionPreset[] {
  return [...presets].sort(
    (a, b) => getSortableTime(getPresetUpdatedAt(b)) - getSortableTime(getPresetUpdatedAt(a)),
  );
}

function getPresetUpdatedBy(preset: RecognitionPreset) {
  return preset.updated_by || preset.created_by || (preset.readonly ? 'system' : '-');
}

function getPresetUpdatedAt(preset: RecognitionPreset) {
  return preset.updated_at || preset.created_at || null;
}

function getSortableTime(value?: string | null): number {
  return getDateTimestamp(value);
}

function formatAuditDate(value?: string | null) {
  return formatDateTime(value);
}
