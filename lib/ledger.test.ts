import { describe, expect, it } from 'vitest';
import { bookName, createExpense, csvFileName, idSchema, LedgerError, toCsv, totalFor, type Expense } from './ledger';

const now = new Date('2026-10-11T04:35:20.000Z');
const input = { name: 'Coffee', amount: 120.5, currency: 'INR', timezone: 'Asia/Kolkata', location: '' };
const expense = (overrides: Partial<Expense> = {}): Expense => ({ id: 'e1', ...createExpense(input, now), ...overrides });

describe('createExpense', () => {
  it('stamps local date, time and UTC timestamp for the given timezone', () => {
    expect(createExpense({ ...input, name: '  Coffee  ', location: ' Saidabad, Hyderabad ' }, now)).toEqual({
      name: 'Coffee', amount: 120.5, currency: 'INR', date: '2026-10-11', time: '10:05:20', timezone: 'Asia/Kolkata', location: 'Saidabad, Hyderabad', recordedAt: '2026-10-11T04:35:20.000Z',
    });
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(createExpense({ ...input, timezone: 'Not/AZone' }, now)).toMatchObject({ timezone: 'UTC', time: '04:35:20' });
  });

  it.each([
    ['empty name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(121) }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -5 }],
    ['three decimals', { amount: 1.234 }],
    ['NaN amount', { amount: Number('abc') }],
    ['too large amount', { amount: 1e9 }],
    ['unknown currency', { currency: 'JPY' }],
    ['long location', { location: 'x'.repeat(251) }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => createExpense({ ...input, ...overrides }, now)).toThrow(LedgerError);
  });

  it('rejects a non-object body', () => {
    expect(() => createExpense(null)).toThrow(LedgerError);
  });
});

describe('bookName', () => {
  it('trims the name', () => {
    expect(bookName('  Trip  ')).toBe('Trip');
  });

  it.each(['', '   ', 'x'.repeat(101), 42, undefined])('rejects invalid name %j', name => {
    expect(() => bookName(name)).toThrow(LedgerError);
  });
});

describe('idSchema', () => {
  it('accepts UUIDs only', () => {
    expect(idSchema.safeParse('3f1c0a1e-8b7a-4c1e-9f0a-2b3c4d5e6f70').success).toBe(true);
    expect(idSchema.safeParse('../ledgers').success).toBe(false);
  });
});

describe('totalFor', () => {
  it('sums only the selected currency', () => {
    expect(totalFor([expense({ amount: 10 }), expense({ amount: 2.5 }), expense({ amount: 99, currency: 'USD' })], 'INR')).toBe(12.5);
  });
});

describe('toCsv', () => {
  it('writes oldest first with quoting and neutralises formulas', () => {
    const lines = toCsv([expense({ id: 'e2', name: '=HYPERLINK("x")', location: '+1, "quoted"' }), expense({ id: 'e1', name: 'Tea' })]).split('\r\n');
    expect(lines[0]).toBe('ID,Expense,Amount,Currency,Date,Time,Timezone,Location,Recorded at (UTC)');
    expect(lines[1]).toBe('e1,Tea,120.5,INR,2026-10-11,10:05:20,Asia/Kolkata,,2026-10-11T04:35:20.000Z');
    expect(lines[2]).toBe(`e2,"'=HYPERLINK(""x"")",120.5,INR,2026-10-11,10:05:20,Asia/Kolkata,"'+1, ""quoted""",2026-10-11T04:35:20.000Z`);
    expect(lines[3]).toBe('');
  });

  it('builds a safe file name', () => {
    expect(csvFileName({ name: 'October / trip <2026>' })).toBe('October-trip-2026.csv');
    expect(csvFileName({ name: '???' })).toBe('ledger.csv');
  });
});
