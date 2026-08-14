import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtimeIncidentCategories = [
  "render_error",
  "uncaught_error",
  "unhandled_rejection",
] as const;

export type RuntimeIncidentCategory =
  (typeof runtimeIncidentCategories)[number];

export interface RuntimeIncidentInput {
  eventId: string;
  category: RuntimeIncidentCategory;
  appVersion: string;
  route: string;
}

export interface RuntimeIncidentRepository {
  report(input: RuntimeIncidentInput): Promise<void>;
}

const responseSchema = z.object({ accepted: z.literal(true) });

export class SupabaseRuntimeIncidentRepository implements RuntimeIncidentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async report(input: RuntimeIncidentInput): Promise<void> {
    const { data, error } = await this.client.functions.invoke(
      "report-runtime-incident",
      { body: input },
    );
    if (error || !responseSchema.safeParse(data).success)
      throw new Error("runtime_incident_unavailable");
  }
}

export class DisabledRuntimeIncidentRepository implements RuntimeIncidentRepository {
  async report(input: RuntimeIncidentInput): Promise<void> {
    void input;
  }
}

export function createSupabaseRuntimeIncidentRepository(
  url: string,
  publishableKey: string,
): RuntimeIncidentRepository {
  return new SupabaseRuntimeIncidentRepository(
    createClient(url, publishableKey, { auth: { persistSession: false } }),
  );
}

export function runtimeRoute(location: Location = window.location): string {
  const hashPath = location.hash.slice(1).split("?", 1)[0] || "/";
  const route = hashPath.startsWith("/") ? hashPath : location.pathname;
  if (/^\/players\/[^/]+$/u.test(route)) return "/players/:id";
  if (["/", "/search"].includes(route)) return route;
  return "/unknown";
}

export function runtimeIncidentInput(
  category: RuntimeIncidentCategory,
  appVersion: string,
  location: Location = window.location,
): RuntimeIncidentInput {
  return {
    eventId: crypto.randomUUID(),
    category,
    appVersion,
    route: runtimeRoute(location),
  };
}

export function installRuntimeIncidentListeners(
  repository: RuntimeIncidentRepository,
  appVersion: string,
  target: Window = window,
): () => void {
  const listenerKey = Symbol.for("busu.runtimeIncidentListeners");
  const stateTarget = target as Window & {
    [listenerKey]?: { uninstall: () => void };
  };
  stateTarget[listenerKey]?.uninstall();
  const report = (category: RuntimeIncidentCategory) => {
    void repository
      .report(runtimeIncidentInput(category, appVersion, target.location))
      .catch(() => undefined);
  };
  const onError = () => report("uncaught_error");
  const onUnhandledRejection = () => report("unhandled_rejection");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);
  const state = {
    uninstall: () => {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onUnhandledRejection);
      if (stateTarget[listenerKey] === state) delete stateTarget[listenerKey];
    },
  };
  stateTarget[listenerKey] = state;
  return () => {
    state.uninstall();
  };
}
