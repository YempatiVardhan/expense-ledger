import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET);
export const authOptions: NextAuthOptions = {
  providers: [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '', authorization: { params: { scope: 'openid email profile https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent' } } })],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) return { ...token, accessToken: account.access_token, refreshToken: account.refresh_token, expiresAt: account.expires_at };
      if (Date.now() < Number(token.expiresAt) * 1000 - 60000) return token;
      if (!token.refreshToken) return { ...token, error: 'Reconnect' };
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token', refresh_token: String(token.refreshToken) }) });
        const data = await response.json();
        if (!response.ok) throw new Error('Refresh failed');
        return { ...token, accessToken: data.access_token, expiresAt: Math.floor(Date.now() / 1000) + data.expires_in, refreshToken: data.refresh_token ?? token.refreshToken, error: undefined };
      } catch { return { ...token, error: 'Reconnect' }; }
    },
    async session({ session, token }) {
      // getServerSession consumes this on the server; the session endpoint strips credentials.
      return Object.assign(session, { accessToken: token.accessToken, authError: token.error });
    },
  },
};
