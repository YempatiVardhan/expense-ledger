# Pocket Ledger

A small Next.js app that saves expenses directly to the signed-in user's Google Sheets. Create multiple spreadsheets, switch between them, enter a name and amount, and optionally type a location or capture GPS coordinates. Date, time, timezone and UTC timestamp are recorded automatically on the server. INR is the default; USD, EUR and GBP are also supported. Totals are per selected currency.

## Run locally

1. Run `npm install` in this directory.
2. Copy `.env.example` to `.env.local`.
3. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **Google Sheets API** and **Google Drive API**.
4. Configure the Google Auth Platform consent screen. While in Testing, add your Google account as a test user. Add the `openid`, `email`, `profile` and `https://www.googleapis.com/auth/drive.file` scopes.
5. Create an OAuth client of type **Web application**. Set the authorized JavaScript origin to `http://localhost:3000` and redirect URI to `http://localhost:3000/api/auth/callback/google`.
6. Put the client ID and client secret into `.env.local`. Generate `NEXTAUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep credentials private.
7. Run `npm run dev`, open http://localhost:3000, connect Google and create your first spreadsheet.

Without credentials, the UI opens with setup guidance; saving is disabled. No mock transactions are shown.

## How it works

Each new spreadsheet has an **Expenses** tab with ID, Expense, Amount, Currency, Date, Time, Timezone, Location, and Recorded at (UTC) columns. Text is appended using RAW input so names beginning with `=` are not evaluated as formulas. Only spreadsheets created and tagged by this app appear in the selector. Existing unrelated spreadsheets are not supported. Keep the Expenses tab name and columns intact.

OAuth tokens live in an encrypted, HTTP-only session cookie. Access tokens refresh automatically; Google credentials are server environment variables. Refresh tokens for consent screens in Testing can expire, requiring reconnection. GPS requires browser permission and HTTPS (localhost is allowed); it saves coordinates without a paid geocoding service. Typed locations work without GPS access.

The history reads the sheet on selection and updates after a save. External edits appear after reloading. A failed or timed-out save is not automatically retried: check your spreadsheet before retrying to avoid duplicates. New spreadsheet creation uses several Google API requests; if setup fails midway, an incomplete spreadsheet may remain in Drive.

## Deploy

Live deployment: https://pocket-ledger-brown.vercel.app

Vercel project: https://vercel.com/chiranjeevi-maddalas-projects/pocket-ledger

The project already has `NEXTAUTH_SECRET` and `NEXTAUTH_URL` configured for production. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel → Project → Settings → Environment Variables (Production). In Google Cloud, use `https://pocket-ledger-brown.vercel.app` as the authorized origin and `https://pocket-ledger-brown.vercel.app/api/auth/callback/google` as the redirect URI. Then redeploy with `npx --yes vercel@latest deploy --prod --yes` from this directory. The local folder is linked to the Vercel project; no Git repository is connected yet.

Deploy as a standard Next.js app (for example Vercel). Set the same environment variables with `NEXTAUTH_URL` set to your HTTPS domain, and add that domain's origin and `/api/auth/callback/google` redirect URI to the OAuth client. Restart after changing environment variables. Production consent-screen publication and any Google verification requirements depend on your audience and Google project configuration.

## Checks

`npm run typecheck` and `npm run build`.

Manual integration checklist with your Google test account: connect; create two spreadsheets; save an expense in each; verify headers, numeric amount, local date/time and optional location; switch sheets; reload; deny GPS permission; sign out; reconnect. Live OAuth and Sheets writes require your credentials and are not exercised by the build checks.
