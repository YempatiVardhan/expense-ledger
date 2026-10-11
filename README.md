# Pocket Ledger

A small Next.js app for recording everyday expenses in shared, public ledgers stored in Supabase. There is no sign-in: **anyone who can open the site can view every ledger and add expenses to it.** Create multiple ledgers, switch between them, enter a name and amount, and optionally type a location or fill in your current area name. Date, time, timezone and UTC timestamp are recorded by the server. INR is the default; USD, EUR and GBP are also supported. Totals are per selected currency.

## Run locally

1. Run `npm install` in this directory.
2. In [Supabase](https://supabase.com/dashboard), create a project, open **SQL Editor**, and run [`supabase/schema.sql`](supabase/schema.sql). It is safe to re-run when the schema changes.
3. Copy `.env.example` to `.env.local` and fill in, from **Project Settings → API**:
   - `SUPABASE_URL`: the project URL.
   - `SUPABASE_SECRET_KEY`: the **secret** key (`sb_secret_…`) or legacy `service_role` key. The publishable/anon key will not work.
4. Run `npm run dev` and open http://localhost:3000.

Never prefix the key with `NEXT_PUBLIC_` or commit `.env.local`. The secret key bypasses Row Level Security and must stay on the server.

## How it works

The browser talks only to this app's API routes (`/api/ledgers`, `/api/ledgers/[id]/expenses`, `/api/geocode`). The routes validate input and use the secret key from `lib/db.ts`, which is marked `server-only`. In the database, RLS is enabled with no policies, and table constraints repeat the input limits, so the public anon key cannot read or write the tables directly. Writes must come from the site's own origin. This blocks other websites from posting on a visitor's behalf; it is not authentication.

Ledgers can be created, renamed and deleted (deleting a ledger deletes its expenses). Expenses can be added, edited and deleted. **Anyone can do this to any ledger**, so keep backups with Export CSV, and consider Supabase point-in-time recovery for production. Deletes ask for confirmation in the page. The date and time are automatic unless **Set date manually** is used; dates must be between 2000-01-01 and today in the user's timezone. Expenses are listed by expense date and time, newest first. Lists show the newest 500 ledgers and the newest 1,000 expenses per ledger.

The location pin asks for browser GPS permission, then looks up the area and city (for example "Saidabad, Hyderabad"; villages use their district) through [OpenStreetMap Nominatim](https://nominatim.org/) via `/api/geocode`. Only the area and city are saved; coordinates are rounded to four decimals for the lookup and never stored. Nominatim's free service allows about one request per second; for heavier traffic, switch `lib/geocode.ts` to a paid provider. GPS requires HTTPS (localhost is allowed). Typed locations work without GPS.

**Export CSV** downloads the selected ledger. Exported text that would be evaluated as a spreadsheet formula is prefixed with `'`.

## Deploy

Live deployment: https://pocket-ledger-brown.vercel.app

Vercel project: https://vercel.com/chiranjeevi-maddalas-projects/pocket-ledger

Every push to `main` deploys to **production** through GitHub Actions ([`.github/workflows/deploy-production.yml`](.github/workflows/deploy-production.yml)). The workflow runs lint, typecheck and tests first and deploys only if they pass. Vercel's own Git deployments are turned off in `vercel.json`, so other branches create no preview deployments and `main` is not deployed twice. The workflow can also be run manually from the Actions tab.

One-time setup:

1. Create a token in Vercel → Account Settings → Tokens, scoped to the team that owns the project.
2. In GitHub → repository Settings → Secrets and variables → Actions, add `VERCEL_TOKEN`, plus `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (the `orgId` and `projectId` values in `.vercel/project.json`).
3. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel → Project → Settings → Environment Variables for **Production**. The workflow pulls them at build time; they are never stored in GitHub. The old `NEXTAUTH_*` and `GOOGLE_*` variables can be removed. Because writes are open to everyone, consider a Vercel Firewall rate-limit rule on `/api/*` to slow down spam. Security headers are set in `next.config.ts`.

## Checks

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

Tests cover validation, CSV export, area-name formatting, the API routes (with the database mocked), key-type detection and the UI (in jsdom with a fake API). They do not hit a real Supabase project. After adding your keys, manually create a ledger, save an expense, reload, and check it in a second browser.
