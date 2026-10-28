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
import {
  getPipelineTone,
  getToneColor,
  type PipelineConfig,
  type PipelineTypeConfig,
  type VisualFeatureFewShotSample,
} from '../hooks/use-entity-types';
import type { PipelineMode } from '@/services/defaultRedactionPreset';
import {
  emptyForm,
  emptyPromptRow,
  negativePromptsFromType,
  positivePromptsFromType,
  samplesFromType,
  type PipelineTypeForm,
} from './pipeline-type-form';
import { PipelineTypeDialog } from './pipeline-type-dialog';
import { SettingsListPagination } from './settings-list-pagination';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type TypeFilter = 'all' | 'builtin' | 'custom';

type SettingsPipelineTab = Extract<PipelineMode, 'ocr_has' | 'visual_features'>;
type DisplayPipelineType = PipelineTypeConfig & { pipelineMode: PipelineMode };
type DisplayPipeline = Omit<PipelineConfig, 'mode' | 'types'> & {
  mode: SettingsPipelineTab;
  types: DisplayPipelineType[];
};

interface PipelineConfigPanelProps {
  loading: boolean;
  pipelines: PipelineConfig[];
  fixedMode?: SettingsPipelineTab;
  onCreateType: (
    mode: PipelineMode,
    name: string,
    desc: string,
    options?: Pick<
      PipelineTypeConfig,
      | 'rules'
      | 'checklist'
      | 'negative_prompt_enabled'
      | 'negative_prompt'
      | 'few_shot_enabled'
      | 'few_shot_samples'
    >,
  ) => Promise<boolean>;
  onUpdateType: (
    mode: string,
    typeId: string,
    update: Partial<PipelineTypeConfig> & { name: string; description?: string },
  ) => Promise<boolean>;
  onDeleteType: (mode: string, typeId: string) => void;
  onReset: () => void;
}

