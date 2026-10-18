'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, Building2, LogOut, Menu, Search, X } from 'lucide-react';
import { api, ApiFailure, useResource } from '@/lib/api/client';
import type { Actor } from '@/lib/types/hub';
import { Button, ErrorNotice, Loading } from '@/components/ui/primitives';
import {
  FlashMessage,
  NavigationGuard,
  useNavigationGuard,
} from '@/components/ui/navigation-guard';
import { useSubmission } from '@/lib/utils/form-state';
const ActorContext = createContext<Actor | null>(null);
export function useActor() {
  const actor = useContext(ActorContext);
  if (!actor) throw new Error('Actor context unavailable');
  return actor;
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <NavigationGuard>
      <ShellContent>{children}</ShellContent>
    </NavigationGuard>
  );
}
function ShellContent({ children }: { children: ReactNode }) {
  const guard = useNavigationGuard();
  const sidebar = useRef<HTMLElement>(null);
  const { data: actor, loading, error, reload } = useResource<Actor>('/auth/me');
  const [open, setOpen] = useState(false);
  const { busy, begin, end } = useSubmission();
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (error instanceof ApiFailure && error.status === 401) router.replace('/login');
  }, [error, router]);
  useEffect(() => {
    if (!open || !sidebar.current) return;
    const trigger = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(sidebar.current!.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
    controls()[0]?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === 'Tab') {
        const elements = controls(),
          first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  async function logout() {
    if (!begin()) return;
    try {
      await api('/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch (e) {
      setLogoutError(e);
      end();
    }
  }
  if (loading)
    return (
      <main className="p-6">
        <Loading />
      </main>
    );
  if (error || !actor)
    return (
      <main className="p-6">
        <ErrorNotice error={error} retry={reload} />
      </main>
    );
  return (
    <ActorContext.Provider value={actor}>
      <div className="app-shell">
        {open && (
          <button
            className="mobile-backdrop"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          ref={sidebar}
          role={open ? 'dialog' : undefined}
          aria-modal={open || undefined}
          aria-label={open ? 'Navigation' : undefined}
          className={'sidebar ' + (open ? 'sidebar-open' : '')}
        >
          <div className="brand">
            <Image
              src="/agency-os-logo.png"
              alt="Agency OS — Agency Operating System"
              width={1774}
              height={887}
              priority
            />
            <button
              className="mobile-only"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p className="nav-label">Client operations</p>
          <nav aria-label="Main navigation">
            <Link href="/client-hub" className="nav-active">
              <Building2 size={18} aria-hidden="true" />
              Clients
            </Link>
          </nav>
          <div className="sidebar-foot">
            <p className="font-medium text-ink">Agency OS</p>
            <p>Client operating hub</p>
          </div>
        </aside>
        <div className="app-body" inert={open || undefined}>
          <header className="topbar">
            <button
              className="mobile-only"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="topbar-title">Client operating hub</span>
            <form action="/client-hub" className="global-search">
              <Search size={16} aria-hidden="true" />
              <input name="q" aria-label="Search clients" placeholder="Search clients…" />
            </form>
            <span
              className="notification-state"
              title="Shared notifications are not connected"
              aria-label="Shared notifications are not connected"
            >
              <Bell size={18} />
            </span>
            <div className="user-summary">
              <span>{actor.displayName}</span>
              <small>{actor.role}</small>
            </div>
            <Button
              variant="ghost"
              onClick={() => guard.confirm(() => void logout())}
              disabled={busy}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </Button>
          </header>
          <main id="main-content" className="main-content">
            <FlashMessage />
            <ErrorNotice error={logoutError} />
            {children}
          </main>
        </div>
      </div>
    </ActorContext.Provider>
  );
}
