import { z } from 'zod';
import { google, failure, safeMutation, verifySheet, ApiError } from '@/lib/google';
const schema = z.object({ sheetId: z.string(), name: z.string().trim().min(1).max(120), amount: z.number().positive().max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001), currency: z.enum(['INR', 'USD', 'EUR', 'GBP']), timezone: z.string().max(100), location: z.string().trim().max(250).default('') });
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('sheetId') || ''; await verifySheet(id);
    const data = await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Expenses!A2:I`);
    return Response.json({ expenses: (data.values || []).filter((r: string[]) => r[0] && r[1] && Number.isFinite(Number(r[2]))).map((r: string[]) => ({ id: r[0], name: r[1], amount: Number(r[2]), currency: r[3], date: r[4], time: r[5], timezone: r[6], location: r[7] || '', recordedAt: r[8] })).reverse() });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    safeMutation(request); const result = schema.safeParse(await request.json());
    if (!result.success) throw new ApiError('Enter a name and a positive amount with up to two decimals.');
    const input = result.data; await verifySheet(input.sheetId);
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new ApiError('Invalid timezone.'); }
    const now = new Date();
    const expense = { id: crypto.randomUUID(), name: input.name, amount: input.amount, currency: input.currency, date: new Intl.DateTimeFormat('en-CA', { timeZone: input.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now), time: new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now), timezone: input.timezone, location: input.location, recordedAt: now.toISOString() };
    await google(`https://sheets.googleapis.com/v4/spreadsheets/${input.sheetId}/values/Expenses!A:I:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [Object.values(expense)] }) });
    return Response.json({ expense }, { status: 201 });
  } catch (error) { return failure(error); }
}
