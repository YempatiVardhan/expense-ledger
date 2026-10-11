'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, Check, Download, Globe, LoaderCircle, MapPin, Plus, Wallet } from 'lucide-react';
import { csvFileName, CURRENCIES, DEFAULT_BOOK_NAME, toCsv, totalFor, type Book, type Currency, type Expense } from '@/lib/ledger';
async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Unable to connect. Try again.'); return data;
}
const subscribeClock = (callback: () => void) => { const timer = setInterval(callback, 1000); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / 60000);
const noMinute = () => null;
export default function Ledger() {
  const minute = useSyncExternalStore(subscribeClock, currentMinute, noMinute);
  const [books, setBooks] = useState<Book[] | null>(null), [selected, setSelected] = useState(''), [loaded, setLoaded] = useState<{ bookId: string; expenses: Expense[] } | null>(null);
  const [name, setName] = useState(''), [amount, setAmount] = useState(''), [currency, setCurrency] = useState<Currency>('INR'), [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false), [bookName, setBookName] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const current = books?.find(b => b.id === selected) ?? books?.[0];
  const currentId = current?.id;
  const loading = books === null || (currentId !== undefined && loaded?.bookId !== currentId);
  const expenses = currentId && loaded?.bookId === currentId ? loaded.expenses : [];
  const now = minute === null ? null : new Date(minute * 60000);
  useEffect(() => { let active = true; api('/api/ledgers').then(data => { if (active) setBooks(data.books); }).catch(e => { if (active) { setBooks([]); setError(e.message); } }); return () => { active = false; }; }, []);
  useEffect(() => { if (!currentId) return; let active = true; api(`/api/ledgers/${encodeURIComponent(currentId)}/expenses`).then(data => { if (active) setLoaded({ bookId: currentId, expenses: data.expenses }); }).catch(e => { if (active) { setLoaded({ bookId: currentId, expenses: [] }); setError(e.message); } }); return () => { active = false; }; }, [currentId]);
  const money = (value: number, code: string = currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: (CURRENCIES as readonly string[]).includes(code) ? code : 'INR' }).format(value);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy('save'); setError(''); setNotice('');
    try {
      let book = current;
      if (!book) { book = (await api('/api/ledgers', { name: DEFAULT_BOOK_NAME })).book as Book; setBooks(previous => [book!, ...(previous ?? [])]); setSelected(book.id); }
      const bookId = book.id;
      const data = await api(`/api/ledgers/${encodeURIComponent(bookId)}/expenses`, { name, amount: Number(amount), currency, location, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setLoaded(previous => ({ bookId, expenses: [data.expense, ...(previous?.bookId === bookId ? previous.expenses : [])] }));
      setName(''); setAmount(''); setLocation(''); setNotice('Expense saved.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy('create'); setError(''); setNotice('');
    try { const { book } = await api('/api/ledgers', { name: bookName }); setBooks(previous => [book, ...(previous ?? [])]); setSelected(book.id); setBookName(''); setCreating(false); setNotice('Your new ledger is ready.'); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  function exportCsv() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([toCsv(expenses)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = csvFileName(current); link.click(); URL.revokeObjectURL(url);
  }
  function locate() {
    if (!navigator.geolocation) { setError('Location is unavailable. You can type a place instead.'); return; }
    setBusy('location'); setError('');
    navigator.geolocation.getCurrentPosition(async position => {
      try { const { area } = await api(`/api/geocode?lat=${position.coords.latitude}&lon=${position.coords.longitude}`); setLocation(area); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
    }, () => { setError('Location could not be accessed. Type a place or leave it blank.'); setBusy(''); }, { timeout: 10000, maximumAge: 60000 });
  }
  return <main><header><Link className="brand" href="/"><span className="brand-icon"><BookOpen size={22} /></span>Pocket<span className="light">ledger</span></Link><div className="account"><span className="badge"><Globe size={15}/> Public ledgers</span></div></header>
    <div className="intro"><div className="eyebrow">A LITTLE LESS ADMIN</div><h1>Spend. Save. Carry on.</h1><p>Shared expense ledgers anyone can open. No account needed.</p></div>
    <div role="alert" className={error ? 'message error' : 'hidden'}>{error}</div><div role="status" className={notice ? 'message success' : 'hidden'}><Check size={17}/>{notice}</div>
    <div className="workspace"><section className="entry card"><div className="section-title"><span className="eyebrow">QUICK ENTRY</span><Wallet size={20}/></div><h2>A new expense</h2><p className="muted">Just the essentials. We’ll handle the timestamp.</p>
      <form onSubmit={save}><label htmlFor="expense">What did you spend on?</label><input id="expense" placeholder="Coffee, groceries, a ride home…" value={name} onChange={e => setName(e.target.value)} maxLength={120} required/><div className="amount-row"><div><label htmlFor="amount">Amount</label><input id="amount" type="number" inputMode="decimal" min="0.01" max="999999999" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required/></div><div><label htmlFor="currency">Currency</label><select id="currency" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></div></div>
      <div className="timestamp"><span className="live-dot"/><span>{now ? now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Automatic date'}<b>·</b>{now ? now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Automatic time'}</span><small>Auto</small></div>
      <label htmlFor="location">Location <span className="optional">optional</span></label><div className="location-row"><input id="location" placeholder="Add a place" value={location} onChange={e => setLocation(e.target.value)} maxLength={250}/><button type="button" className="icon-button" aria-label="Use current area" title="Use current area" disabled={Boolean(busy)} onClick={locate}>{busy === 'location' ? <LoaderCircle className="spin" size={18}/> : <MapPin size={18}/>}</button></div><small className="hint">Use the pin to fill in your area and city, or type a place. Area names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors.</small>
      <label htmlFor="destination">Save to</label><select id="destination" value={currentId ?? ''} onChange={e => { setSelected(e.target.value); setNotice(''); setError(''); }} disabled={!books?.length || Boolean(busy)}>{books === null ? <option value="">Loading ledgers…</option> : books.length ? books.map(b => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">{DEFAULT_BOOK_NAME} (created on first save)</option>}</select><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => setCreating(!creating)}><Plus size={16}/> Create a new ledger</button>
      <button className="primary save" disabled={books === null || Boolean(busy)}>{busy === 'save' ? <><LoaderCircle className="spin" size={18}/> Saving…</> : <><Plus size={18}/> Save expense</>}</button><small className="hint public-note">Ledgers are public: anyone with this site can see what you save.</small></form>
      {creating && <form className="create-form" onSubmit={create}><label htmlFor="book-name">New ledger name</label><input autoFocus id="book-name" placeholder="October expenses" maxLength={100} value={bookName} onChange={e => setBookName(e.target.value)} required/><div className="create-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={Boolean(busy)}>{busy === 'create' ? 'Creating…' : 'Create ledger'}</button></div></form>}
    </section><section className="history"><div className="history-top"><div><span className="eyebrow">YOUR LEDGER</span><h2>{current?.name || 'Everything in one place'}</h2></div>{current && expenses.length > 0 && <button type="button" className="sheet-link" onClick={exportCsv}>Export CSV <Download size={16}/></button>}</div><div className="summary"><div><span>Recorded total · {currency}</span><strong>{money(totalFor(expenses, currency))}</strong></div><div><span>Expenses</span><strong>{expenses.length.toString().padStart(2, '0')}</strong></div></div><div className="list-heading"><h3>Recent expenses</h3><span>Newest first</span></div>
      {loading ? <div className="empty"><LoaderCircle className="spin"/><h3>Loading your ledger…</h3></div> : expenses.length ? <div className="expense-list">{expenses.map(expense => <article key={expense.id}><div className="expense-icon"><Wallet size={18}/></div><div className="expense-details"><h3>{expense.name}</h3><p>{expense.date} · {expense.time}{expense.location && <span><MapPin size={12}/> {expense.location}</span>}</p></div><strong>{money(expense.amount, expense.currency)}</strong></article>)}</div> : <div className="empty"><div className="empty-sheet"><Wallet size={36}/><span><Plus size={14}/></span></div><h3>A fresh page for your spending.</h3><p>Save your first expense. It will appear here.</p></div>}
      <div className="footnote"><Globe size={16}/><p>Saved to a shared database anyone can view.<br/>Export a CSV to open it in a spreadsheet.</p></div></section></div><footer><span>Pocket ledger</span><span>Small expenses. Clear records.</span></footer></main>;
}
