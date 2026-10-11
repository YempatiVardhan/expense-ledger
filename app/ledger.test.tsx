import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Ledger from './ledger';
import type { Book, Expense } from '@/lib/ledger';

type Store = { books: Book[]; expenses: Record<string, Expense[]> };
let store: Store, requests: { method: string; url: string; body?: Record<string, unknown> }[];

function fakeApi(fail?: string) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url, body });
    if (fail && url.startsWith(fail)) return Response.json({ error: 'The database is not configured yet.' }, { status: 503 });
    if (url.startsWith('/api/geocode')) return Response.json({ area: 'Saidabad, Hyderabad' });
    const [, , , rawId, , rawExpenseId] = url.split('/');
    const id = rawId && decodeURIComponent(rawId), expenseId = rawExpenseId && decodeURIComponent(rawExpenseId);
    if (!id) {
      if (method === 'GET') return Response.json({ books: store.books });
      const book = { id: `b${store.books.length + 1}`, name: body.name, createdAt: '2026-10-11T00:00:00.000Z' };
      store.books.unshift(book); store.expenses[book.id] = [];
      return Response.json({ book }, { status: 201 });
    }
    if (!url.includes('/expenses')) {
      if (method === 'DELETE') { store.books = store.books.filter(b => b.id !== id); delete store.expenses[id]; return new Response(null, { status: 204 }); }
      const book = store.books.find(b => b.id === id)!; book.name = body.name;
      return Response.json({ book });
    }
    if (expenseId) {
      if (method === 'DELETE') { store.expenses[id] = store.expenses[id].filter(e => e.id !== expenseId); return new Response(null, { status: 204 }); }
      const index = store.expenses[id].findIndex(e => e.id === expenseId);
      store.expenses[id][index] = { ...store.expenses[id][index], ...body, time: `${body.time}:00` };
      return Response.json({ expense: store.expenses[id][index] });
    }
    if (method === 'GET') return Response.json({ expenses: store.expenses[id] });
    const expense = { id: `e${Math.random()}`, date: '2026-10-11', time: '10:05:20', recordedAt: '2026-10-11T04:35:20.000Z', ...body } as Expense;
    if (body.time) expense.time = `${body.time}:00`;
    store.expenses[id].unshift(expense);
    return Response.json({ expense }, { status: 201 });
  });
}

const taxi: Expense = { id: 'e1', name: 'Taxi', amount: 300, currency: 'INR', date: '2026-10-10', time: '09:00:00', timezone: 'Asia/Kolkata', location: 'Saidabad, Hyderabad', recordedAt: '2026-10-10T03:30:00.000Z' };
function seed() { store.books = [{ id: 'b9', name: 'Team trip', createdAt: '' }]; store.expenses.b9 = [{ ...taxi }]; }

function fillExpense(name: string, amount: string) {
  fireEvent.change(screen.getByLabelText('What did you spend on?'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } });
}
const saveButton = () => screen.getByRole('button', { name: /save expense/i });

