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
    if (url === '/api/ledgers') {
      if (method === 'GET') return Response.json({ books: store.books });
      const book = { id: `b${store.books.length + 1}`, name: body.name, createdAt: '2026-10-11T00:00:00.000Z' };
      store.books.unshift(book); store.expenses[book.id] = [];
      return Response.json({ book }, { status: 201 });
    }
    const id = decodeURIComponent(url.split('/')[3]);
    if (url.startsWith('/api/geocode')) return Response.json({ area: 'Koramangala, Bengaluru' });
    if (method === 'GET') return Response.json({ expenses: store.expenses[id] });
    const expense = { id: `e${Math.random()}`, date: '2026-10-11', time: '10:05:20', recordedAt: '2026-10-11T04:35:20.000Z', ...body } as Expense;
    store.expenses[id].unshift(expense);
    return Response.json({ expense }, { status: 201 });
  });
}

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
    store.books = [{ id: 'b9', name: 'Team trip', createdAt: '' }];
    store.expenses.b9 = [{ id: 'e1', name: 'Taxi', amount: 300, currency: 'INR', date: '2026-10-10', time: '09:00:00', timezone: 'Asia/Kolkata', location: 'Indiranagar, Bengaluru', recordedAt: '' }];
    render(<Ledger />);
    expect(await screen.findByRole('heading', { name: 'Taxi' })).toBeTruthy();
    expect(screen.getByText(/Indiranagar, Bengaluru/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Team trip' })).toBeTruthy();
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
    await waitFor(() => expect((screen.getByLabelText(/Location/) as HTMLInputElement).value).toBe('Koramangala, Bengaluru'));
    expect(requests.some(r => r.url === '/api/geocode?lat=12.9352719&lon=77.6245123')).toBe(true);
  });

  it('shows API errors', async () => {
    vi.stubGlobal('fetch', fakeApi('/api/ledgers'));
    render(<Ledger />);
    await waitFor(() => expect(screen.getAllByRole('alert').some(a => a.textContent?.includes('not configured'))).toBe(true));
  });
});