export function PipelineConfigPanel({
  loading,
  pipelines,
  fixedMode,
  onCreateType,
  onUpdateType,
  onDeleteType,
}: PipelineConfigPanelProps) {
  const t = useT();
  const activeSub = fixedMode ?? 'ocr_has';
  const [dialogMode, setDialogMode] = useState<PipelineMode | null>(null);
  const [editing, setEditing] = useState<{ mode: string; type: PipelineTypeConfig } | null>(null);
  const [form, setForm] = useState<PipelineTypeForm>(() => emptyForm());
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const ocrPipeline = pipelines.find((pipeline) => pipeline.mode === 'ocr_has');
  const visualPipeline = pipelines.find((pipeline) => pipeline.mode === 'visual_features');
  const imageLabel = t('settings.pipelineDisplayName.image');
  const ocrDisplayPipeline = useMemo<DisplayPipeline | undefined>(() => {
    if (!ocrPipeline) return undefined;
    return {
      ...ocrPipeline,
      mode: 'ocr_has',
      types: ocrPipeline.types.map((type) => ({ ...type, pipelineMode: 'ocr_has' })),
    };
  }, [ocrPipeline]);
  const visualDisplayPipeline = useMemo<DisplayPipeline | undefined>(() => {
    if (!visualPipeline) return undefined;
    return {
      ...visualPipeline,
      mode: 'visual_features',
      name: imageLabel,
      description: visualPipeline.description ?? '',
      enabled: Boolean(visualPipeline.enabled),
      types: visualPipeline.types.map((type) => ({
        ...type,
        pipelineMode: 'visual_features' as PipelineMode,
      })),
    };
  }, [imageLabel, visualPipeline]);
  const activePipeline = activeSub === 'visual_features' ? visualDisplayPipeline : ocrDisplayPipeline;

  const openCreate = (mode: PipelineMode) => {
    setEditing(null);
    setForm(emptyForm());
    setDialogMode(mode);
  };

  const openEdit = (mode: string, type: PipelineTypeConfig) => {
    setEditing({ mode, type: { ...type } });
    setForm({
      name: type.name,
      description: type.description ?? '',
      rulesText: (type.rules ?? []).join('\n'),
      positivePrompts: positivePromptsFromType(type),
      negativePrompts: negativePromptsFromType(type),
      samples: samplesFromType(type),
    });
    setDialogMode(mode as PipelineMode);
  };

  const handleSave = async () => {
    if (!dialogMode || !form.name.trim()) return;

    const useVisualChecklist = dialogMode === 'visual_features';
    const positiveRows = useVisualChecklist
      ? form.positivePrompts
      : form.rulesText.split('\n').map((line) => emptyPromptRow(line));
    const checklist = positiveRows
      .map((item) => item.text.trim())
      .filter(Boolean)
      .map((rule) => ({
        rule,
        positive_prompt: null,
        negative_prompt: null,
      }));
    const rules = checklist.map((item) => item.rule);
    const negativePrompt = form.negativePrompts
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join('\n');
    const samples: VisualFeatureFewShotSample[] = form.samples.map((sample) => ({
      type: sample.type,
      image: sample.image,
      label: sample.label.trim() || null,
      filename: sample.filename ?? null,
    }));
    let ok: boolean;
    if (editing) {
      ok = await onUpdateType(editing.mode, editing.type.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        examples: editing.type.examples || [],
        color: getToneColor(getPipelineTone(editing.mode as PipelineMode)),
        enabled: editing.type.enabled,
        order: editing.type.order,
        rules,
        checklist,
        negative_prompt_enabled: negativePrompt.length > 0,
        negative_prompt: negativePrompt || null,
        few_shot_enabled: samples.length > 0,
        few_shot_samples: samples,
      });
    } else {
      ok = await onCreateType(dialogMode, form.name, form.description, {
        rules,
        checklist,
        negative_prompt_enabled: negativePrompt.length > 0,
        negative_prompt: negativePrompt || null,
        few_shot_enabled: samples.length > 0,
        few_shot_samples: samples,
      });
    }
    if (!ok) return;

    setDialogMode(null);
    setEditing(null);
    setForm(emptyForm());
  };

  const filteredTypes = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const source = activePipeline?.types ?? [];
    return source.filter((type) => {
      const systemManaged = isSystemPipelineType(type);
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'builtin' && systemManaged) ||
        (typeFilter === 'custom' && !systemManaged);
      if (!matchesType) return false;
      if (!query) return true;
      return type.name.toLowerCase().includes(query);
    });
  }, [activePipeline, keyword, typeFilter]);
  const activeCount = filteredTypes.length;
  const totalPages = Math.max(1, Math.ceil(activeCount / pageSize));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting pagination when active tab changes
    setPage(1);
  }, [activeSub, keyword, pageSize, typeFilter]);

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
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
      <div
        className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-control)]"
        data-testid="vision-pipeline-panel"
      >
        <div className="flex flex-col gap-3 border-b border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索名称"
                className="h-9 w-full rounded-[var(--radius-md)] border border-input bg-[var(--surface-control)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-ring"
                data-testid={`search-pipeline-${activeSub}`}
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              <SelectTrigger className="h-9 w-full sm:w-36" data-testid={`type-filter-${activeSub}`}>
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
              onClick={() => openCreate(activeSub)}
              data-testid="add-pipeline-type"
            >
              + 新建识别项
            </Button>
          </div>
        </div>

        <div className="min-h-0 w-full overflow-hidden bg-card">
          {loading ? (
            <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/35">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 whitespace-nowrap px-4 text-center">
                    {t('settings.table.index')}
                  </TableHead>
                  <TableHead className="w-[18%] min-w-36 whitespace-nowrap px-4 text-left">
                    识别项名称
                  </TableHead>
                  <TableHead className="min-w-[22rem] px-4 text-left">
                    {t('settings.table.description')}
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
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleTypes.map((type, index) => {
                    const rowNumber = (page - 1) * pageSize + index + 1;

                    return (
                      <TableRow key={`${type.pipelineMode}-${type.id}`} className="bg-card/50">
                        <TableCell className="px-4 text-center font-medium text-muted-foreground tabular-nums">
                          {rowNumber}
                        </TableCell>
                        <TableCell className="px-4 text-left font-semibold text-foreground">
                          <span className="block truncate" title={type.name}>
                            {type.name}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-left text-foreground">
                          <span className="line-clamp-2 leading-6">
                            {type.description || t('settings.table.emptyValue')}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'font-medium',
                              isSystemPipelineType(type)
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-primary/10 text-primary',
                            )}
                          >
                            {isSystemPipelineType(type) ? '内置' : '自定义'}
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
                              onClick={() => openEdit(type.pipelineMode, type)}
                              aria-label={t('common.edit')}
                              data-testid={`edit-pipeline-${type.id}`}
                            >
                              {t('common.edit')}
                            </Button>
                            <span className="text-border">·</span>
                            <Button
                              size="sm"
                              variant="link"
                              className="h-auto whitespace-nowrap px-0 text-destructive"
                              onClick={() => onDeleteType(type.pipelineMode, type.id)}
                              aria-label={t('common.delete')}
                              data-testid={`delete-pipeline-${type.id}`}
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
          )}
        </div>

        {activeCount > 0 && (
          <SettingsListPagination
            page={page}
            pageSize={pageSize}
            total={activeCount}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            testIdPrefix={`pipeline-${activeSub}`}
          />
        )}
      </div>

      <PipelineTypeDialog
        mode={dialogMode}
        isEditing={editing !== null}
        form={form}
        setForm={setForm}
        onClose={() => {
          setDialogMode(null);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function getUpdatedBy(type: PipelineTypeConfig) {
  return (
    type.updated_by?.trim() ||
    type.updatedBy?.trim() ||
    type.created_by?.trim() ||
    type.createdBy?.trim() ||
    '-'
  );
}

function getUpdatedAt(type: PipelineTypeConfig) {
  return type.updated_at || type.updatedAt || type.created_at || type.createdAt || null;
}

function isSystemPipelineType(type: PipelineTypeConfig) {
  return !type.id.startsWith('custom_') && !type.created_by && !type.createdBy;
}

function formatAuditDate(value?: string | null) {
  return formatDateTime(value);
}
