import { bookExists, insertExpense, listExpenses } from '@/lib/db';
import { ApiError, failure, readJson, routeId, sameOrigin } from '@/lib/http';
import { createExpense } from '@/lib/ledger';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try { return Response.json({ expenses: await listExpenses(routeId((await context.params).id, 'Ledger')) }); } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const id = routeId((await context.params).id, 'Ledger');
    const expense = createExpense(await readJson(request));
    if (!(await bookExists(id))) throw new ApiError('Ledger not found.', 404);
    return Response.json({ expense: await insertExpense(id, expense) }, { status: 201 });
  } catch (error) { return failure(error); }
}
