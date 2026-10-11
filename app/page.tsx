import { getServerSession } from 'next-auth';
import { authOptions, configured } from '@/lib/auth';
import Ledger from './ledger';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const session = configured ? await getServerSession(authOptions) : null;
  return <Ledger configured={configured} user={session?.user ? { name: session.user.name || 'You', email: session.user.email || '' } : null} />;
}
