// Copyright 2026 DataInfra-RedactionEverything Contributors

import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ChevronDown,
  ClipboardList,
  Database,
  FileClock,
  Globe,
  KeyRound,
  ListChecks,
  Power,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  UserRound,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { useI18n, useT } from '@/i18n';
import { BRAND, brandName } from '@/config/brand';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import {
  HomeIcon,
  PlayIcon,
  BatchIcon,
  HistoryIcon,
  JobsCenterIcon,
} from '@/components/shared/nav-icons';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface NavItem {
  path: string;
  label: string;
  sublabel?: string;
  icon: React.FC<{ className?: string }>;
  end?: boolean;
  children?: NavItem[];
  testId?: string;
}

export function AppSidebar() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = Boolean(status?.is_super_admin);
  const showProfileCenter = Boolean(status?.auth_enabled && status.authenticated);
  const username = status?.username?.trim() || t('auth.adminNameFallback');
  const roleLabel = status?.is_super_admin
    ? t('auth.superAdminRole')
    : status?.role?.trim() || t('auth.userRole');
  const userInitial = username.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!profileOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  const navItems: NavItem[] = [
    { path: '/', label: t('nav.start'), sublabel: t('nav.start.sub'), icon: HomeIcon, end: true },
    {
      path: '/single',
      label: t('nav.playground'),
      sublabel: t('nav.playground.sub'),
      icon: PlayIcon,
      end: true,
    },
    { path: '/batch', label: t('nav.batch'), sublabel: t('nav.batch.sub'), icon: BatchIcon },
    {
      path: '/structured',
      label: t('nav.structured'),
      sublabel: t('nav.structured.sub'),
      icon: Database,
    },
    { path: '/jobs', label: t('nav.jobs'), sublabel: t('nav.jobs.sub'), icon: JobsCenterIcon },
    { path: '/history', label: t('nav.history'), sublabel: t('nav.history.sub'), icon: HistoryIcon },
    {
      path: '/settings',
      label: t('nav.group.config'),
      icon: SlidersHorizontal,
      testId: 'config',
      children: [
        {
          path: '/settings',
          label: t('nav.recognitionSettings'),
          sublabel: t('nav.recognitionSettings.sub'),
          icon: ListChecks,
          end: true,
        },
        {
          path: '/settings/redaction',
          label: t('nav.redactionList'),
          sublabel: t('nav.redactionList.sub'),
          icon: ClipboardList,
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            path: '/settings/system/users',
            label: t('nav.systemManagement'),
            sublabel: t('nav.systemSettings.sub'),
            icon: Settings,
            children: [
              {
                path: '/settings/system/users',
                label: t('nav.userManagement'),
                icon: UsersRound,
              },
              {
                path: '/settings/system/roles',
                label: t('nav.roleManagement'),
                icon: KeyRound,
              },
              {
                path: '/settings/system/monitoring',
                label: t('nav.serviceMonitoring'),
                icon: Activity,
              },
              {
                path: '/settings/system/license',
                label: t('nav.license'),
                icon: ShieldCheck,
              },
              {
                path: '/settings/system/runtime',
                label: t('nav.runtimeConfig'),
                icon: Wrench,
              },
              {
                path: '/settings/system/audit',
                label: t('nav.operationLog'),
                icon: FileClock,
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader className="h-16 flex-row items-center gap-3 border-b border-sidebar-border px-4">
        <img
          src={BRAND.logoUrl}
          alt=""
          className="size-7 shrink-0 rounded-lg shadow-[var(--shadow-sm)]"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold leading-tight tracking-tight text-sidebar-foreground">
            {brandName(t)}
          </span>
        </div>
        <button
          type="button"
          className="flex h-9 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-2 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/15"
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          aria-label={t('layout.languageSwitch')}
          title={locale === 'zh' ? t('layout.switchToEnglish') : t('layout.switchToChinese')}
          data-testid="lang-toggle"
        >
          <Globe className="size-3" />
          <span>{locale === 'zh' ? 'EN' : '中'}</span>
        </button>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 py-1.5">
        <nav aria-label={t('layout.navLabel')}>
          <SidebarGroup className="px-2 py-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {navItems.map((item) => (
                  <SidebarNavItem key={item.path} item={item} pathname={location.pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      {showProfileCenter && (
        <div ref={profileRef} className="relative border-t border-sidebar-border bg-sidebar px-3 py-3">
          {profileOpen && (
            <div
              className="absolute bottom-[calc(100%+0.75rem)] left-3 right-3 overflow-hidden rounded-2xl border border-sidebar-border bg-popover text-popover-foreground shadow-[var(--shadow-floating)]"
              role="menu"
              aria-label={t('auth.userCenter')}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 border-b border-sidebar-border/70 bg-sidebar-accent/55 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/profile');
                }}
                role="menuitem"
                aria-label={t('auth.userCenter')}
                title={t('auth.userCenter')}
                data-testid="profile-center-btn"
              >
                <UserRound className="size-4 shrink-0" />
                <span>{t('auth.userCenter')}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                onClick={() => {
                  setProfileOpen(false);
                  void logout();
                }}
                role="menuitem"
                aria-label={t('auth.logout')}
              >
                <Power className="size-4 shrink-0" />
                <span>{t('auth.logout')}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-all duration-150',
              'hover:border-sidebar-border hover:bg-sidebar-accent hover:shadow-[var(--shadow-control)]',
              profileOpen && 'border-sidebar-border bg-sidebar-accent shadow-[var(--shadow-control)]',
            )}
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            data-testid="sidebar-user-center"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--shadow-control)]">
              {userInitial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight text-sidebar-foreground">
                {username}
              </span>
              <span className="mt-1 block truncate text-xs leading-tight text-sidebar-foreground/55">
                {roleLabel}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-sidebar-foreground/55 transition-transform',
                profileOpen && 'rotate-180',
              )}
            />
          </button>

        </div>
      )}
    </Sidebar>
  );
}

function SidebarNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavActive(item, pathname);
  const showChildren = active && item.children && item.children.length > 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={cn(
          'min-h-10 rounded-2xl border border-transparent px-3 py-2 transition-all duration-150',
          active &&
            'border-sidebar-border bg-sidebar-accent font-medium text-sidebar-foreground shadow-[var(--shadow-control)]',
        )}
      >
        <NavLink
          to={item.path}
          end={item.end}
          aria-label={item.sublabel ? `${item.label} - ${item.sublabel}` : item.label}
          data-testid={`nav-${item.testId ?? (item.path.replace(/\//g, '-').replace(/^-/, '') || 'start')}`}
        >
          <item.icon className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate text-xs font-medium leading-tight">{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
      {showChildren ? (
        <div className="mt-0.5 grid gap-0.5 pl-5">
          {item.children?.map((child) => (
            <SidebarSubNavItem key={child.path} item={child} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </SidebarMenuItem>
  );
}

function SidebarSubNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavActive(item, pathname);
  return (
    <NavLink
      to={item.path}
      className={cn(
        'grid min-h-9 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-transparent px-2.5 py-1.5 text-sidebar-foreground/70 transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        active &&
          'border-sidebar-border bg-sidebar-accent text-sidebar-foreground shadow-[var(--shadow-control)]',
      )}
      aria-label={item.sublabel ? `${item.label} - ${item.sublabel}` : item.label}
      data-testid={`nav-${item.path.replace(/\//g, '-').replace(/^-/, '')}`}
    >
      <item.icon className="size-3 opacity-65" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{item.label}</span>
        {item.sublabel ? <span className="sr-only">{item.sublabel}</span> : null}
      </span>
    </NavLink>
  );
}

function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.children?.some((child) => isNavActive(child, pathname))) {
    return true;
  }
  if (item.path === '/settings') {
    return pathname === '/settings' || pathname.startsWith('/model-settings');
  }
  if (item.end) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(item.path + '/');
}
