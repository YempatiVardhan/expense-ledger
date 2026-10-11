import { deleteExpense, updateExpense } from '@/lib/db';
import { ApiError, failure, readJson, routeId, sameOrigin } from '@/lib/http';
import { createExpense } from '@/lib/ledger';

type Context = { params: Promise<{ id: string; expenseId: string }> };

async function ids(context: Context) {
  const { id, expenseId } = await context.params;
  return [routeId(id, 'Ledger'), routeId(expenseId, 'Expense')] as const;
}

export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const [bookId, expenseId] = await ids(context);
    const expense = await updateExpense(bookId, expenseId, createExpense(await readJson(request)));
    if (!expense) throw new ApiError('Expense not found.', 404);
    return Response.json({ expense });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const [bookId, expenseId] = await ids(context);
    if (!(await deleteExpense(bookId, expenseId))) throw new ApiError('Expense not found.', 404);
    return new Response(null, { status: 204 });
  } catch (error) { return failure(error); }
}
