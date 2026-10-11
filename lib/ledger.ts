import { z } from 'zod';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const STORAGE_KEY = 'pocket-ledger:v1';
export const BACKUP_KEY = 'pocket-ledger:v1:unreadable-backup';
export const DEFAULT_BOOK_NAME = 'My expenses';

const expenseSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  amount: z.number().positive().max(999999999),
  currency: z.enum(CURRENCIES),
  date: z.string().max(20),
  time: z.string().max(20),
  timezone: z.string().max(100),
  location: z.string().max(250),
  recordedAt: z.string().max(40),
});
const bookSchema = z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(100), createdAt: z.string().max(40), expenses: z.array(expenseSchema) });
const stateSchema = z.object({ version: z.literal(1), books: z.array(bookSchema) });
const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001),
  currency: z.enum(CURRENCIES),
  timezone: z.string().max(100),
  location: z.string().trim().max(250).default(''),
});

export type Expense = z.infer<typeof expenseSchema>;
export type Book = z.infer<typeof bookSchema>;
export type LedgerState = z.infer<typeof stateSchema>;
export class LedgerError extends Error {}

export const emptyState = (): LedgerState => ({ version: 1, books: [] });

export function parseState(raw: string | null): { state: LedgerState; unreadable: boolean } {
  if (raw === null) return { state: emptyState(), unreadable: false };
  try {
    const result = stateSchema.safeParse(JSON.parse(raw));
    if (result.success) return { state: result.data, unreadable: false };
  } catch {}
  return { state: emptyState(), unreadable: true };
}

function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return timezone; } catch { return 'UTC'; }
}

export function createExpense(input: unknown, now = new Date(), id: string = crypto.randomUUID()): Expense {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new LedgerError('Enter a name and a positive amount with up to two decimals.');
  const { name, amount, currency, location } = result.data;
  const timezone = validTimezone(result.data.timezone);
  return {
    id, name, amount, currency, location, timezone,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now),
    recordedAt: now.toISOString(),
  };
}

export function createBook(name: string, now = new Date(), id: string = crypto.randomUUID()): Book {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new LedgerError('Enter a ledger name (1–100 characters).');
  return { id, name: trimmed, createdAt: now.toISOString(), expenses: [] };
}

export const addBook = (state: LedgerState, book: Book): LedgerState => ({ ...state, books: [book, ...state.books] });

export function addExpense(state: LedgerState, bookId: string, expense: Expense): LedgerState {
  if (!state.books.some(b => b.id === bookId)) throw new LedgerError('Choose a ledger first.');
  return { ...state, books: state.books.map(b => (b.id === bookId ? { ...b, expenses: [expense, ...b.expenses] } : b)) };
}

export const removeExpense = (state: LedgerState, bookId: string, expenseId: string): LedgerState => ({
  ...state,
  books: state.books.map(b => (b.id === bookId ? { ...b, expenses: b.expenses.filter(e => e.id !== expenseId) } : b)),
});

export const totalFor = (expenses: Expense[], currency: Currency) => expenses.filter(e => e.currency === currency).reduce((sum, e) => sum + e.amount, 0);

// Prefixing cells that spreadsheet apps would evaluate as formulas prevents CSV injection.
function csvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(book: Book) {
  const header = ['ID', 'Expense', 'Amount', 'Currency', 'Date', 'Time', 'Timezone', 'Location', 'Recorded at (UTC)'];
  const rows = [...book.expenses].reverse().map(e => [e.id, e.name, e.amount, e.currency, e.date, e.time, e.timezone, e.location, e.recordedAt]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const csvFileName = (book: Book) => `${book.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'ledger'}.csv`;
