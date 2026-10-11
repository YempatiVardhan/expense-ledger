import { idSchema, LedgerError } from './ledger';

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Blocks cross-site form posts and scripted writes from other origins; it is not authentication.
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Invalid request origin.', 403);
}

// Malformed ids can never exist, so treat them as not found without querying.
export function routeId(id: string, label: string) {
  if (!idSchema.safeParse(id).success) throw new ApiError(`${label} not found.`, 404);
  return id;
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError('Invalid request body.'); }
}

export function failure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof LedgerError) return Response.json({ error: error.message }, { status: 400 });
  console.error('Unhandled API error', error);
  return Response.json({ error: 'Unable to complete the request.' }, { status: 500 });
}
