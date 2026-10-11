import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Pocket Ledger — Expenses to Google Sheets', description: 'A small, simple expense tracker connected to your Google Sheets.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
