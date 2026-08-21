import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { hashRequestOrigin } from "../_shared/request-origin.ts";
import {
  createRecordPlayerViewHandler,
  type RecordPlayerViewRpc,
} from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const rpc: RecordPlayerViewRpc = async (name, parameters) => {
  if (!supabaseUrl || !serviceRoleKey)
    return { error: { message: "server_not_configured" } };
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await client.rpc(name, parameters);
  return error ? { error: { message: error.message } } : {};
};

const handler = createRecordPlayerViewHandler({
  environment: {
    publishableKeys: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    publishableKey: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    legacyAnonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    playerViewAllowedOrigins:
      Deno.env.get("PLAYER_VIEW_ALLOWED_ORIGINS") ??
      Deno.env.get("FEEDBACK_ALLOWED_ORIGINS"),
    originSecret: serviceRoleKey,
  },
  rpc,
  hashOrigin: (request, secret) =>
    hashRequestOrigin(request, secret, "player-view-origin"),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const response = await handler(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders))
    headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
});
