import { BACKUP_KEY, STORAGE_KEY, type LedgerState } from './ledger';

const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // The storage event keeps other open tabs in sync.
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === STORAGE_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function readRaw(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export const readServerRaw = () => null;

export function writeState(state: LedgerState, unreadableRaw?: string | null) {
  try {
    if (unreadableRaw) window.localStorage.setItem(BACKUP_KEY, unreadableRaw);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error('This browser could not save your ledger. Storage may be full or disabled.');
  }
  listeners.forEach(listener => listener());
}
