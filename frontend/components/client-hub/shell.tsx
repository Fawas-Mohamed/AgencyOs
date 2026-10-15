'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, Building2, LogOut, Menu, Search, X } from 'lucide-react';
import { api, ApiFailure, useResource } from '@/lib/api/client';
import type { Actor } from '@/lib/types/hub';
import { Button, ErrorNotice, Loading } from '@/components/ui/primitives';
const ActorContext = createContext<Actor | null>(null);
export function useActor() {
  const actor = useContext(ActorContext);
  if (!actor) throw new Error('Actor context unavailable');
  return actor;
}
export function Shell({ children }: { children: ReactNode }) {
  const { data: actor, loading, error, reload } = useResource<Actor>('/auth/me');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (error instanceof ApiFailure && error.status === 401) router.replace('/login');
  }, [error, router]);
  async function logout() {
    setBusy(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch (e) {
      setLogoutError(e);
      setBusy(false);
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
        <aside className={'sidebar ' + (open ? 'sidebar-open' : '')}>
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
        <div className="app-body">
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
            <Button variant="ghost" onClick={logout} disabled={busy} aria-label="Sign out">
              <LogOut size={18} />
            </Button>
          </header>
          <main id="main-content" className="main-content">
            <ErrorNotice error={logoutError} />
            {children}
          </main>
        </div>
      </div>
    </ActorContext.Provider>
  );
}
