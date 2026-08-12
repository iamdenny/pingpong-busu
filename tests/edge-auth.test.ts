import { describe, expect, it } from 'vitest';
import { hasValidPublishableApiKey } from '../supabase/functions/_shared/auth';

const request = (key?: string) => new Request('https://example.test/functions/v1/refresh-player', {
  method: 'POST',
  headers: key ? { apikey: key } : {},
});

describe('Edge Function publishable key authentication', () => {
  it('accepts a named hosted publishable key', () => {
    expect(hasValidPublishableApiKey(request('public-key'), {
      publishableKeys: JSON.stringify({ default: 'public-key' }),
    })).toBe(true);
  });

  it('accepts local and legacy public keys', () => {
    expect(hasValidPublishableApiKey(request('local-key'), { publishableKey: 'local-key' })).toBe(true);
    expect(hasValidPublishableApiKey(request('anon-key'), { legacyAnonKey: 'anon-key' })).toBe(true);
  });

  it('rejects missing, unknown, or malformed key configuration', () => {
    expect(hasValidPublishableApiKey(request(), { publishableKeys: '{broken' })).toBe(false);
    expect(hasValidPublishableApiKey(request('wrong-key'), { publishableKeys: JSON.stringify({ default: 'public-key' }) })).toBe(false);
  });
});
