import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Ledger from './ledger';
import { BACKUP_KEY, STORAGE_KEY, parseState } from '@/lib/ledger';

const stored = () => parseState(localStorage.getItem(STORAGE_KEY)).state;

function addExpense(name: string, amount: string) {
  fireEvent.change(screen.getByLabelText('What did you spend on?'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } });
  fireEvent.click(screen.getByRole('button', { name: /save expense/i }));
}

describe('Ledger', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('creates a default ledger on first save and persists the expense', () => {
    render(<Ledger />);
    addExpense('Coffee', '120.50');
    expect(screen.getByRole('status').textContent).toContain('Expense saved on this device.');
    expect(screen.getByRole('heading', { name: 'Coffee' })).toBeTruthy();
    expect(stored().books).toHaveLength(1);
    expect(stored().books[0]).toMatchObject({ name: 'My expenses', expenses: [{ name: 'Coffee', amount: 120.5, currency: 'INR' }] });
    expect((screen.getByLabelText('What did you spend on?') as HTMLInputElement).value).toBe('');
  });

  it('shows a validation error and saves nothing for an invalid amount', () => {
    render(<Ledger />);
    fireEvent.change(screen.getByLabelText('What did you spend on?'), { target: { value: 'Coffee' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1.234' } });
    // Submit the form directly to bypass native constraint validation and exercise the app's own checks.
    fireEvent.submit(screen.getByRole('button', { name: /save expense/i }).closest('form')!);
    expect(screen.getAllByRole('alert').some(a => a.textContent?.includes('positive amount'))).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('creates and switches to a new ledger', () => {
    render(<Ledger />);
    addExpense('Coffee', '10');
    fireEvent.click(screen.getByRole('button', { name: /create a new ledger/i }));
    fireEvent.change(screen.getByLabelText('New ledger name'), { target: { value: 'Trip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ledger' }));
    expect((screen.getByLabelText('Save to') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Trip');
    expect(screen.queryByRole('heading', { name: 'Coffee' })).toBeNull();
    addExpense('Train', '5');
    expect(stored().books.map(b => [b.name, b.expenses.map(e => e.name)])).toEqual([['Trip', ['Train']], ['My expenses', ['Coffee']]]);
  });

  it('deletes an expense', () => {
    render(<Ledger />);
    addExpense('Coffee', '10');
    const article = screen.getByRole('heading', { name: 'Coffee' }).closest('article')!;
    fireEvent.click(within(article as HTMLElement).getByRole('button', { name: 'Delete Coffee' }));
    expect(screen.queryByRole('heading', { name: 'Coffee' })).toBeNull();
    expect(stored().books[0].expenses).toEqual([]);
  });

  it('backs up unreadable data before overwriting it', () => {
    localStorage.setItem(STORAGE_KEY, 'corrupted');
    render(<Ledger />);
    expect(screen.getAllByRole('alert').some(a => a.textContent?.includes('could not be read'))).toBe(true);
    addExpense('Coffee', '10');
    expect(localStorage.getItem(BACKUP_KEY)).toBe('corrupted');
    expect(stored().books[0].expenses).toHaveLength(1);
  });
});
