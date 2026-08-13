import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { createSubmitFeedbackHandler, type FeedbackRpc } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const rpc: FeedbackRpc = async (name, parameters) => {
  if (!supabaseUrl || !serviceRoleKey) {
    return { data: null, error: { message: "server_not_configured" } };
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.rpc(name, parameters);
  return {
    data,
    ...(error ? { error: { message: error.message } } : {}),
  };
};

const handler = createSubmitFeedbackHandler({
  environment: {
    publishableKeys: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    publishableKey: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    legacyAnonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    serviceRoleKey,
    githubRepository: Deno.env.get("GITHUB_ISSUES_REPOSITORY"),
    githubToken: Deno.env.get("GITHUB_ISSUES_TOKEN"),
    feedbackAllowedOrigins: Deno.env.get("FEEDBACK_ALLOWED_ORIGINS"),
  },
  rpc,
  fetch,
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const response = await handler(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders))
    headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
});
