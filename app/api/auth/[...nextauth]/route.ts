import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
const handler = NextAuth(authOptions);
import { type NextRequest } from 'next/server';
async function authHandler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  const response = await handler(request, { params: await context.params });
  if (new URL(request.url).pathname.endsWith('/session') && response.ok) {
    const session = await response.json();
    delete session.accessToken;
    return new Response(JSON.stringify(session), { status: response.status, headers: response.headers });
  }
  return response;
}
export { authHandler as GET, authHandler as POST };
