// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useLocation } from 'react-router-dom';
import { useT } from '@/i18n';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function AppHeader() {
  const t = useT();
  const location = useLocation();

  const { title, sub } = getPageHeader(location.pathname, t);

  return (
    <header className="flex h-16 shrink-0 items-center border-b border-border/70 bg-card px-4 shadow-[var(--shadow-sm)] backdrop-blur-2xl sm:px-6 lg:px-9">
      <div className="flex min-h-[40px] min-w-0 flex-1 items-center gap-3">
        <SidebarTrigger className="lg:hidden" aria-label={t('layout.toggleSidebar')} />
        <div
          className="flex min-w-0 flex-col justify-center"
          aria-label={sub ? `${title} - ${sub}` : title}
        >
          <div className="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </div>
        </div>
      </div>
    </header>
  );
}

function getPageHeader(
  pathname: string,
  t: (key: string) => string,
): { title: string; sub?: string } {
  if (pathname === '/') return { title: t('page.start.title'), sub: t('page.start.sub') };
  if (pathname === '/profile') return { title: t('auth.userCenter') };
  if (pathname === '/batch' || pathname.startsWith('/batch/'))
    return { title: t('page.batch.title'), sub: t('page.batch.sub') };
  if (pathname.startsWith('/structured'))
    return { title: t('page.structured.title'), sub: t('page.structured.sub') };
  if (pathname === '/dicom') return { title: t('page.dicom.title'), sub: t('page.dicom.sub') };
  if (pathname.startsWith('/settings/redaction'))
    return {
      title: `${t('nav.group.config')} / ${t('nav.redactionList')}`,
      sub: t('page.redactionList.sub'),
    };
  if (pathname === '/settings')
    return {
      title: `${t('nav.group.config')} / ${t('nav.recognitionSettings')}`,
      sub: t('page.config.sub'),
    };
  if (pathname.startsWith('/settings/system')) {
    const section = pathname.split('/')[3] || 'users';
    const sectionTitleKey =
      {
        users: 'nav.userManagement',
        roles: 'nav.roleManagement',
        monitoring: 'nav.serviceMonitoring',
        license: 'nav.license',
        runtime: 'nav.runtimeConfig',
        audit: 'nav.operationLog',
        access: 'nav.userManagement',
      }[section] || 'nav.userManagement';
    return {
      title: `${t('nav.systemManagement')} / ${t(sectionTitleKey)}`,
      sub: t('nav.systemSettings.sub'),
    };
  }
  if (pathname.startsWith('/jobs/'))
    return { title: t('page.jobDetail.title'), sub: t('page.jobDetail.sub') };
  if (pathname === '/jobs') return { title: t('page.jobs.title'), sub: t('page.jobs.sub') };

  const map: Record<string, { title: string; sub?: string }> = {
    '/single': { title: t('playground.title'), sub: t('page.playground.sub') },
    '/playground': { title: t('playground.title'), sub: t('page.playground.sub') },
    '/history': { title: t('page.history.title'), sub: t('page.history.sub') },
    '/model-settings/text': { title: t('page.textModel.title'), sub: t('page.textModel.sub') },
    '/model-settings/vision': {
      title: t('page.visionModel.title'),
      sub: t('page.visionModel.sub'),
    },
  };

  return map[pathname] || { title: t('nav.playground') };
}
