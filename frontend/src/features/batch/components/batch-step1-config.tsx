// Copyright 2026 DataInfra-RedactionEverything Contributors

import { memo, useEffect, useState } from 'react';

import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useBatchWizardContext } from '../batch-wizard-context';
import type { PreviewGroup } from './batch-step1-preview';
import { BatchStep1PresetCards } from './batch-step1-preset-cards';
import { BatchStep1PreviewCards } from './batch-step1-preview';
import { BatchStep1Footer } from './batch-step1-footer';

function BatchStep1ConfigInner() {
  const t = useT();
  const {
    mode,
    cfg,
    setCfg,
    configLoaded,
    jobConfigLocked,
    textTypes,
    pipelines,
    textPresets,
    visionPresets,
    presetLoadError,
    presetReloading,
    retryLoadPresets,
    onBatchTextPresetChange,
    onBatchVisionPresetChange,
    confirmStep1,
    setConfirmStep1,
    isStep1Complete,
    advanceToUploadStep,
  } = useBatchWizardContext();

  const [previewDialog, setPreviewDialog] = useState<'text' | 'image' | null>(null);

  useEffect(() => {
    if (jobConfigLocked) return;
    if (cfg.executionDefault !== 'queue') {
      setCfg((current) => ({ ...current, executionDefault: 'queue' }));
    }
  }, [cfg.executionDefault, jobConfigLocked, setCfg]);

  const textRedactionMode = cfg.replacementMode ?? 'structured';
  const imageRedactionMethod = cfg.imageRedactionMethod ?? 'mosaic';
  const imageRedactionStrength = cfg.imageRedactionStrength ?? 75;
  const imageFillColor = cfg.imageFillColor ?? '#000000';
  const textPresetName =
    textPresets.find((preset) => preset.id === cfg.presetTextId)?.name ??
    t('batchWizard.step1.defaultPreset');
  const visionPresetName =
    visionPresets.find((preset) => preset.id === cfg.presetVisionId)?.name ??
    t('batchWizard.step1.defaultPreset');
  const ocrTypes = pipelines
    .filter((pipeline) => pipeline.mode === 'ocr_has')
    .flatMap((pipeline) => pipeline.types);
  const visualFeatureTypes = pipelines
    .filter((pipeline) => pipeline.mode === 'visual_features')
    .flatMap((pipeline) => pipeline.types);
  const defaultTextSummary = t('batchWizard.step1.defaultTextCoverage').replace(
    '{count}',
    String(cfg.selectedEntityTypeIds.length),
  );
  const textModeLabel =
    textRedactionMode === 'smart'
      ? t('batchWizard.step1.textMethodSmart')
      : textRedactionMode === 'mask'
        ? t('batchWizard.step1.textMethodMask')
        : t('batchWizard.step1.textMethodStructured');
  const imageMethodLabel =
    imageRedactionMethod === 'blur'
      ? t('batchWizard.step1.imageMethodBlur')
      : imageRedactionMethod === 'fill'
        ? t('batchWizard.step1.imageMethodFill')
        : t('batchWizard.step1.imageMethodMosaic');
  const imageMethodHint =
    imageRedactionMethod === 'blur'
      ? t('batchWizard.step1.imageMethodBlurHint')
      : imageRedactionMethod === 'fill'
        ? t('batchWizard.step1.imageMethodFillHint')
        : t('batchWizard.step1.imageMethodMosaicHint');
  const imageDetailPills =
    imageRedactionMethod === 'fill'
      ? [
          `${t('batchWizard.step1.currentImageMethod')}${imageMethodLabel}`,
          `${t('batchWizard.step1.currentImageColor')}${imageFillColor.toUpperCase()}`,
        ]
      : [
          `${t('batchWizard.step1.currentImageMethod')}${imageMethodLabel}`,
          `${t('batchWizard.step1.currentImageStrength')}${imageRedactionStrength}%`,
        ];
  const textPreviewGroups: PreviewGroup[] = [
    {
      title: t('batchWizard.step1.contextTextRange'),
      items: textTypes
        .filter((type) => !type.regex_pattern)
        .map((type) => ({
          id: type.id,
          name: type.name,
          selected: cfg.selectedEntityTypeIds.includes(type.id),
        })),
      emptyLabel: t('batchWizard.step1.noTextSelection'),
      onToggle: (id, selected) =>
        setCfg((current) => ({
          ...current,
          presetTextId: null,
          selectedEntityTypeIds: selected
            ? Array.from(new Set([...current.selectedEntityTypeIds, id]))
            : current.selectedEntityTypeIds.filter((itemId) => itemId !== id),
        })),
    },
    {
      title: t('batchWizard.step1.fixedTextRange'),
      items: textTypes
        .filter((type) => Boolean(type.regex_pattern))
        .map((type) => ({
          id: type.id,
          name: type.name,
          selected: cfg.selectedEntityTypeIds.includes(type.id),
        })),
      emptyLabel: t('batchWizard.step1.noTextSelection'),
      onToggle: (id, selected) =>
        setCfg((current) => ({
          ...current,
          presetTextId: null,
          selectedEntityTypeIds: selected
            ? Array.from(new Set([...current.selectedEntityTypeIds, id]))
            : current.selectedEntityTypeIds.filter((itemId) => itemId !== id),
        })),
    },
  ];
  const imagePreviewGroups: PreviewGroup[] = [
    {
      title: t('batchWizard.step1.ocrTypes'),
      items: ocrTypes.map((type) => ({
        id: type.id,
        name: type.name,
        selected: cfg.ocrHasTypes.includes(type.id),
        disabled: !type.enabled,
      })),
      emptyLabel: t('batchWizard.step1.noVisionSelection'),
      onToggle: (id, selected) =>
        setCfg((current) => ({
          ...current,
          presetVisionId: null,
          ocrHasTypes: selected
            ? Array.from(new Set([...current.ocrHasTypes, id]))
            : current.ocrHasTypes.filter((itemId) => itemId !== id),
        })),
    },
    {
      title: t('batchWizard.step1.visualFeatureTypes'),
      items: visualFeatureTypes.map((type) => ({
        id: type.id,
        name: type.name,
        selected: (cfg.visualFeatureTypes ?? []).includes(type.id),
        disabled: !type.enabled,
      })),
      emptyLabel: t('batchWizard.step1.noVisionSelection'),
      onToggle: (id, selected) =>
        setCfg((current) => ({
          ...current,
          presetVisionId: null,
          visualFeatureTypes: selected
            ? Array.from(new Set([...(current.visualFeatureTypes ?? []), id]))
            : (current.visualFeatureTypes ?? []).filter((itemId) => itemId !== id),
        })),
    },
  ];

  if (!configLoaded) {
    return (
      <Card
        className="rounded-[24px] border-border/70 shadow-[var(--shadow-control)]"
        data-testid="batch-step1-loading"
      >
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{t('batchWizard.step1.loadingConfig')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="batch-step1-config-card page-surface flex-1 overflow-hidden rounded-[24px] border-border/70 shadow-[var(--shadow-control)]"
      data-testid="batch-step1-config"
    >
      <CardHeader className="flex shrink-0 flex-col gap-0.5 border-b border-border/70 px-3 pb-2 pt-2.5">
        <CardTitle className="text-base tracking-[-0.03em]">
          {t('batchWizard.step1.title')}
        </CardTitle>
        {jobConfigLocked && (
          <p className="text-xs font-medium text-[var(--warning-foreground)]" data-testid="step1-config-locked">
            {t('batchWizard.step1.lockedHint')}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pt-2">
        {presetLoadError && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-3 py-2 text-xs text-[var(--warning-foreground)]"
            data-testid="batch-preset-load-error"
          >
            <span>{presetLoadError}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 bg-white/70 text-xs"
              disabled={presetReloading}
              onClick={() => void retryLoadPresets()}
              data-testid="retry-presets"
            >
              {presetReloading
                ? t('batchWizard.step1.retryPresetsLoading')
                : t('batchWizard.step1.retryPresets')}
            </Button>
          </div>
        )}

        <BatchStep1PresetCards
          mode={mode}
          cfg={cfg}
          setCfg={setCfg}
          disabled={jobConfigLocked}
          textPresets={textPresets}
          visionPresets={visionPresets}
          onBatchTextPresetChange={onBatchTextPresetChange}
          onBatchVisionPresetChange={onBatchVisionPresetChange}
          textRedactionMode={textRedactionMode}
          textModeLabel={textModeLabel}
          imageRedactionMethod={imageRedactionMethod}
          imageMethodLabel={imageMethodLabel}
          imageMethodHint={imageMethodHint}
          imageRedactionStrength={imageRedactionStrength}
          imageFillColor={imageFillColor}
          defaultTextSummary={defaultTextSummary}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <BatchStep1PreviewCards
            mode={mode}
            textPreviewGroups={textPreviewGroups}
            imagePreviewGroups={imagePreviewGroups}
            textPresetName={textPresetName}
            visionPresetName={visionPresetName}
            textModeLabel={textModeLabel}
            imageDetailPills={imageDetailPills}
            previewDialog={previewDialog}
            setPreviewDialog={setPreviewDialog}
            disabled={jobConfigLocked}
          />
        </div>
      </CardContent>

      <BatchStep1Footer
        confirmStep1={confirmStep1}
        setConfirmStep1={setConfirmStep1}
        isStep1Complete={isStep1Complete}
        configLocked={jobConfigLocked}
        advanceToUploadStep={advanceToUploadStep}
      />
    </Card>
  );
}

export const BatchStep1Config = memo(BatchStep1ConfigInner);
