'use client';
import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { BookOpen, Check, Download, HardDrive, LoaderCircle, MapPin, Plus, Trash2, Wallet } from 'lucide-react';
import { addBook, addExpense, createBook, createExpense, csvFileName, CURRENCIES, DEFAULT_BOOK_NAME, parseState, removeExpense, toCsv, totalFor, type Currency, type LedgerState } from '@/lib/ledger';
import { readRaw, readServerRaw, subscribe, writeState } from '@/lib/storage';
const subscribeClock = (callback: () => void) => { const timer = setInterval(callback, 1000); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / 60000);
const noMinute = () => null;
const noopSubscribe = () => () => {};
export default function Ledger() {
  const raw = useSyncExternalStore(subscribe, readRaw, readServerRaw);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const minute = useSyncExternalStore(subscribeClock, currentMinute, noMinute);
  const { state, unreadable } = useMemo(() => parseState(raw), [raw]);
  const [selected, setSelected] = useState(''), [name, setName] = useState(''), [amount, setAmount] = useState(''), [currency, setCurrency] = useState<Currency>('INR'), [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false), [bookName, setBookName] = useState(''), [locating, setLocating] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const current = state.books.find(b => b.id === selected) ?? state.books[0];
  const expenses = current?.expenses ?? [];
  const now = minute === null ? null : new Date(minute * 60000);
  const money = (value: number, code: string = currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: (CURRENCIES as readonly string[]).includes(code) ? code : 'INR' }).format(value);
  function commit(next: LedgerState, message: string) {
    setError(''); setNotice('');
    try { writeState(next, unreadable ? raw : null); setNotice(message); return true; } catch (e) { setError((e as Error).message); return false; }
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const expense = createExpense({ name, amount: Number(amount), currency, location, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      let next = state, bookId = current?.id;
      if (!bookId) { const book = createBook(DEFAULT_BOOK_NAME); next = addBook(next, book); bookId = book.id; setSelected(book.id); }
      if (commit(addExpense(next, bookId, expense), 'Expense saved on this device.')) { setName(''); setAmount(''); setLocation(''); }
    } catch (e) { setNotice(''); setError((e as Error).message); }
  }
  function create(event: React.FormEvent) {
    event.preventDefault();
    try { const book = createBook(bookName); if (commit(addBook(state, book), 'Your new ledger is ready.')) { setSelected(book.id); setBookName(''); setCreating(false); } } catch (e) { setNotice(''); setError((e as Error).message); }
  }
  function remove(expenseId: string) { if (current) commit(removeExpense(state, current.id, expenseId), 'Expense removed.'); }
  function exportCsv() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([toCsv(current)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = csvFileName(current); link.click(); URL.revokeObjectURL(url);
  }
  function locate() {
    if (!navigator.geolocation) { setError('Location is unavailable. You can type a place instead.'); return; }
    setLocating(true); setError(''); navigator.geolocation.getCurrentPosition(position => { setLocation(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`); setLocating(false); }, () => { setError('Location could not be accessed. Type a place or leave it blank.'); setLocating(false); }, { timeout: 10000, maximumAge: 60000 });
  }
  return <main><header><Link className="brand" href="/"><span className="brand-icon"><BookOpen size={22} /></span>Pocket<span className="light">ledger</span></Link><div className="account"><span className="badge"><HardDrive size={15}/> Stored on this device</span></div></header>
    <div className="intro"><div className="eyebrow">A LITTLE LESS ADMIN</div><h1>Spend. Save. Carry on.</h1><p>Your everyday expenses, neatly kept in this browser. No account needed.</p></div>
    {unreadable && <div role="alert" className="message error">Saved data in this browser could not be read. It will be backed up when you save your next change.</div>}
    <div role="alert" className={error ? 'message error' : 'hidden'}>{error}</div><div role="status" className={notice ? 'message success' : 'hidden'}><Check size={17}/>{notice}</div>
    <div className="workspace"><section className="entry card"><div className="section-title"><span className="eyebrow">QUICK ENTRY</span><Wallet size={20}/></div><h2>A new expense</h2><p className="muted">Just the essentials. We’ll handle the timestamp.</p>
      <form onSubmit={save}><label htmlFor="expense">What did you spend on?</label><input id="expense" placeholder="Coffee, groceries, a ride home…" value={name} onChange={e => setName(e.target.value)} maxLength={120} required/><div className="amount-row"><div><label htmlFor="amount">Amount</label><input id="amount" type="number" inputMode="decimal" min="0.01" max="999999999" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required/></div><div><label htmlFor="currency">Currency</label><select id="currency" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></div></div>
      <div className="timestamp"><span className="live-dot"/><span>{now ? now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Automatic date'}<b>·</b>{now ? now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Automatic time'}</span><small>Auto</small></div>
      <label htmlFor="location">Location <span className="optional">optional</span></label><div className="location-row"><input id="location" placeholder="Add a place" value={location} onChange={e => setLocation(e.target.value)} maxLength={250}/><button type="button" className="icon-button" aria-label="Use current location" title="Use current location" disabled={locating} onClick={locate}>{locating ? <LoaderCircle className="spin" size={18}/> : <MapPin size={18}/>}</button></div><small className="hint">Use the pin to save your coordinates, or type a place.</small>
      <label htmlFor="destination">Save to</label><select id="destination" value={current?.id ?? ''} onChange={e => { setSelected(e.target.value); setNotice(''); setError(''); }} disabled={!state.books.length}>{state.books.length ? state.books.map(b => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">{DEFAULT_BOOK_NAME} (created on first save)</option>}</select><button type="button" className="text-button" onClick={() => setCreating(!creating)}><Plus size={16}/> Create a new ledger</button>
      <button className="primary save" disabled={!ready}><Plus size={18}/> Save expense</button></form>
      {creating && <form className="create-form" onSubmit={create}><label htmlFor="book-name">New ledger name</label><input autoFocus id="book-name" placeholder="October expenses" maxLength={100} value={bookName} onChange={e => setBookName(e.target.value)} required/><div className="create-actions"><button className="secondary" type="button" onClick={() => setCreating(false)}>Cancel</button><button className="primary">Create ledger</button></div></form>}
    </section><section className="history"><div className="history-top"><div><span className="eyebrow">YOUR LEDGER</span><h2>{current?.name || 'Everything in one place'}</h2></div>{current && expenses.length > 0 && <button type="button" className="sheet-link" onClick={exportCsv}>Export CSV <Download size={16}/></button>}</div><div className="summary"><div><span>Recorded total · {currency}</span><strong>{money(totalFor(expenses, currency))}</strong></div><div><span>Expenses</span><strong>{expenses.length.toString().padStart(2, '0')}</strong></div></div><div className="list-heading"><h3>Recent expenses</h3><span>Newest first</span></div>
      {!ready ? <div className="empty"><LoaderCircle className="spin"/><h3>Loading your ledger…</h3></div> : expenses.length ? <div className="expense-list">{expenses.map(expense => <article key={expense.id}><div className="expense-icon"><Wallet size={18}/></div><div className="expense-details"><h3>{expense.name}</h3><p>{expense.date} · {expense.time}{expense.location && <span><MapPin size={12}/> {expense.location}</span>}</p></div><strong>{money(expense.amount, expense.currency)}</strong><button type="button" className="icon-button delete" aria-label={`Delete ${expense.name}`} title="Delete expense" onClick={() => remove(expense.id)}><Trash2 size={16}/></button></article>)}</div> : <div className="empty"><div className="empty-sheet"><Wallet size={36}/><span><Plus size={14}/></span></div><h3>A fresh page for your spending.</h3><p>Save your first expense. It will appear here.</p></div>}
      <div className="footnote"><HardDrive size={16}/><p>Saved only in this browser on this device.<br/>Export a CSV to back up or open in a spreadsheet.</p></div></section></div><footer><span>Pocket ledger</span><span>Small expenses. Clear records.</span></footer></main>;
}
