// Copyright 2026 DataInfra-RedactionEverything Contributors

import { Link, Navigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { useBatchWizard } from './hooks/use-batch-wizard';
import { BatchWizardProvider } from './batch-wizard-context';
import { BatchStepProgress } from './components/batch-step-progress';
import { BatchStep1Config } from './components/batch-step1-config';
import { BatchStep2Upload } from './components/batch-step2-upload';
import { BatchStep3Recognize } from './components/batch-step3-recognize';
import { BatchStep4Review } from './components/batch-step4-review';
import { BatchStep5Export } from './components/batch-step5-export';

export function BatchWizard() {
  const t = useT();
  const w = useBatchWizard();

  if (!w.modeValid) {
    return <Navigate to="/batch" replace />;
  }

  const msgVariant =
    w.msg?.tone === 'ok'
      ? ('default' as const)
      : w.msg?.tone === 'err' || w.msg?.tone === 'warn'
        ? ('destructive' as const)
        : ('default' as const);

  return (
    <BatchWizardProvider value={w}>
      <div
        className="flex min-h-full min-w-0 flex-col bg-background"
        data-testid="batch-wizard"
      >
        <div
          className={cn(
            'batch-wizard-shell flex min-w-0 flex-1 flex-col',
            w.step === 1
              ? 'page-shell-narrow !max-w-[108rem] !pt-2 2xl:!max-w-[118rem] 2xl:!pt-3'
              : w.step === 4
                ? 'page-shell !pt-2 2xl:!pt-3'
                : 'page-shell-narrow !max-w-[112rem] !pt-2 2xl:!max-w-[122rem] 2xl:!pt-3',
          )}
        >
          <header className="flex flex-none flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="truncate text-2xl font-semibold tracking-tight text-foreground"
                title={w.activeJobTitle || undefined}
              >
                {w.activeJobTitle || (w.previewMode ? '预览任务' : '文档图片处理任务')}
              </h1>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/batch">
                <ChevronLeft className="size-4" />
                {t('jobDetail.backToList')}
              </Link>
            </Button>
          </header>

          {w.previewMode && (
            <Alert className="mb-3" data-testid="batch-preview-alert">
              <AlertDescription>{t('batchWizard.previewBanner')}</AlertDescription>
            </Alert>
          )}

          <BatchStepProgress currentStep={w.step} canGoStep={w.canGoStep} goStep={w.goStep} />

          {w.msg && (
            <Alert variant={msgVariant} className="mb-2">
              <AlertDescription>{w.msg.text}</AlertDescription>
            </Alert>
          )}

          {w.step === 1 && <BatchStep1Config />}

          {w.step === 2 && (
            <BatchStep2Upload
              mode={w.mode}
              activeJobId={w.activeJobId}
              rows={w.rows}
              loading={w.loading}
              isDragActive={w.isDragActive}
              getRootProps={w.getRootProps}
              getInputProps={w.getInputProps}
              uploadIssues={w.uploadIssues}
              uploadProgress={w.uploadProgress}
              clearUploadIssues={w.clearUploadIssues}
              failedUploadCount={w.failedUploadCount}
              retryFailedUploads={w.retryFailedUploads}
              goStep={w.goStep}
              removeRow={w.removeRow}
              clearRows={w.clearRows}
              onInboxImported={() => void w.refreshRowsFromActiveJob()}
            />
          )}

          {w.step === 3 && (
            <BatchStep3Recognize
              mode={w.mode}
              rows={w.rows}
              activeJobId={w.activeJobId}
              failedRows={w.failedRows}
              goStep={w.goStep}
              submitQueueToWorker={w.submitQueueToWorker}
              requeueFailedItems={w.requeueFailedItems}
            />
          )}

          {w.step === 4 && <BatchStep4Review />}

          {w.step === 5 && (
            <BatchStep5Export
              activeJobId={w.activeJobId}
              rows={w.rows}
              selected={w.selected}
              selectedIds={w.selectedIds}
              zipLoading={w.zipLoading}
              toggle={w.toggle}
              selectReadyForDelivery={w.selectReadyForDelivery}
              resolveExportIssue={w.resolveExportIssue}
              goStep={w.goStep}
              downloadZip={w.downloadZip}
            />
          )}
        </div>
      </div>
    </BatchWizardProvider>
  );
}
