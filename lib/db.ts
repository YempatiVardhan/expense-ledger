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

export async function bookExists(id: string) {
  const { data, error } = await db().from('ledgers').select('id').eq('id', id).maybeSingle();
  if (error) { console.error('Database request failed', error); throw new ApiError('The database could not complete the request. Try again.', 502); }
  return data !== null;
}

export async function listExpenses(bookId: string) {
  return check<ExpenseRow[]>(await db().from('expenses').select(EXPENSE_COLUMNS).eq('ledger_id', bookId).order('recorded_at', { ascending: false }).limit(1000)).map(toExpense);
}

export async function insertExpense(bookId: string, expense: NewExpense) {
  const { recordedAt, ...rest } = expense;
  return toExpense(check<ExpenseRow>(await db().from('expenses').insert({ ...rest, ledger_id: bookId, recorded_at: recordedAt }).select(EXPENSE_COLUMNS).single()));
}
