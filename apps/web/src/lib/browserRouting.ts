export function routerBasename(baseUrl: string): string {
  const normalized = `/${baseUrl}`.replace(/\/{2,}/gu, "/").replace(/\/$/u, "");
  return normalized || "/";
}

export function legacyHashDestination(
  hash: string,
  baseUrl: string,
): string | undefined {
  if (!hash.startsWith("#/")) return undefined;
  const basename = routerBasename(baseUrl);
  const route = hash.slice(1);
  return basename === "/" ? route : `${basename}${route}`;
}

export function migrateLegacyHashRoute(
  baseUrl: string = import.meta.env.BASE_URL,
): void {
  const destination = legacyHashDestination(window.location.hash, baseUrl);
  if (!destination) return;
  window.history.replaceState(window.history.state, "", destination);
}
