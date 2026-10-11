import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http';
import type { Book, Currency, Expense, NewExpense } from './ledger';

type BookRow = { id: string; name: string; created_at: string };
type ExpenseRow = { id: string; name: string; amount: number | string; currency: Currency; date: string; time: string; timezone: string; location: string; recorded_at: string };
const BOOK_COLUMNS = 'id,name,created_at';
const EXPENSE_COLUMNS = 'id,name,amount,currency,date,time,timezone,location,recorded_at';

let client: SupabaseClient | null = null;

// Publishable/anon keys cannot reach the tables (RLS has no policies), so reject them with a clear message.
export function isPublicKey(key: string) {
  if (key.startsWith('sb_publishable_')) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role === 'anon'; } catch { return false; }
}

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError('The database is not configured yet. Add SUPABASE_URL and SUPABASE_SECRET_KEY.', 503);
  if (isPublicKey(key)) throw new ApiError('SUPABASE_SECRET_KEY must be the secret (service role) key, not the publishable key.', 503);
  return (client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) {
    console.error('Database request failed', result.error);
    throw new ApiError('The database could not complete the request. Try again.', 502);
  }
  return result.data;
}

const toBook = (row: BookRow): Book => ({ id: row.id, name: row.name, createdAt: row.created_at });
const toExpense = (row: ExpenseRow): Expense => ({ id: row.id, name: row.name, amount: Number(row.amount), currency: row.currency, date: row.date, time: row.time, timezone: row.timezone, location: row.location, recordedAt: row.recorded_at });

export async function listBooks() {
  return check<BookRow[]>(await db().from('ledgers').select(BOOK_COLUMNS).order('created_at', { ascending: false }).limit(500)).map(toBook);
}

export async function insertBook(name: string) {
  return toBook(check<BookRow>(await db().from('ledgers').insert({ name }).select(BOOK_COLUMNS).single()));
}

// Like check(), but a missing row is a valid result (null) rather than an error.
function checkOptional<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) {
    console.error('Database request failed', result.error);
    throw new ApiError('The database could not complete the request. Try again.', 502);
  }
  return result.data;
}

export async function bookExists(id: string) {
  return checkOptional(await db().from('ledgers').select('id').eq('id', id).maybeSingle()) !== null;
}

export async function updateBook(id: string, name: string) {
  const row = checkOptional<BookRow>(await db().from('ledgers').update({ name }).eq('id', id).select(BOOK_COLUMNS).maybeSingle());
  return row && toBook(row);
}

// Expenses are removed by the ON DELETE CASCADE foreign key.
export async function deleteBook(id: string) {
  return check<{ id: string }[]>(await db().from('ledgers').delete().eq('id', id).select('id')).length > 0;
}

export async function listExpenses(bookId: string) {
  return check<ExpenseRow[]>(await db().from('expenses').select(EXPENSE_COLUMNS).eq('ledger_id', bookId).order('date', { ascending: false }).order('time', { ascending: false }).order('recorded_at', { ascending: false }).limit(1000)).map(toExpense);
}

export async function insertExpense(bookId: string, expense: NewExpense) {
  const { recordedAt, ...rest } = expense;
  return toExpense(check<ExpenseRow>(await db().from('expenses').insert({ ...rest, ledger_id: bookId, recorded_at: recordedAt }).select(EXPENSE_COLUMNS).single()));
}

// Updates keep the original recorded_at so it stays an audit of when the entry was first made.
export async function updateExpense(bookId: string, expenseId: string, expense: NewExpense) {
  const { name, amount, currency, date, time, timezone, location } = expense;
  const row = checkOptional<ExpenseRow>(await db().from('expenses').update({ name, amount, currency, date, time, timezone, location }).eq('id', expenseId).eq('ledger_id', bookId).select(EXPENSE_COLUMNS).maybeSingle());
  return row && toExpense(row);
}

export async function deleteExpense(bookId: string, expenseId: string) {
  return check<{ id: string }[]>(await db().from('expenses').delete().eq('id', expenseId).eq('ledger_id', bookId).select('id')).length > 0;
}
