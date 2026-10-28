// Copyright 2026 DataInfra-RedactionEverything Contributors

import { memo } from 'react';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RecognitionPreset } from '@/services/presetsApi';
import type { BatchWizardMode, BatchWizardPersistedConfig } from '@/services/batchPipeline';

const DEFAULT_PRESET_VALUE = '__default__';

export interface BatchStep1PresetCardsProps {
  mode: BatchWizardMode;
  cfg: BatchWizardPersistedConfig;
  setCfg: React.Dispatch<React.SetStateAction<BatchWizardPersistedConfig>>;
  disabled?: boolean;
  textPresets: RecognitionPreset[];
  visionPresets: RecognitionPreset[];
  onBatchTextPresetChange: (id: string) => void;
  onBatchVisionPresetChange: (id: string) => void;
  textRedactionMode: string;
  textModeLabel: string;
  imageRedactionMethod: string;
  imageMethodLabel: string;
  imageMethodHint: string;
  imageRedactionStrength: number;
  imageFillColor: string;
  defaultTextSummary: string;
}

function BatchStep1PresetCardsInner({
  mode,
  cfg,
  setCfg,
  disabled = false,
  textPresets,
  visionPresets,
  onBatchTextPresetChange,
  onBatchVisionPresetChange,
  textRedactionMode,
  textModeLabel,
  imageRedactionMethod,
  imageMethodLabel,
  imageMethodHint,
  imageRedactionStrength,
  imageFillColor,
  defaultTextSummary,
}: BatchStep1PresetCardsProps) {
  const t = useT();
  const showTextConfig = mode !== 'image';
  const showVisionConfig = mode !== 'text';

  const textModeBullets = [
    { key: 'structured', label: t('batchWizard.step1.textModeBulletStructured') },
    { key: 'smart', label: t('batchWizard.step1.textModeBulletSmart') },
    { key: 'mask', label: t('batchWizard.step1.textModeBulletMask') },
  ];

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div
        className={cn(
          'grid shrink-0 gap-2',
          showTextConfig && showVisionConfig && 'xl:grid-cols-2',
        )}
      >
        {showTextConfig && (
          <Card
            className="min-h-0 rounded-xl border-border/70 !bg-white shadow-[var(--shadow-sm)]"
            data-testid="step1-text-config-card"
          >
            <CardContent className="flex h-full flex-col gap-1.5 p-2.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="truncate text-sm font-semibold">
                  {t('batchWizard.step1.textPreset')}
                </span>
              </div>
              <Select
                disabled={disabled}
                value={cfg.presetTextId || DEFAULT_PRESET_VALUE}
                onValueChange={(value) =>
                  onBatchTextPresetChange(value === DEFAULT_PRESET_VALUE ? '' : value)
                }
              >
                <SelectTrigger className="text-xs" data-testid="text-preset-select">
                  <SelectValue placeholder={t('batchWizard.step1.defaultPreset')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_PRESET_VALUE}>
                    {t('batchWizard.step1.defaultPreset')}
                  </SelectItem>
                  {textPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.kind === 'full' ? ` (${t('batchWizard.step1.comboPreset')})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!cfg.presetTextId && (
                <p className="rounded-lg border border-border/70 !bg-white px-2.5 py-1.5 text-[11px] leading-4 text-muted-foreground">
                  {defaultTextSummary}
                </p>
              )}
              <div className="flex flex-col gap-1 rounded-xl border border-border/70 !bg-white px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t('batchWizard.step1.textRedactionMode')}
                  </p>
                  <span className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                    {textModeLabel}
                  </span>
                </div>
                <Select
                  disabled={disabled}
                  value={textRedactionMode}
                  onValueChange={(value: 'structured' | 'smart' | 'mask') =>
                    setCfg((current) => ({ ...current, replacementMode: value }))
                  }
                >
                  <SelectTrigger className="text-xs" data-testid="text-redaction-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="structured">
                      {t('batchWizard.step1.textMethodStructured')}
                    </SelectItem>
                    <SelectItem value="smart">{t('batchWizard.step1.textMethodSmart')}</SelectItem>
                    <SelectItem value="mask">{t('batchWizard.step1.textMethodMask')}</SelectItem>
                  </SelectContent>
                </Select>
                <ul className="mt-1.5 space-y-1 overflow-hidden">
                  {textModeBullets.map((bullet) => (
                    <li
                      key={bullet.key}
                      className={cn(
                        'flex items-center gap-1.5 text-[11px] leading-4',
                        bullet.key === textRedactionMode
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <span className="inline-block size-1 shrink-0 rounded-full bg-current" />
                      <span className="truncate">{bullet.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {showVisionConfig && (
          <Card
            className="min-h-0 rounded-xl border-border/70 !bg-white shadow-[var(--shadow-sm)]"
            data-testid="step1-vision-config-card"
          >
            <CardContent className="flex h-full flex-col gap-1.5 p-2.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--selection-visual-accent)]" />
                <span className="truncate text-sm font-semibold">
                  {t('batchWizard.step1.imagePreset')}
                </span>
              </div>
              <Select
                disabled={disabled}
                value={cfg.presetVisionId || DEFAULT_PRESET_VALUE}
                onValueChange={(value) =>
                  onBatchVisionPresetChange(value === DEFAULT_PRESET_VALUE ? '' : value)
                }
              >
                <SelectTrigger className="text-xs" data-testid="vision-preset-select">
                  <SelectValue placeholder={t('batchWizard.step1.defaultPreset')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_PRESET_VALUE}>
                    {t('batchWizard.step1.defaultPreset')}
                  </SelectItem>
                  {visionPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.kind === 'full' ? ` (${t('batchWizard.step1.comboPreset')})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-1 rounded-xl border border-border/70 !bg-white px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t('batchWizard.step1.imageRedactionMode')}
                  </p>
                  <span className="shrink-0 rounded-full border border-border/70 !bg-white px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                    {imageMethodLabel}
                  </span>
                </div>
                <p
                  className="truncate text-[11px] leading-4 text-muted-foreground"
                  title={imageMethodHint}
                >
                  {imageMethodHint}
                </p>
                <Select
                  disabled={disabled}
                  value={imageRedactionMethod}
                  onValueChange={(value: 'mosaic' | 'blur' | 'fill') =>
                    setCfg((current) => ({ ...current, imageRedactionMethod: value }))
                  }
                >
                  <SelectTrigger className="text-xs" data-testid="image-redaction-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mosaic">
                      {t('batchWizard.step1.imageMethodMosaic')}
                    </SelectItem>
                    <SelectItem value="blur">{t('batchWizard.step1.imageMethodBlur')}</SelectItem>
                    <SelectItem value="fill">{t('batchWizard.step1.imageMethodFill')}</SelectItem>
                  </SelectContent>
                </Select>

                {imageRedactionMethod === 'fill' ? (
                  <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_6rem]">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t('batchWizard.step1.imageFillColorLabel')}
                      </p>
                      <div className="flex items-center gap-2 rounded-2xl border border-border/70 !bg-white px-2.5 py-1.5">
                        <input
                          type="color"
                          value={imageFillColor}
                          disabled={disabled}
                          onChange={(event) =>
                            setCfg((current) => ({
                              ...current,
                              imageFillColor: event.target.value,
                            }))
                          }
                          className="size-6 rounded-md border-0 bg-transparent p-0"
                          data-testid="image-redaction-color"
                        />
                        <span className="text-xs font-medium text-foreground">
                          {imageFillColor.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t('batchWizard.step1.previewSwatch')}
                      </p>
                      <div
                        className="h-[2rem] rounded-2xl border border-border/70"
                        style={{ backgroundColor: imageFillColor }}
                        aria-hidden
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t('batchWizard.step1.imageStrengthLabel')}
                      </p>
                      <span className="rounded-full border border-border/70 !bg-white px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                        {imageRedactionStrength}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={imageRedactionStrength}
                      disabled={disabled}
                      onChange={(event) =>
                        setCfg((current) => ({
                          ...current,
                          imageRedactionStrength: Number(event.target.value),
                        }))
                      }
                      className="w-full accent-primary"
                      data-testid="image-redaction-strength"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t('batchWizard.step1.watermarkLabel')}
                  </p>
                  <input
                    type="text"
                    maxLength={64}
                    value={cfg.watermarkText ?? ''}
                    disabled={disabled}
                    placeholder={t('batchWizard.step1.watermarkPlaceholder')}
                    onChange={(event) =>
                      setCfg((current) => ({ ...current, watermarkText: event.target.value }))
                    }
                    className="h-8 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    data-testid="batch-watermark-input"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export const BatchStep1PresetCards = memo(BatchStep1PresetCardsInner);
