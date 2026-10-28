// Copyright 2026 DataInfra-RedactionEverything Contributors

import { Navigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { AdminRuntimePanel } from './panels/runtime-panel';
import { AdminAccessPanel, AdminRolesPanel, AdminUsersPanel } from './panels/access-panel';
import { AdminAuditPanel } from './panels/audit-panel';
import { AdminLicensePanel } from './panels/license-panel';
import { AdminMonitoringPanel } from './panels/monitoring-panel';

const SYSTEM_PANELS = {
  users: AdminUsersPanel,
  roles: AdminRolesPanel,
  monitoring: AdminMonitoringPanel,
  license: AdminLicensePanel,
  runtime: AdminRuntimePanel,
  audit: AdminAuditPanel,
  access: AdminAccessPanel,
} as const;

type SystemPanelKey = keyof typeof SYSTEM_PANELS;

export function SystemSettings() {
  const { status } = useAuth();
  const { section } = useParams<{ section?: string }>();

  if (!status?.is_super_admin) {
    return (
      <div className="saas-page flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="page-shell !max-w-[min(100%,1920px)] !px-3 !py-2 sm:!px-4 sm:!py-3">
          <Alert variant="destructive">
            <AlertDescription>需要管理员权限。</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!section) {
    return <Navigate to="/settings/system/users" replace />;
  }

  const Panel = SYSTEM_PANELS[section as SystemPanelKey];
  if (!Panel) {
    return <Navigate to="/settings/system/users" replace />;
  }

  return (
    <div className="saas-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="page-shell !max-w-[min(100%,1920px)] !px-3 !py-3 sm:!px-4 sm:!py-4">
        <Panel />
      </div>
    </div>
  );
}
