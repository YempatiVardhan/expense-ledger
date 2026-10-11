// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { isPublicKey } = await import('./db');
const jwt = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

describe('isPublicKey', () => {
  it('detects publishable and legacy anon keys', () => {
    expect(isPublicKey('sb_publishable_abc')).toBe(true);
    expect(isPublicKey(jwt({ role: 'anon' }))).toBe(true);
  });

  it('accepts secret and service role keys', () => {
    expect(isPublicKey('sb_secret_abc')).toBe(false);
    expect(isPublicKey(jwt({ role: 'service_role' }))).toBe(false);
  });
});
