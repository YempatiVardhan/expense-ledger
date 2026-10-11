// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ listBooks: vi.fn(), insertBook: vi.fn(), bookExists: vi.fn(), updateBook: vi.fn(), deleteBook: vi.fn(), listExpenses: vi.fn(), insertExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn() }));
vi.mock('@/lib/geocode', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/geocode')>()), reverseGeocode: vi.fn() }));

const db = await import('@/lib/db');
const { reverseGeocode } = await import('@/lib/geocode');
const { ApiError } = await import('@/lib/http');
const ledgers = await import('./ledgers/route');
const expenses = await import('./ledgers/[id]/expenses/route');
const geocode = await import('./geocode/route');
const ledger = await import('./ledgers/[id]/route');
const expense = await import('./ledgers/[id]/expenses/[expenseId]/route');

const ORIGIN = 'https://ledger.test';
const LEDGER_ID = '3f1c0a1e-8b7a-4c1e-9f0a-2b3c4d5e6f70';
const book = { id: LEDGER_ID, name: 'Trip', createdAt: '2026-10-11T00:00:00.000Z' };
const EXPENSE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const send = (method: string, path: string, body?: unknown, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
const post = (path: string, body: unknown, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const expenseContext = (id: string, expenseId: string) => ({ params: Promise.resolve({ id, expenseId }) });
const expenseBody = { name: 'Coffee', amount: 120.5, currency: 'INR', timezone: 'Asia/Kolkata', location: 'Saidabad, Hyderabad' };

beforeEach(() => vi.clearAllMocks());

describe('/api/ledgers', () => {
  it('lists ledgers', async () => {
    vi.mocked(db.listBooks).mockResolvedValue([book]);
    const response = await ledgers.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ books: [book] });
  });

  it('creates a ledger with a trimmed name', async () => {
    vi.mocked(db.insertBook).mockResolvedValue(book);
    const response = await ledgers.POST(post('/api/ledgers', { name: '  Trip ' }));
    expect(response.status).toBe(201);
    expect(db.insertBook).toHaveBeenCalledWith('Trip');
  });

  it.each([
    ['cross-origin request', post('/api/ledgers', { name: 'Trip' }, 'https://evil.test'), 403],
    ['missing origin', post('/api/ledgers', { name: 'Trip' }, null), 403],
    ['invalid JSON', post('/api/ledgers', '{nope'), 400],
    ['empty name', post('/api/ledgers', { name: ' ' }), 400],
    ['null body', post('/api/ledgers', 'null'), 400],
  ])('rejects %s', async (_label, request, status) => {
    const response = await ledgers.POST(request);
    expect(response.status).toBe(status);
    expect(db.insertBook).not.toHaveBeenCalled();
  });

  it('reports configuration errors without leaking internals', async () => {
    vi.mocked(db.listBooks).mockRejectedValue(new ApiError('The database is not configured yet.', 503));
    const response = await ledgers.GET();
    expect(response.status).toBe(503);
    vi.mocked(db.listBooks).mockRejectedValue(new Error('connection string postgres://secret'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hidden = await ledgers.GET();
    expect(hidden.status).toBe(500);
    expect(JSON.stringify(await hidden.json())).not.toContain('secret');
    consoleError.mockRestore();
  });
});

describe('/api/ledgers/[id]/expenses', () => {
  it('lists expenses for a ledger', async () => {
    vi.mocked(db.listExpenses).mockResolvedValue([]);
    const response = await expenses.GET(new Request(`${ORIGIN}/api/ledgers/${LEDGER_ID}/expenses`), context(LEDGER_ID));
    expect(response.status).toBe(200);
    expect(db.listExpenses).toHaveBeenCalledWith(LEDGER_ID);
  });

  it('returns 404 for a malformed id without querying', async () => {
    const response = await expenses.GET(new Request(`${ORIGIN}/api/ledgers/x/expenses`), context('not-a-uuid'));
    expect(response.status).toBe(404);
    expect(db.listExpenses).not.toHaveBeenCalled();
  });

  it('saves a manual date', async () => {
    vi.mocked(db.bookExists).mockResolvedValue(true);
    vi.mocked(db.insertExpense).mockImplementation(async (_id, fields) => ({ id: 'e1', ...fields }));
    expect((await expenses.POST(post(`/api/ledgers/${LEDGER_ID}/expenses`, { ...expenseBody, date: '2026-03-04', time: '12:15' }), context(LEDGER_ID))).status).toBe(201);
    expect(vi.mocked(db.insertExpense).mock.calls[0][1]).toMatchObject({ date: '2026-03-04', time: '12:15:00' });
  });

  it('saves a server-timestamped expense', async () => {
    vi.mocked(db.bookExists).mockResolvedValue(true);
    vi.mocked(db.insertExpense).mockImplementation(async (_id, expense) => ({ id: 'e1', ...expense }));
    const response = await expenses.POST(post(`/api/ledgers/${LEDGER_ID}/expenses`, { ...expenseBody, recordedAt: '2000-01-01T00:00:00.000Z' }), context(LEDGER_ID));
    expect(response.status).toBe(201);
    const [, saved] = vi.mocked(db.insertExpense).mock.calls[0];
    expect(saved).toMatchObject({ name: 'Coffee', amount: 120.5, location: 'Saidabad, Hyderabad' });
    expect(Math.abs(Date.parse(saved.recordedAt) - Date.now())).toBeLessThan(5000);
  });

  it('rejects invalid expenses, unknown ledgers and cross-origin writes', async () => {
    expect((await expenses.POST(post(`/api/ledgers/${LEDGER_ID}/expenses`, { ...expenseBody, amount: -1 }), context(LEDGER_ID))).status).toBe(400);
    expect((await expenses.POST(post(`/api/ledgers/${LEDGER_ID}/expenses`, expenseBody, 'https://evil.test'), context(LEDGER_ID))).status).toBe(403);
    vi.mocked(db.bookExists).mockResolvedValue(false);
    expect((await expenses.POST(post(`/api/ledgers/${LEDGER_ID}/expenses`, expenseBody), context(LEDGER_ID))).status).toBe(404);
    expect(db.insertExpense).not.toHaveBeenCalled();
  });
});

describe('/api/ledgers/[id]', () => {
  it('renames a ledger', async () => {
    vi.mocked(db.updateBook).mockResolvedValue({ ...book, name: 'Goa trip' });
    const response = await ledger.PATCH(send('PATCH', `/api/ledgers/${LEDGER_ID}`, { name: ' Goa trip ' }), context(LEDGER_ID));
    expect(response.status).toBe(200);
    expect(db.updateBook).toHaveBeenCalledWith(LEDGER_ID, 'Goa trip');
  });

  it('rejects invalid renames', async () => {
    expect((await ledger.PATCH(send('PATCH', `/api/ledgers/${LEDGER_ID}`, { name: '' }), context(LEDGER_ID))).status).toBe(400);
    expect((await ledger.PATCH(send('PATCH', `/api/ledgers/${LEDGER_ID}`, { name: 'x' }, 'https://evil.test'), context(LEDGER_ID))).status).toBe(403);
    expect((await ledger.PATCH(send('PATCH', '/api/ledgers/nope', { name: 'x' }), context('nope'))).status).toBe(404);
    expect(db.updateBook).not.toHaveBeenCalled();
    vi.mocked(db.updateBook).mockResolvedValue(null);
    expect((await ledger.PATCH(send('PATCH', `/api/ledgers/${LEDGER_ID}`, { name: 'x' }), context(LEDGER_ID))).status).toBe(404);
  });

  it('deletes a ledger', async () => {
    vi.mocked(db.deleteBook).mockResolvedValue(true);
    expect((await ledger.DELETE(send('DELETE', `/api/ledgers/${LEDGER_ID}`), context(LEDGER_ID))).status).toBe(204);
    expect(db.deleteBook).toHaveBeenCalledWith(LEDGER_ID);
    vi.mocked(db.deleteBook).mockResolvedValue(false);
    expect((await ledger.DELETE(send('DELETE', `/api/ledgers/${LEDGER_ID}`), context(LEDGER_ID))).status).toBe(404);
  });

  it('refuses cross-origin deletes', async () => {
    expect((await ledger.DELETE(send('DELETE', `/api/ledgers/${LEDGER_ID}`, undefined, 'https://evil.test'), context(LEDGER_ID))).status).toBe(403);
    expect((await ledger.DELETE(send('DELETE', `/api/ledgers/${LEDGER_ID}`, undefined, null), context(LEDGER_ID))).status).toBe(403);
    expect(db.deleteBook).not.toHaveBeenCalled();
  });
});

describe('/api/ledgers/[id]/expenses/[expenseId]', () => {
  const path = `/api/ledgers/${LEDGER_ID}/expenses/${EXPENSE_ID}`;

  it('updates an expense including a manual date', async () => {
    vi.mocked(db.updateExpense).mockImplementation(async (_book, id, fields) => ({ id, ...fields }));
    const response = await expense.PATCH(send('PATCH', path, { ...expenseBody, date: '2026-01-15', time: '08:30' }), expenseContext(LEDGER_ID, EXPENSE_ID));
    expect(response.status).toBe(200);
    expect(db.updateExpense).toHaveBeenCalledWith(LEDGER_ID, EXPENSE_ID, expect.objectContaining({ date: '2026-01-15', time: '08:30:00', name: 'Coffee' }));
  });

  it('rejects invalid updates and missing expenses', async () => {
    expect((await expense.PATCH(send('PATCH', path, { ...expenseBody, date: '2999-01-01' }), expenseContext(LEDGER_ID, EXPENSE_ID))).status).toBe(400);
    expect((await expense.PATCH(send('PATCH', path, expenseBody, 'https://evil.test'), expenseContext(LEDGER_ID, EXPENSE_ID))).status).toBe(403);
    expect((await expense.PATCH(send('PATCH', path, expenseBody), expenseContext(LEDGER_ID, 'bad'))).status).toBe(404);
    expect(db.updateExpense).not.toHaveBeenCalled();
    vi.mocked(db.updateExpense).mockResolvedValue(null);
    expect((await expense.PATCH(send('PATCH', path, expenseBody), expenseContext(LEDGER_ID, EXPENSE_ID))).status).toBe(404);
  });

  it('deletes an expense scoped to its ledger', async () => {
    vi.mocked(db.deleteExpense).mockResolvedValue(true);
    expect((await expense.DELETE(send('DELETE', path), expenseContext(LEDGER_ID, EXPENSE_ID))).status).toBe(204);
    expect(db.deleteExpense).toHaveBeenCalledWith(LEDGER_ID, EXPENSE_ID);
    vi.mocked(db.deleteExpense).mockResolvedValue(false);
    expect((await expense.DELETE(send('DELETE', path), expenseContext(LEDGER_ID, EXPENSE_ID))).status).toBe(404);
    expect((await expense.DELETE(send('DELETE', path, undefined, 'https://evil.test'), expenseContext(LEDGER_ID, EXPENSE_ID))).status).toBe(403);
  });
});

describe('/api/geocode', () => {
  it('returns the area name', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue('Saidabad, Hyderabad');
    const response = await geocode.GET(new Request(`${ORIGIN}/api/geocode?lat=12.93&lon=77.62`));
    expect(await response.json()).toEqual({ area: 'Saidabad, Hyderabad' });
    expect(reverseGeocode).toHaveBeenCalledWith(12.93, 77.62);
  });

  it('rejects invalid coordinates and reports lookup failures', async () => {
    expect((await geocode.GET(new Request(`${ORIGIN}/api/geocode?lat=100&lon=0`))).status).toBe(400);
    expect(reverseGeocode).not.toHaveBeenCalled();
    vi.mocked(reverseGeocode).mockRejectedValue(new Error('timeout'));
    expect((await geocode.GET(new Request(`${ORIGIN}/api/geocode?lat=1&lon=1`))).status).toBe(502);
  });
});
