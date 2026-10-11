import { google, failure, safeMutation, ApiError } from '@/lib/google';
export async function GET() {
  try {
    let pageToken = ''; const files = [];
    do {
      const params = new URLSearchParams({ q: "trashed = false and appProperties has { key='expenseLedger' and value='v1' }", fields: 'nextPageToken,files(id,name,webViewLink)', pageSize: '100', orderBy: 'createdTime desc', ...(pageToken ? { pageToken } : {}) });
      const data = await google(`https://www.googleapis.com/drive/v3/files?${params}`);
      files.push(...data.files); pageToken = data.nextPageToken || '';
    } while (pageToken);
    return Response.json({ sheets: files });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const { name } = await request.json();
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new ApiError('Enter a sheet name (1–100 characters).');
    const sheet = await google('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title: name.trim() }, sheets: [{ properties: { title: 'Expenses', gridProperties: { frozenRowCount: 1 } } }] }) });
    await google(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/Expenses!A1:I1?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [['ID', 'Expense', 'Amount', 'Currency', 'Date', 'Time', 'Timezone', 'Location', 'Recorded at (UTC)']] }) });
    await google(`https://www.googleapis.com/drive/v3/files/${sheet.spreadsheetId}`, { method: 'PATCH', body: JSON.stringify({ appProperties: { expenseLedger: 'v1' } }) });
    return Response.json({ sheet: { id: sheet.spreadsheetId, name: name.trim(), webViewLink: sheet.spreadsheetUrl } }, { status: 201 });
  } catch (error) { return failure(error); }
}
