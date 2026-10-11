import { deleteBook, updateBook } from '@/lib/db';
import { ApiError, failure, readJson, routeId, sameOrigin } from '@/lib/http';
import { bookName } from '@/lib/ledger';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const id = routeId((await context.params).id, 'Ledger');
    const body = await readJson(request) as { name?: unknown } | null;
    const book = await updateBook(id, bookName(body?.name));
    if (!book) throw new ApiError('Ledger not found.', 404);
    return Response.json({ book });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    sameOrigin(request);
    if (!(await deleteBook(routeId((await context.params).id, 'Ledger')))) throw new ApiError('Ledger not found.', 404);
    return new Response(null, { status: 204 });
  } catch (error) { return failure(error); }
}
