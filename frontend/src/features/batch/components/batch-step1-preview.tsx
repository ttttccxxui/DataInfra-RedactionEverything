// Copyright 2026 DataInfra-RedactionEverything Contributors

import { memo } from 'react';

import { useT } from '@/i18n';
import type { BatchWizardMode } from '@/services/batchPipeline';

export interface PreviewGroup {
  title: string;
  items: PreviewItem[];
  emptyLabel: string;
  onToggle: (id: string, selected: boolean) => void;
}

export interface PreviewItem {
  id: string;
  name: string;
  selected: boolean;
  disabled?: boolean;
}

export interface BatchStep1PreviewCardsProps {
  mode: BatchWizardMode;
  textPreviewGroups: PreviewGroup[];
  imagePreviewGroups: PreviewGroup[];
  textPresetName: string;
  visionPresetName: string;
  textModeLabel: string;
  imageDetailPills: string[];
  previewDialog: 'text' | 'image' | null;
  setPreviewDialog: (v: 'text' | 'image' | null) => void;
  disabled?: boolean;
}

function BatchStep1PreviewCardsInner({
  mode,
  textPreviewGroups,
  imagePreviewGroups,
  disabled = false,
}: BatchStep1PreviewCardsProps) {
  const t = useT();
  const showTextPreview = mode !== 'image';
  const showImagePreview = mode !== 'text';

  return (
    <>
      <div className="grid h-full min-h-0 gap-2 overflow-hidden xl:grid-cols-2">
        {showTextPreview && (
          <SelectionPreviewSummaryCard
            title={t('batchWizard.step1.textSummary')}
            groups={textPreviewGroups}
            disabled={disabled}
          />
        )}
        {showImagePreview && (
          <SelectionPreviewSummaryCard
            title={t('batchWizard.step1.imageSummary')}
            groups={imagePreviewGroups}
            disabled={disabled}
            testId="step1-image-summary-card"
          />
        )}
      </div>
    </>
  );
}

export const BatchStep1PreviewCards = memo(BatchStep1PreviewCardsInner);

function SelectionPreviewSummaryCard({
  title,
  groups,
  disabled,
  testId,
}: {
  title: string;
  groups: PreviewGroup[];
  disabled?: boolean;
  testId?: string;
}) {
  const visibleGroups = groups.filter(Boolean);

  return (
    <div
      className="flex h-full min-h-0 rounded-xl border border-border/70 bg-white text-card-foreground shadow-[var(--shadow-sm)]"
      style={{ backgroundColor: '#fff' }}
      data-testid={testId}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p
              className="truncate text-sm font-semibold tracking-[-0.02em] text-foreground"
              title={title}
            >
              {title}
            </p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden sm:grid-cols-2">
          {visibleGroups.map((group) => (
            <div
              key={group.title}
              className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border/70 !bg-white"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
                <p className="truncate text-xs font-semibold text-foreground">{group.title}</p>
                <span className="shrink-0 rounded-full border border-border/70 !bg-white px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {countSelected(group.items)}
                </span>
              </div>
              {group.items.length > 0 ? (
                <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto p-2 sm:grid-cols-1 2xl:grid-cols-2">
                  {group.items.map((item) => (
                    <SelectionCheckbox
                      key={item.id}
                      item={item}
                      disabled={disabled}
                      onToggle={(selected) => group.onToggle(item.id, selected)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground">
                  {group.emptyLabel}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function countSelected(items: PreviewItem[]): number {
  return items.filter((item) => item.selected).length;
}

function SelectionCheckbox({
  item,
  disabled,
  onToggle,
}: {
  item: PreviewItem;
  disabled?: boolean;
  onToggle: (selected: boolean) => void;
}) {
  const isDisabled = disabled || item.disabled;
  return (
    <label
      className={[
        'flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs font-medium',
        item.selected
          ? 'border-primary/35 bg-primary/10 text-primary'
          : 'border-border/70 bg-background text-foreground',
        isDisabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/45 hover:bg-primary/5',
      ].join(' ')}
      title={item.name}
    >
      <input
        type="checkbox"
        className="size-3.5 shrink-0 accent-primary"
        checked={item.selected}
        disabled={isDisabled}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <span className="truncate">{item.name}</span>
    </label>
  );
}
