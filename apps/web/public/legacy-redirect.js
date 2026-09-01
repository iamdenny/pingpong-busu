export const LEGACY_BUSU_HOST = "busu.iamdenny.com";
export const BUSU_DESTINATION_ORIGIN = "https://modutt.kr";

function routeFromLegacyHash(hash) {
  const match = /^#(\/[^?#]*)(\?[^#]*)?$/u.exec(hash);
  if (!match) return undefined;
  return {
    pathname: match[1] || "/",
    search: match[2] || "",
  };
}

function stripLegacyNamespace(pathname) {
  if (pathname === "/busu" || pathname === "/busu/") return "/";
  if (pathname.startsWith("/busu/")) return pathname.slice("/busu".length);
  return pathname || "/";
}

function destinationPath(pathname) {
  const legacyPath = stripLegacyNamespace(pathname);
  if (/^\/(?:sitemap\.xml|robots\.txt|llms\.txt)$/u.test(legacyPath))
    return legacyPath;

  const trimmed =
    legacyPath === "/" ? "/" : legacyPath.replace(/\/+$/u, "") || "/";
  const requiresTrailingSlash =
    trimmed === "/search" ||
    trimmed === "/guide" ||
    /^\/(?:players\/[^/]+|directory(?:\/.*)?)$/u.test(trimmed);
  const normalized = requiresTrailingSlash ? `${trimmed}/` : trimmed;
  return normalized === "/" ? "/busu/" : `/busu${normalized}`;
}

export function legacyRedirectDestination(location) {
  if (location.hostname.toLowerCase() !== LEGACY_BUSU_HOST) return undefined;
  const route = routeFromLegacyHash(location.hash) ?? {
    pathname: location.pathname,
    search: location.search,
  };
  return `${BUSU_DESTINATION_ORIGIN}${destinationPath(route.pathname)}${route.search}`;
}

export function redirectLegacyHost(location, replace) {
  const destination = legacyRedirectDestination(location);
  if (!destination) return false;
  replace(destination);
  return true;
}

if (typeof window !== "undefined")
  redirectLegacyHost(window.location, (destination) =>
    window.location.replace(destination),
  );
