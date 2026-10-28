// Copyright 2026 DataInfra-RedactionEverything Contributors

import type { FC } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Upload } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { usePlayground } from '../hooks/use-playground';

type PlaygroundCtx = ReturnType<typeof usePlayground>;

interface PlaygroundUploadDropzoneProps {
  dropzone: PlaygroundCtx['dropzone'];
  disabled?: boolean;
  disabledReason?: string;
  uploadIssue?: string | null;
}

export const PlaygroundUploadDropzone: FC<PlaygroundUploadDropzoneProps> = ({
  dropzone,
  disabled = false,
  disabledReason,
  uploadIssue,
}) => {
  const t = useT();
  const { getRootProps, getInputProps, isDragActive, open } = dropzone;
  const handleOpenClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) {
      e.preventDefault();
      return;
    }
    open();
  };
  const handleRootKeyDown = (e: KeyboardEvent) => {
    if (!disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
      <div className="flex h-full w-full flex-col items-center text-center">
        <div
          {...getRootProps({
            onClick: handleOpenClick,
            onKeyDown: handleRootKeyDown,
            tabIndex: disabled ? -1 : 0,
          })}
          aria-label={disabledReason || t('playground.dropHere')}
          aria-disabled={disabled}
          className={cn(
            'saas-hero group relative min-h-[18rem] w-full flex-1 cursor-pointer border-2 border-dashed p-7 text-center transition-all duration-300 ease-out lg:min-h-[20rem] lg:px-10 2xl:min-h-[22rem] 2xl:p-9 2xl:px-12',
            isDragActive
              ? 'border-primary bg-primary/[0.04] ring-4 ring-primary/10'
              : 'border-border hover:border-foreground/15 hover:shadow-lg',
            disabled && 'cursor-not-allowed opacity-65 hover:border-border hover:shadow-none',
          )}
          data-testid="playground-dropzone"
        >
          <input {...getInputProps({ 'aria-label': t('playground.dropHere'), disabled })} />
          <div className="flex h-full flex-col items-center justify-center">
            <Upload
              className={cn(
                'mb-4 size-8 text-primary transition-transform duration-300 group-hover:scale-110',
                isDragActive && 'scale-110 animate-pulse',
              )}
              aria-hidden="true"
            />
            <p className="mb-1.5 text-lg font-semibold tracking-[-0.02em]">
              {t('playground.dropHere')}
            </p>
            <p className="text-sm text-muted-foreground">{t('playground.supportedFormats')}</p>
            {uploadIssue && (
              <div
                className="mb-4 max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
                role="alert"
                data-testid="playground-upload-issue"
              >
                {uploadIssue}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
