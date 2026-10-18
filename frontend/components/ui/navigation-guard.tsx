'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from './confirm-dialog';
import { Button, Notice } from './primitives';
type Guard = {
  register: (id: string, dirty: boolean) => void;
  confirm: (action: () => void) => void;
  flash: (message: string) => void;
  message: string;
  dismiss: () => void;
};
const Context = createContext<Guard | null>(null);
export function NavigationGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const drafts = useRef(new Set<string>());
  const [pending, setPending] = useState<{ action: () => void } | null>(null);
  const [message, setMessage] = useState('');
  const register = useCallback((id: string, dirty: boolean) => {
    if (dirty) drafts.current.add(id);
    else drafts.current.delete(id);
  }, []);
  const confirm = useCallback((action: () => void) => {
    if (drafts.current.size) setPending({ action });
    else action();
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (drafts.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const click = (event: MouseEvent) => {
      if (
        !drafts.current.size ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin) return; // Native beforeunload handles external navigation.
      if (target.pathname === location.pathname && target.search === location.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      confirm(() => router.push(target.pathname + target.search + target.hash));
    };
    // Track positions without storing any form content in browser history.
    let index = Number(history.state?.__hubIndex ?? 0);
    let restoring = false;
    const push = history.pushState;
    const replace = history.replaceState;
    const withIndex = (data: unknown, value: number) => ({
      ...(data && typeof data === 'object' ? data : {}),
      __hubIndex: value,
    });
    replace.call(history, withIndex(history.state, index), '', location.href);
    const wrappedPush: History['pushState'] = (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      index++;
      push.call(history, withIndex(data, index), unused, url);
    };
    const wrappedReplace: History['replaceState'] = (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => replace.call(history, withIndex(data, index), unused, url);
    history.pushState = wrappedPush;
    history.replaceState = wrappedReplace;
    const pop = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const value = Number(event.state?.__hubIndex);
      const target = Number.isFinite(value) ? value : index - 1;
      if (drafts.current.size) {
        event.stopImmediatePropagation();
        const distance = index - target || 1;
        restoring = true;
        history.go(distance);
        setPending({ action: () => history.go(-distance) });
      } else index = target;
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    window.addEventListener('popstate', pop, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', pop, true);
      if (history.pushState === wrappedPush) history.pushState = push;
      if (history.replaceState === wrappedReplace) history.replaceState = replace;
    };
  }, [confirm, router]);
  const value = useMemo(
    () => ({ register, confirm, flash: setMessage, message, dismiss: () => setMessage('') }),
    [register, confirm, message],
  );
  return (
    <Context.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(pending)}
        title="Discard unsaved changes?"
        confirmLabel="Discard changes"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending?.action;
          drafts.current.clear();
          setPending(null);
          action?.();
        }}
      >
        Your changes have not been saved. Keep editing to retain them, or discard them to continue.
      </ConfirmDialog>
    </Context.Provider>
  );
}
export function useNavigationGuard() {
  const value = useContext(Context);
  if (!value) throw new Error('Navigation guard unavailable');
  return value;
}
export function FlashMessage() {
  const { message, dismiss } = useNavigationGuard();
  if (!message) return null;
  return (
    <div className="flash-message">
      <Notice>
        {message}{' '}
        <Button variant="ghost" aria-label="Dismiss notification" onClick={dismiss}>
          Dismiss
        </Button>
      </Notice>
    </div>
  );
}
export function useDraft() {
  const { register, confirm } = useNavigationGuard();
  const id = useId();
  const [dirty, setDirty] = useState(false);
  useEffect(() => () => register(id, false), [register, id]);
  const markDirty = () => {
    register(id, true);
    setDirty(true);
  };
  const markSaved = () => {
    register(id, false);
    setDirty(false);
  };
  return {
    dirty,
    markDirty,
    markSaved,
    discard: (action: () => void) =>
      confirm(() => {
        markSaved();
        action();
      }),
  };
}
