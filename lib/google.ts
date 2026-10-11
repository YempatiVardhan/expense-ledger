import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
export class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function google(path: string, init: RequestInit = {}) {
  const session = await getServerSession(authOptions) as ({ accessToken?: string; authError?: string } | null);
  if (!session?.accessToken || session.authError) throw new ApiError('Please sign in with Google again.', 401);
  const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status === 401 ? 'Please reconnect your Google account.' : 'Google Sheets could not complete the request. Check your connection and Google API setup.', response.status === 401 ? 401 : 502);
  return data;
}
export function safeMutation(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Invalid request origin.', 403);
}
export function failure(error: unknown) {
  return Response.json({ error: error instanceof ApiError ? error.message : 'Unable to complete the request.' }, { status: error instanceof ApiError ? error.status : 500 });
}
export async function verifySheet(id: string) {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(id)) throw new ApiError('Invalid sheet.');
  const file = await google(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,appProperties`);
  if (file.appProperties?.expenseLedger !== 'v1') throw new ApiError('Choose a spreadsheet created by this app.', 403);
}
