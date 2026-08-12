export interface RuntimeEnvironment {
  mode: string;
  dev: boolean;
  appMode: string | undefined;
  supabaseUrl: string | undefined;
  publishableKey: string | undefined;
  devLiveSearch: string | undefined;
  sourceRefreshEnabled: string | undefined;
}

export function resolveRuntimeFlags(environment: RuntimeEnvironment) {
  const isTestMode = environment.mode === 'test';
  const isDevLiveMode = environment.dev && !isTestMode && environment.devLiveSearch === 'true';
  const isDemoMode = isTestMode || (!isDevLiveMode && (environment.appMode === 'demo' || !environment.supabaseUrl || !environment.publishableKey));
  return {
    isDevLiveMode,
    isDemoMode,
    isSourceRefreshEnabled: !isDemoMode && environment.sourceRefreshEnabled === 'true',
  };
}
