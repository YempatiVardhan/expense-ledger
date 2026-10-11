# Pocket Ledger

A small Next.js app for recording everyday expenses. There is no sign-in and no server storage: expenses are saved in the browser's `localStorage` on the device you use. Create multiple ledgers, switch between them, enter a name and amount, and optionally type a location or capture GPS coordinates. Date, time, timezone and UTC timestamp are recorded automatically. INR is the default; USD, EUR and GBP are also supported. Totals are per selected currency.

## Run locally

1. Run `npm install` in this directory.
2. Run `npm run dev` and open http://localhost:3000.

No environment variables or external services are required.

## How it works

Data is stored under the `pocket-ledger:v1` key in `localStorage` and validated when read. If stored data cannot be read, the app starts empty and copies the unreadable data to `pocket-ledger:v1:unreadable-backup` before saving anything new. Open tabs stay in sync.

Data stays in that browser profile only. Clearing site data, private browsing, or switching device or browser means the expenses are not available. Use **Export CSV** to back up a ledger or open it in a spreadsheet app. Exported text that would be evaluated as a spreadsheet formula is prefixed with `'`.

GPS requires browser permission and HTTPS (localhost is allowed); it saves coordinates without a paid geocoding service. Typed locations work without GPS access.

## Deploy

Live deployment: https://pocket-ledger-brown.vercel.app

Vercel project: https://vercel.com/chiranjeevi-maddalas-projects/pocket-ledger

Deploy as a standard Next.js app (for example Vercel). No environment variables are needed; the previous `NEXTAUTH_*` and `GOOGLE_*` variables can be removed from the Vercel project. Security headers are set in `next.config.ts`.

## Checks

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

Unit tests cover validation, state updates, storage parsing and CSV export (`lib/ledger.test.ts`). Component tests drive the UI in jsdom (`app/ledger.test.tsx`). Manually verify GPS capture and CSV download in a real browser.
