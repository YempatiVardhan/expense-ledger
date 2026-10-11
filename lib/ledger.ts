import { z } from 'zod';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_BOOK_NAME = 'My expenses';

export type Book = { id: string; name: string; createdAt: string };
export type Expense = { id: string; name: string; amount: number; currency: Currency; date: string; time: string; timezone: string; location: string; recordedAt: string };
export type NewExpense = Omit<Expense, 'id'>;
export class LedgerError extends Error {}

export const idSchema = z.uuid();
export const MIN_DATE = '2000-01-01';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001),
  currency: z.enum(CURRENCIES),
  timezone: z.string().max(100),
  location: z.string().trim().max(250).default(''),
  date: z.string().optional(),
  time: z.string().optional(),
});

function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return timezone; } catch { return 'UTC'; }
}

const isRealDate = (date: string) => DATE_PATTERN.test(date) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
export const localDate = (now: Date, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const localTime = (now: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);

// Date and time are optional; when omitted they are taken from the server clock in the user's timezone.
export function createExpense(input: unknown, now = new Date()): NewExpense {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new LedgerError('Enter a name and a positive amount with up to two decimals.');
  const { name, amount, currency, location } = result.data;
  const timezone = validTimezone(result.data.timezone);
  const today = localDate(now, timezone);
  const date = result.data.date || today;
  if (!isRealDate(date) || date < MIN_DATE || date > today) throw new LedgerError(`Choose a date between ${MIN_DATE} and today.`);
  const time = result.data.time || localTime(now, timezone);
  if (!TIME_PATTERN.test(time)) throw new LedgerError('Enter a valid time.');
  return { name, amount, currency, location, timezone, date, time: time.length === 5 ? `${time}:00` : time, recordedAt: now.toISOString() };
}

export function bookName(name: unknown) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > 100) throw new LedgerError('Enter a ledger name (1–100 characters).');
  return trimmed;
}

// Newest expense date first; entries on the same date and time keep entry order.
export const compareExpenses = (a: Expense, b: Expense) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.recordedAt.localeCompare(a.recordedAt);

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
