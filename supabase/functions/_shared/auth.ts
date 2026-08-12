import { isRecord } from './normalize.ts';

export interface FunctionAuthEnvironment {
  publishableKeys?: string;
  publishableKey?: string;
  legacyAnonKey?: string;
}

function parsePublishableKeyMap(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return [];
    return Object.values(parsed).filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
}

export function hasValidPublishableApiKey(request: Request, environment: FunctionAuthEnvironment): boolean {
  const provided = request.headers.get('apikey');
  if (!provided) return false;
  const allowed = [
    ...parsePublishableKeyMap(environment.publishableKeys),
    environment.publishableKey,
    environment.legacyAnonKey,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return allowed.includes(provided);
}
