// Copyright 2026 DataInfra-RedactionEverything Contributors

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import { type Step } from '../types';

interface BatchStepProgressProps {
  currentStep: Step;
  canGoStep: (s: Step) => boolean;
  goStep: (s: Step) => void;
}

export function BatchStepProgress({ currentStep, canGoStep, goStep }: BatchStepProgressProps) {
  const t = useT();
  const stepOrder: Step[] = [1, 2, 3, 4, 5];

  const labels: Record<Step, string> = {
    1: t('batchWizard.step1'),
    2: t('batchWizard.step2'),
    3: t('batchWizard.step3'),
    4: t('batchWizard.step4'),
    5: t('batchWizard.step5'),
  };

  return (
    <nav
      className={cn(
        'shrink-0 overflow-x-auto pb-1',
        currentStep === 4 ? 'mb-0.5' : 'mb-2',
      )}
      aria-label={t('batchWizard.stepsOverview')}
      data-testid="batch-step-progress"
    >
      <ol className="mx-auto flex min-w-[42rem] max-w-5xl items-start justify-between px-8 py-3">
        {stepOrder.map((stepNumber, i) => {
          const canVisit = canGoStep(stepNumber);
          // Steps behind the current one are display-only: the wizard flow must
          // not be re-entered backwards from the header (e.g. step 4 -> step 3).
          const isCompleted = stepNumber < currentStep;
          const isCurrent = currentStep === stepNumber;
          const isLocked = !canVisit && !isCompleted;
          const isIdle = canVisit && !isCurrent && !isCompleted;
          const title = isLocked ? t('batchWizard.stepLocked') : labels[stepNumber];
          return (
            <li key={stepNumber} className="relative flex flex-1 flex-col items-center gap-2">
              {i < stepOrder.length - 1 && (
                <span
                  className={cn(
                    'absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                    stepNumber < currentStep ? 'bg-primary' : 'bg-border',
                  )}
                  aria-hidden
                />
              )}
            <button
              type="button"
              className={cn(
                'relative z-10 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold tabular-nums select-none',
                'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isCurrent && 'border-primary bg-primary text-primary-foreground shadow-sm',
                isCompleted && 'cursor-default border-primary bg-primary text-primary-foreground',
                isIdle &&
                  'border-primary/70 bg-background text-primary hover:border-primary hover:bg-primary/5',
                isLocked && 'cursor-not-allowed border-border bg-white text-primary shadow-sm',
              )}
              aria-label={`${labels[stepNumber]} (${stepNumber}/${stepOrder.length})${isLocked ? ` - ${t('batchWizard.stepLocked')}` : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
              disabled={isCurrent || isLocked || isCompleted}
              title={title}
              onClick={() => goStep(stepNumber)}
              data-testid={`batch-step-${stepNumber}`}
            >
              {isCompleted ? <Check className="size-4" aria-hidden /> : stepNumber}
            </button>
              <span
                className={cn(
                  'relative z-10 max-w-28 truncate text-center text-sm font-medium leading-5',
                  (isCompleted || isCurrent || isIdle || isLocked) ? 'text-primary' : 'text-muted-foreground',
                )}
                title={labels[stepNumber]}
              >
                {labels[stepNumber]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
