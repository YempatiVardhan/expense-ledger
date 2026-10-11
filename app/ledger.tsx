'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookOpen, CalendarDays, Check, Download, Globe, LoaderCircle, MapPin, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import { compareExpenses, csvFileName, CURRENCIES, DEFAULT_BOOK_NAME, localDate, MIN_DATE, toCsv, totalFor, type Book, type Currency, type Expense } from '@/lib/ledger';
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, method === 'GET' ? undefined : { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Unable to connect. Try again.'); return data;
}
const ledgerPath = (bookId: string) => `/api/ledgers/${encodeURIComponent(bookId)}`;
const subscribeClock = (callback: () => void) => { const timer = setInterval(callback, 1000); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / 60000);
const noMinute = () => null;
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeOf = (date: Date) => date.toTimeString().slice(0, 5);
export default function Ledger() {
  const minute = useSyncExternalStore(subscribeClock, currentMinute, noMinute);
  const [books, setBooks] = useState<Book[] | null>(null), [selected, setSelected] = useState(''), [loaded, setLoaded] = useState<{ bookId: string; expenses: Expense[] } | null>(null);
  const [name, setName] = useState(''), [amount, setAmount] = useState(''), [currency, setCurrency] = useState<Currency>('INR'), [location, setLocation] = useState('');
  const [manualDate, setManualDate] = useState(false), [date, setDate] = useState(''), [time, setTime] = useState(''), [editing, setEditing] = useState<Expense | null>(null);
  const [creating, setCreating] = useState(false), [bookName, setBookName] = useState(''), [renaming, setRenaming] = useState(false), [rename, setRename] = useState(''), [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const current = books?.find(b => b.id === selected) ?? books?.[0];
  const currentId = current?.id;
  const loading = books === null || (currentId !== undefined && loaded?.bookId !== currentId);
  const expenses = currentId && loaded?.bookId === currentId ? loaded.expenses : [];
  const now = minute === null ? null : new Date(minute * 60000);
  const today = now ? localDate(now, timezone()) : undefined;
  useEffect(() => { let active = true; api('/api/ledgers').then(data => { if (active) setBooks(data.books); }).catch(e => { if (active) { setBooks([]); setError(e.message); } }); return () => { active = false; }; }, []);
  useEffect(() => { if (!currentId) return; let active = true; api(`${ledgerPath(currentId)}/expenses`).then(data => { if (active) setLoaded({ bookId: currentId, expenses: data.expenses }); }).catch(e => { if (active) { setLoaded({ bookId: currentId, expenses: [] }); setError(e.message); } }); return () => { active = false; }; }, [currentId]);
  const money = (value: number, code: string = currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: (CURRENCIES as readonly string[]).includes(code) ? code : 'INR' }).format(value);
  const updateExpenses = (bookId: string, change: (list: Expense[]) => Expense[]) => setLoaded(previous => ({ bookId, expenses: change(previous?.bookId === bookId ? previous.expenses : []).sort(compareExpenses) }));
  function start(message = '') { setBusy(message); setError(''); setNotice(''); }
  function resetForm() { setEditing(null); setName(''); setAmount(''); setLocation(''); setManualDate(false); setDate(''); setTime(''); }
  function toggleManualDate() {
    if (!manualDate) { const at = new Date(); setDate(localDate(at, timezone())); setTime(timeOf(at)); }
    setManualDate(!manualDate);
  }
  function startEdit(expense: Expense) {
    setEditing(expense); setName(expense.name); setAmount(String(expense.amount)); setCurrency(expense.currency); setLocation(expense.location);
    setManualDate(true); setDate(expense.date); setTime(expense.time.slice(0, 5)); setConfirming(''); setNotice(''); setError('');
    document.getElementById('expense')?.focus();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); start('save');
    const body = { name, amount: Number(amount), currency, location, timezone: timezone(), ...(manualDate ? { date, time } : {}) };
    try {
      if (editing && currentId) {
        const { expense } = await api(`${ledgerPath(currentId)}/expenses/${encodeURIComponent(editing.id)}`, 'PATCH', body);
        updateExpenses(currentId, list => list.map(e => (e.id === expense.id ? expense : e)));
        resetForm(); setNotice('Expense updated.'); return;
      }
      let book = current;
      if (!book) { book = (await api('/api/ledgers', 'POST', { name: DEFAULT_BOOK_NAME })).book as Book; setBooks(previous => [book!, ...(previous ?? [])]); setSelected(book.id); }
      const bookId = book.id;
      const { expense } = await api(`${ledgerPath(bookId)}/expenses`, 'POST', body);
      updateExpenses(bookId, list => [expense, ...list]);
      resetForm(); setNotice('Expense saved.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function removeExpense(expense: Expense) {
    if (!currentId) return; start('delete');
    try {
      await api(`${ledgerPath(currentId)}/expenses/${encodeURIComponent(expense.id)}`, 'DELETE');
      updateExpenses(currentId, list => list.filter(e => e.id !== expense.id));
      if (editing?.id === expense.id) resetForm();
      setConfirming(''); setNotice('Expense deleted.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); start('create');
    try { const { book } = await api('/api/ledgers', 'POST', { name: bookName }); setBooks(previous => [book, ...(previous ?? [])]); selectBook(book.id); setBookName(''); setCreating(false); setNotice('Your new ledger is ready.'); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function saveRename(event: React.FormEvent) {
    event.preventDefault(); if (!currentId) return; start('rename');
    try { const { book } = await api(ledgerPath(currentId), 'PATCH', { name: rename }); setBooks(previous => (previous ?? []).map(b => (b.id === book.id ? book : b))); setRenaming(false); setNotice('Ledger renamed.'); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function removeBook() {
    if (!current) return; start('delete');
    try {
      await api(ledgerPath(current.id), 'DELETE');
      setBooks(previous => (previous ?? []).filter(b => b.id !== current.id)); selectBook(''); setNotice(`Ledger “${current.name}” deleted.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  function selectBook(id: string) { setSelected(id); if (editing) resetForm(); setRenaming(false); setConfirming(''); }
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
    <div className="workspace"><section className="entry card"><div className="section-title"><span className="eyebrow">{editing ? 'EDITING' : 'QUICK ENTRY'}</span><Wallet size={20}/></div><h2>{editing ? 'Edit expense' : 'A new expense'}</h2><p className="muted">{editing ? `In ${current?.name ?? 'this ledger'}.` : 'Just the essentials. We’ll handle the timestamp.'}</p>
      <form onSubmit={save}><label htmlFor="expense">What did you spend on?</label><input id="expense" placeholder="Coffee, groceries, a ride home…" value={name} onChange={e => setName(e.target.value)} maxLength={120} required/><div className="amount-row"><div><label htmlFor="amount">Amount</label><input id="amount" type="number" inputMode="decimal" min="0.01" max="999999999" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required/></div><div><label htmlFor="currency">Currency</label><select id="currency" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></div></div>
      {manualDate ? <div className="manual-dates"><div><label htmlFor="date">Date</label><input id="date" type="date" min={MIN_DATE} max={today} value={date} onChange={e => setDate(e.target.value)} required/></div><div><label htmlFor="time">Time</label><input id="time" type="time" value={time} onChange={e => setTime(e.target.value)} required/></div></div>
        : <div className="timestamp"><span className="live-dot"/><span>{now ? now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Automatic date'}<b>·</b>{now ? now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Automatic time'}</span><small>Auto</small></div>}
      {!editing && <button type="button" className="text-button" onClick={toggleManualDate}><CalendarDays size={16}/> {manualDate ? 'Use the current date and time' : 'Set date manually'}</button>}
      <label htmlFor="location">Location <span className="optional">optional</span></label><div className="location-row"><input id="location" placeholder="Add a place" value={location} onChange={e => setLocation(e.target.value)} maxLength={250}/><button type="button" className="icon-button" aria-label="Use current area" title="Use current area" disabled={Boolean(busy)} onClick={locate}>{busy === 'location' ? <LoaderCircle className="spin" size={18}/> : <MapPin size={18}/>}</button></div><small className="hint">Use the pin to fill in your area and city, or type a place. Area names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors.</small>
      {!editing && <><label htmlFor="destination">Save to</label><select id="destination" value={currentId ?? ''} onChange={e => { selectBook(e.target.value); setNotice(''); setError(''); }} disabled={!books?.length || Boolean(busy)}>{books === null ? <option value="">Loading ledgers…</option> : books.length ? books.map(b => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">{DEFAULT_BOOK_NAME} (created on first save)</option>}</select><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => setCreating(!creating)}><Plus size={16}/> Create a new ledger</button></>}
      <div className={editing ? 'create-actions edit-actions' : undefined}>{editing && <button className="secondary" type="button" disabled={Boolean(busy)} onClick={resetForm}>Cancel</button>}<button className="primary save" disabled={books === null || Boolean(busy)}>{busy === 'save' ? <><LoaderCircle className="spin" size={18}/> Saving…</> : editing ? <><Check size={18}/> Save changes</> : <><Plus size={18}/> Save expense</>}</button></div><small className="hint public-note">Ledgers are public: anyone with this site can view, change or delete them.</small></form>
      {creating && !editing && <form className="create-form" onSubmit={create}><label htmlFor="book-name">New ledger name</label><input autoFocus id="book-name" placeholder="October expenses" maxLength={100} value={bookName} onChange={e => setBookName(e.target.value)} required/><div className="create-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={Boolean(busy)}>{busy === 'create' ? 'Creating…' : 'Create ledger'}</button></div></form>}
    </section><section className="history"><div className="history-top"><div className="ledger-title"><span className="eyebrow">YOUR LEDGER</span>{renaming && current ? <form className="rename-form" onSubmit={saveRename}><label htmlFor="rename" className="visually-hidden">Ledger name</label><input autoFocus id="rename" maxLength={100} value={rename} onChange={e => setRename(e.target.value)} required/><button className="primary" disabled={Boolean(busy)}>{busy === 'rename' ? 'Saving…' : 'Save'}</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setRenaming(false)}>Cancel</button></form> : <h2>{current?.name || 'Everything in one place'}</h2>}</div>
        {current && !renaming && <div className="ledger-actions">{expenses.length > 0 && <button type="button" className="sheet-link" onClick={exportCsv}>Export CSV <Download size={16}/></button>}<button type="button" className="ghost-icon" aria-label="Rename ledger" title="Rename ledger" disabled={Boolean(busy)} onClick={() => { setRename(current.name); setRenaming(true); setConfirming(''); }}><Pencil size={16}/></button><button type="button" className="ghost-icon" aria-label="Delete ledger" title="Delete ledger" disabled={Boolean(busy)} onClick={() => setConfirming('ledger')}><Trash2 size={16}/></button></div>}</div>
      {current && confirming === 'ledger' && <div className="confirm-bar" role="group" aria-label="Confirm ledger deletion"><p>Delete “{current.name}” and its {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}? This cannot be undone.</p><div><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setConfirming('')}>Cancel</button><button type="button" className="danger" aria-label="Confirm delete ledger" disabled={Boolean(busy)} onClick={removeBook}>{busy === 'delete' ? 'Deleting…' : 'Delete ledger'}</button></div></div>}
      <div className="summary"><div><span>Recorded total · {currency}</span><strong>{money(totalFor(expenses, currency))}</strong></div><div><span>Expenses</span><strong>{expenses.length.toString().padStart(2, '0')}</strong></div></div><div className="list-heading"><h3>Recent expenses</h3><span>Newest first</span></div>
      {loading ? <div className="empty"><LoaderCircle className="spin"/><h3>Loading your ledger…</h3></div> : expenses.length ? <div className="expense-list">{expenses.map(expense => <article key={expense.id} className={editing?.id === expense.id ? 'is-editing' : undefined}><div className="expense-icon"><Wallet size={18}/></div><div className="expense-details"><h3>{expense.name}</h3><p>{expense.date} · {expense.time.slice(0, 5)}{expense.location && <span><MapPin size={12}/> {expense.location}</span>}</p></div><strong>{money(expense.amount, expense.currency)}</strong>
        {confirming === expense.id ? <div className="row-actions"><button type="button" className="ghost-icon" aria-label="Keep expense" title="Keep" disabled={Boolean(busy)} onClick={() => setConfirming('')}><X size={16}/></button><button type="button" className="danger small" aria-label={`Confirm delete ${expense.name}`} disabled={Boolean(busy)} onClick={() => removeExpense(expense)}>Delete</button></div>
          : <div className="row-actions"><button type="button" className="ghost-icon" aria-label={`Edit ${expense.name}`} title="Edit expense" disabled={Boolean(busy)} onClick={() => startEdit(expense)}><Pencil size={16}/></button><button type="button" className="ghost-icon" aria-label={`Delete ${expense.name}`} title="Delete expense" disabled={Boolean(busy)} onClick={() => setConfirming(expense.id)}><Trash2 size={16}/></button></div>}</article>)}</div> : <div className="empty"><div className="empty-sheet"><Wallet size={36}/><span><Plus size={14}/></span></div><h3>A fresh page for your spending.</h3><p>Save your first expense. It will appear here.</p></div>}
      <div className="footnote"><Globe size={16}/><p>Saved to a shared database anyone can view and edit.<br/>Export a CSV to open it in a spreadsheet.</p></div></section></div><footer><span>Pocket ledger</span><span>Small expenses. Clear records.</span></footer></main>;
}
