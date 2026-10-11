import { z } from 'zod';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_BOOK_NAME = 'My expenses';

export type Book = { id: string; name: string; createdAt: string };
export type Expense = { id: string; name: string; amount: number; currency: Currency; date: string; time: string; timezone: string; location: string; recordedAt: string };
export type NewExpense = Omit<Expense, 'id'>;
export class LedgerError extends Error {}

export const idSchema = z.uuid();
const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001),
  currency: z.enum(CURRENCIES),
  timezone: z.string().max(100),
  location: z.string().trim().max(250).default(''),
});

function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return timezone; } catch { return 'UTC'; }
}

export function createExpense(input: unknown, now = new Date()): NewExpense {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new LedgerError('Enter a name and a positive amount with up to two decimals.');
  const { name, amount, currency, location } = result.data;
  const timezone = validTimezone(result.data.timezone);
  return {
    name, amount, currency, location, timezone,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now),
    recordedAt: now.toISOString(),
  };
}

export function bookName(name: unknown) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > 100) throw new LedgerError('Enter a ledger name (1–100 characters).');
  return trimmed;
}

export const totalFor = (expenses: Expense[], currency: Currency) => expenses.filter(e => e.currency === currency).reduce((sum, e) => sum + e.amount, 0);

// Prefixing cells that spreadsheet apps would evaluate as formulas prevents CSV injection.
function csvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(expenses: Expense[]) {
  const header = ['ID', 'Expense', 'Amount', 'Currency', 'Date', 'Time', 'Timezone', 'Location', 'Recorded at (UTC)'];
  const rows = [...expenses].reverse().map(e => [e.id, e.name, e.amount, e.currency, e.date, e.time, e.timezone, e.location, e.recordedAt]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const csvFileName = (book: Pick<Book, 'name'>) => `${book.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'ledger'}.csv`;
