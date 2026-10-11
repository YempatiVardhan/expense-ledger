import { describe, expect, it } from 'vitest';
import { addBook, addExpense, createBook, createExpense, csvFileName, emptyState, LedgerError, parseState, removeExpense, toCsv, totalFor, type Expense } from './ledger';

const now = new Date('2026-10-11T04:35:20.000Z');
const input = { name: 'Coffee', amount: 120.5, currency: 'INR', timezone: 'Asia/Kolkata', location: '' };
const expense = (overrides: Partial<Expense> = {}): Expense => ({ ...createExpense(input, now, 'e1'), ...overrides });

describe('createExpense', () => {
  it('stamps local date, time and UTC timestamp for the given timezone', () => {
    expect(createExpense({ ...input, name: '  Coffee  ', location: ' Cafe ' }, now, 'e1')).toEqual({
      id: 'e1', name: 'Coffee', amount: 120.5, currency: 'INR', date: '2026-10-11', time: '10:05:20', timezone: 'Asia/Kolkata', location: 'Cafe', recordedAt: '2026-10-11T04:35:20.000Z',
    });
  });

  it('falls back to UTC for an unknown timezone', () => {
    const result = createExpense({ ...input, timezone: 'Not/AZone' }, now, 'e1');
    expect(result).toMatchObject({ timezone: 'UTC', time: '04:35:20' });
  });

  it.each([
    ['empty name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(121) }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -5 }],
    ['three decimals', { amount: 1.234 }],
    ['NaN amount', { amount: Number('abc') }],
    ['unknown currency', { currency: 'JPY' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => createExpense({ ...input, ...overrides }, now)).toThrow(LedgerError);
  });
});

describe('createBook', () => {
  it('trims the name', () => {
    expect(createBook('  Trip  ', now, 'b1')).toEqual({ id: 'b1', name: 'Trip', createdAt: now.toISOString(), expenses: [] });
  });

  it.each(['', '   ', 'x'.repeat(101)])('rejects invalid name %j', name => {
    expect(() => createBook(name)).toThrow(LedgerError);
  });
});

describe('state updates', () => {
  const book = createBook('Trip', now, 'b1');
  const state = addBook(addBook(emptyState(), createBook('Other', now, 'b0')), book);

  it('adds books newest first', () => {
    expect(state.books.map(b => b.id)).toEqual(['b1', 'b0']);
  });

  it('prepends expenses to the chosen book only and does not mutate input', () => {
    const next = addExpense(addExpense(state, 'b1', expense({ id: 'e1' })), 'b1', expense({ id: 'e2' }));
    expect(next.books[0].expenses.map(e => e.id)).toEqual(['e2', 'e1']);
    expect(next.books[1].expenses).toEqual([]);
    expect(state.books[0].expenses).toEqual([]);
  });

  it('rejects an unknown book', () => {
    expect(() => addExpense(state, 'missing', expense())).toThrow(LedgerError);
  });

  it('removes an expense', () => {
    const next = removeExpense(addExpense(state, 'b1', expense({ id: 'e1' })), 'b1', 'e1');
    expect(next.books[0].expenses).toEqual([]);
  });
});

describe('totalFor', () => {
  it('sums only the selected currency', () => {
    expect(totalFor([expense({ amount: 10 }), expense({ amount: 2.5 }), expense({ amount: 99, currency: 'USD' })], 'INR')).toBe(12.5);
  });
});

describe('parseState', () => {
  it('returns an empty state when nothing is stored', () => {
    expect(parseState(null)).toEqual({ state: emptyState(), unreadable: false });
  });

  it('round-trips a stored state', () => {
    const state = addExpense(addBook(emptyState(), createBook('Trip', now, 'b1')), 'b1', expense());
    expect(parseState(JSON.stringify(state))).toEqual({ state, unreadable: false });
  });

  it.each(['not json', '{"version":2,"books":[]}', '{"version":1,"books":[{"id":"b"}]}'])('flags unreadable data %j', raw => {
    expect(parseState(raw)).toEqual({ state: emptyState(), unreadable: true });
  });
});

describe('toCsv', () => {
  it('writes oldest first with quoting and neutralises formulas', () => {
    const book = { ...createBook('Trip', now, 'b1'), expenses: [expense({ id: 'e2', name: '=HYPERLINK("x")', location: '+1, "quoted"' }), expense({ id: 'e1', name: 'Tea' })] };
    const lines = toCsv(book).split('\r\n');
    expect(lines[0]).toBe('ID,Expense,Amount,Currency,Date,Time,Timezone,Location,Recorded at (UTC)');
    expect(lines[1]).toBe('e1,Tea,120.5,INR,2026-10-11,10:05:20,Asia/Kolkata,,2026-10-11T04:35:20.000Z');
    expect(lines[2]).toBe(`e2,"'=HYPERLINK(""x"")",120.5,INR,2026-10-11,10:05:20,Asia/Kolkata,"'+1, ""quoted""",2026-10-11T04:35:20.000Z`);
    expect(lines[3]).toBe('');
  });

  it('builds a safe file name', () => {
    expect(csvFileName(createBook('October / trip <2026>', now))).toBe('October-trip-2026.csv');
    expect(csvFileName(createBook('???', now))).toBe('ledger.csv');
  });
});
