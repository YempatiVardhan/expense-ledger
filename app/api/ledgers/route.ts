import { insertBook, listBooks } from '@/lib/db';
import { failure, readJson, sameOrigin } from '@/lib/http';
import { bookName } from '@/lib/ledger';

export async function GET() {
  try { return Response.json({ books: await listBooks() }); } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readJson(request) as { name?: unknown } | null;
    return Response.json({ book: await insertBook(bookName(body?.name)) }, { status: 201 });
  } catch (error) { return failure(error); }
}