describe('Ledger', () => {
  beforeEach(() => {
    store = { books: [], expenses: {} }; requests = [];
    vi.stubGlobal('fetch', fakeApi());
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('creates a default ledger on first save and shows the expense', async () => {
    render(<Ledger />);
    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
    fillExpense('Coffee', '120.50');
    fireEvent.click(saveButton());
    expect(await screen.findByRole('heading', { name: 'Coffee' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Expense saved.');
    expect(store.books.map(b => b.name)).toEqual(['My expenses']);
    expect(requests.find(r => r.method === 'POST' && r.url.endsWith('/expenses'))?.body).toMatchObject({ name: 'Coffee', amount: 120.5, currency: 'INR' });
  });

  it('shows ledgers created by anyone and their expenses', async () => {
    seed();
    render(<Ledger />);
    expect(await screen.findByRole('heading', { name: 'Taxi' })).toBeTruthy();
    expect(screen.getByText(/Saidabad, Hyderabad/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Team trip' })).toBeTruthy();
  });

  it('saves an expense with a manual date and time', async () => {
    render(<Ledger />);
    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
    fillExpense('Rent', '15000');
    fireEvent.click(screen.getByRole('button', { name: /set date manually/i }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:30' } });
    fireEvent.click(saveButton());
    await screen.findByRole('heading', { name: 'Rent' });
    expect(requests.find(r => r.method === 'POST' && r.url.endsWith('/expenses'))?.body).toMatchObject({ date: '2026-10-01', time: '09:30' });
    expect(screen.getByText(/2026-10-01 · 09:30/)).toBeTruthy();
  });

  it('sends no date when automatic', async () => {
    render(<Ledger />);
    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
    fillExpense('Tea', '20');
    fireEvent.click(saveButton());
    await screen.findByRole('heading', { name: 'Tea' });
    const body = requests.find(r => r.method === 'POST' && r.url.endsWith('/expenses'))?.body;
    expect(body).not.toHaveProperty('date');
    expect(body).not.toHaveProperty('time');
  });

  it('edits an expense', async () => {
    seed();
    render(<Ledger />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Taxi' }));
    expect(screen.getByRole('heading', { name: 'Edit expense' })).toBeTruthy();
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-10');
    fireEvent.change(screen.getByLabelText('What did you spend on?'), { target: { value: 'Airport taxi' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '450' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('heading', { name: 'Airport taxi' })).toBeTruthy();
    expect(requests.find(r => r.method === 'PATCH')).toMatchObject({ url: '/api/ledgers/b9/expenses/e1', body: { name: 'Airport taxi', amount: 450, date: '2026-10-10', time: '09:00' } });
    expect(store.expenses.b9[0]).toMatchObject({ name: 'Airport taxi', amount: 450 });
    expect(screen.getByRole('heading', { name: 'A new expense' })).toBeTruthy();
  });

  it('cancels editing without saving', async () => {
    seed();
    render(<Ledger />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Taxi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'A new expense' })).toBeTruthy();
    expect((screen.getByLabelText('What did you spend on?') as HTMLInputElement).value).toBe('');
    expect(requests.some(r => r.method === 'PATCH')).toBe(false);
  });

  it('deletes an expense only after confirmation', async () => {
    seed();
    render(<Ledger />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Taxi' }));
    expect(requests.some(r => r.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Keep expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Taxi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Taxi' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Taxi' })).toBeNull());
    expect(store.expenses.b9).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('Expense deleted.');
  });

  it('renames a ledger', async () => {
    seed();
    render(<Ledger />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename ledger' }));
    fireEvent.change(screen.getByLabelText('Ledger name'), { target: { value: 'Hyderabad trip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Hyderabad trip' })).toBeTruthy();
    expect(store.books[0].name).toBe('Hyderabad trip');
  });

  it('deletes a ledger after confirmation', async () => {
    seed();
    store.books.push({ id: 'b8', name: 'Other', createdAt: '' }); store.expenses.b8 = [];
    render(<Ledger />);
    await screen.findByRole('heading', { name: 'Taxi' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete ledger' }));
    expect(screen.getByText(/Delete “Team trip” and its 1 expense\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete ledger' }));
    expect(await screen.findByRole('heading', { name: 'Other' })).toBeTruthy();
    expect(store.books.map(b => b.id)).toEqual(['b8']);
    expect(requests.find(r => r.method === 'DELETE')?.url).toBe('/api/ledgers/b9');
  });

  it('creates and switches to a new ledger', async () => {
    store.books = [{ id: 'b0', name: 'Old', createdAt: '' }]; store.expenses.b0 = [];
    render(<Ledger />);
    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /create a new ledger/i }));
    fireEvent.change(screen.getByLabelText('New ledger name'), { target: { value: 'Trip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ledger' }));
    await waitFor(() => expect((screen.getByLabelText('Save to') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Trip'));
    fillExpense('Train', '5');
    fireEvent.click(saveButton());
    await screen.findByRole('heading', { name: 'Train' });
    expect(store.expenses[store.books[0].id].map(e => e.name)).toEqual(['Train']);
    expect(store.expenses.b0).toEqual([]);
  });

  it('fills the location with the area name instead of coordinates', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 12.9352719, longitude: 77.6245123 } } as GeolocationPosition) } });
    render(<Ledger />);
    fireEvent.click(screen.getByRole('button', { name: 'Use current area' }));
    await waitFor(() => expect((screen.getByLabelText(/Location/) as HTMLInputElement).value).toBe('Saidabad, Hyderabad'));
    expect(requests.some(r => r.url === '/api/geocode?lat=12.9352719&lon=77.6245123')).toBe(true);
  });

  it('shows API errors', async () => {
    vi.stubGlobal('fetch', fakeApi('/api/ledgers'));
    render(<Ledger />);
    await waitFor(() => expect(screen.getAllByRole('alert').some(a => a.textContent?.includes('not configured'))).toBe(true));
  });
});
