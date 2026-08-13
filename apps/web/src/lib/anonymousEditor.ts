export const ANONYMOUS_EDITOR_STORAGE_KEY = "busu:anonymous-editor-id:v1";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type EditorStorage = Pick<Storage, "getItem" | "setItem">;

let inMemoryEditorId: string | undefined;

const getLocalStorage = (): EditorStorage | undefined => {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const createEditorId = (): string => {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("anonymous_editor_id_unavailable");
  }
  return globalThis.crypto.randomUUID();
};

/**
 * Returns a random browser-local pseudonym for abuse throttling and audit grouping.
 * It is deliberately not a credential: losing it never blocks editing or reverting.
 */
export const getAnonymousEditorId = (
  storage: EditorStorage | undefined = getLocalStorage(),
  createId: () => string = createEditorId,
): string => {
  if (storage) {
    try {
      const stored = storage.getItem(ANONYMOUS_EDITOR_STORAGE_KEY);
      if (stored && uuidPattern.test(stored)) return stored.toLowerCase();
      if (stored) inMemoryEditorId = undefined;
    } catch {
      // Fall back to a session-scoped pseudonym when storage is unavailable.
    }
  }

  if (!inMemoryEditorId) inMemoryEditorId = createId().toLowerCase();

  if (storage) {
    try {
      storage.setItem(ANONYMOUS_EDITOR_STORAGE_KEY, inMemoryEditorId);
    } catch {
      // The edit remains usable in private browsing or when storage is full.
    }
  }

  return inMemoryEditorId;
};
