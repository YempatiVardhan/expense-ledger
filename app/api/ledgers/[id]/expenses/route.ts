import { bookExists, insertExpense, listExpenses } from '@/lib/db';
import { ApiError, failure, readJson, sameOrigin } from '@/lib/http';
import { createExpense, idSchema } from '@/lib/ledger';

type Context = { params: Promise<{ id: string }> };

async function ledgerId(context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) throw new ApiError('Ledger not found.', 404);
  return id;
}

export async function GET(_request: Request, context: Context) {
  try { return Response.json({ expenses: await listExpenses(await ledgerId(context)) }); } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const id = await ledgerId(context);
    const expense = createExpense(await readJson(request));
    if (!(await bookExists(id))) throw new ApiError('Ledger not found.', 404);
    return Response.json({ expense: await insertExpense(id, expense) }, { status: 201 });
  } catch (error) { return failure(error); }
}
