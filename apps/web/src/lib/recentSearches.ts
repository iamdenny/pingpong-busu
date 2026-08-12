export const RECENT_SEARCHES_STORAGE_KEY = "busu:recent-searches:v1";
export const MAX_RECENT_SEARCHES = 10;

const MAX_RECENT_SEARCH_LENGTH = 100;

type RecentSearchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getLocalStorage = (): RecentSearchStorage | undefined => {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const normalizeRecentSearch = (query: string): string =>
  query.normalize("NFKC").trim().replace(/\s+/g, " ");

const parseRecentSearches = (storedValue: string | null): string[] => {
  if (!storedValue) return [];

  try {
    const value: unknown = JSON.parse(storedValue);
    if (!Array.isArray(value)) return [];

    const searches: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") continue;

      const normalized = normalizeRecentSearch(item);
      if (
        !normalized ||
        normalized.length > MAX_RECENT_SEARCH_LENGTH ||
        searches.includes(normalized)
      ) {
        continue;
      }

      searches.push(normalized);
      if (searches.length === MAX_RECENT_SEARCHES) break;
    }

    return searches;
  } catch {
    return [];
  }
};

export const loadRecentSearches = (
  storage: RecentSearchStorage | undefined = getLocalStorage(),
): string[] => {
  if (!storage) return [];

  try {
    return parseRecentSearches(storage.getItem(RECENT_SEARCHES_STORAGE_KEY));
  } catch {
    return [];
  }
};

export const rememberRecentSearch = (
  query: string,
  storage: RecentSearchStorage | undefined = getLocalStorage(),
): string[] => {
  const normalized = normalizeRecentSearch(query);
  const current = loadRecentSearches(storage);
  if (!normalized || normalized.length > MAX_RECENT_SEARCH_LENGTH) {
    return current;
  }

  const next = [
    normalized,
    ...current.filter((item) => item !== normalized),
  ].slice(0, MAX_RECENT_SEARCHES);

  if (!storage) return next;

  try {
    storage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private browsing or when its quota is full.
  }

  return next;
};

export const clearRecentSearches = (
  storage: RecentSearchStorage | undefined = getLocalStorage(),
): void => {
  if (!storage) return;

  try {
    storage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
    // The search flow remains usable even if browser storage is unavailable.
  }
};
