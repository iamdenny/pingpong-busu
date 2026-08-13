import type { PlayerRepository } from "./repository";
import { DemoPlayerRepository } from "../demo/DemoPlayerRepository";
import { createSupabaseRepository } from "./SupabasePlayerRepository";
import { DevLivePlayerRepository } from "./DevLivePlayerRepository";
import { resolveRuntimeFlags } from "./runtimeConfig";
import {
  createSupabaseFeedbackRepository,
  DemoFeedbackRepository,
  type FeedbackRepository,
} from "./feedback-repository";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const { isDevLiveMode, isDemoMode, isSourceRefreshEnabled } =
  resolveRuntimeFlags({
    mode: import.meta.env.MODE,
    dev: import.meta.env.DEV,
    appMode: import.meta.env.VITE_APP_MODE,
    supabaseUrl: url,
    publishableKey,
    devLiveSearch: import.meta.env.VITE_DEV_LIVE_SEARCH,
    sourceRefreshEnabled: import.meta.env.VITE_SOURCE_REFRESH_ENABLED,
  });
export const playerRepository: PlayerRepository = isDevLiveMode
  ? new DevLivePlayerRepository()
  : url && publishableKey && !isDemoMode
    ? createSupabaseRepository(url, publishableKey)
    : new DemoPlayerRepository();

export const feedbackRepository: FeedbackRepository =
  url && publishableKey && !isDemoMode && !isDevLiveMode
    ? createSupabaseFeedbackRepository(url, publishableKey)
    : new DemoFeedbackRepository();
