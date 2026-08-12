import { describe, expect, it } from 'vitest';
import { resolveRuntimeFlags } from './runtimeConfig';

describe('resolveRuntimeFlags', () => {
  it('enables Edge Function refresh only for a configured production repository', () => {
    expect(resolveRuntimeFlags({
      mode: 'production',
      dev: false,
      appMode: 'production',
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public-key',
      devLiveSearch: undefined,
      sourceRefreshEnabled: 'true',
    })).toEqual({ isDevLiveMode: false, isDemoMode: false, isSourceRefreshEnabled: true });
  });

  it('keeps refresh disabled when public Supabase configuration is missing', () => {
    expect(resolveRuntimeFlags({
      mode: 'production',
      dev: false,
      appMode: undefined,
      supabaseUrl: undefined,
      publishableKey: undefined,
      devLiveSearch: undefined,
      sourceRefreshEnabled: 'true',
    }))
      .toEqual({ isDevLiveMode: false, isDemoMode: true, isSourceRefreshEnabled: false });
  });
});
