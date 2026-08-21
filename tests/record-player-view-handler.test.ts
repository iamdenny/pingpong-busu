import { describe, expect, it, vi } from "vitest";
import {
  createRecordPlayerViewHandler,
  type RecordPlayerViewRpc,
} from "../supabase/functions/record-player-view/handler";

const playerId = "123e4567-e89b-42d3-a456-426614174000";

const environment = {
  publishableKey: "public-key",
  playerViewAllowedOrigins: "https://busu.example,http://localhost:5173",
  originSecret: "service-role-key",
};

function request(
  body: unknown = { playerId },
  headers: Record<string, string> = {},
) {
  return new Request(
    "https://project.supabase.co/functions/v1/record-player-view",
    {
      method: "POST",
      headers: {
        apikey: "public-key",
        "content-type": "application/json",
        origin: "https://busu.example",
        "cf-connecting-ip": "203.0.113.9",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

function handlerWith(rpc: RecordPlayerViewRpc) {
  return createRecordPlayerViewHandler({
    environment,
    rpc,
    hashOrigin: async () => "a".repeat(64),
  });
}

describe("record-player-view handler", () => {
  it("forwards only the player id and an origin hash to the private RPC", async () => {
    const rpc = vi.fn<RecordPlayerViewRpc>().mockResolvedValue({});
    const response = await handlerWith(rpc)(request());

    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("record_player_view_internal", {
      p_public_id: playerId,
      p_origin_hash: "a".repeat(64),
    });
    const [, parameters] = rpc.mock.calls[0] ?? [];
    expect(JSON.stringify(parameters)).not.toContain("203.0.113.9");
  });

  it("rejects an unknown origin and a missing publishable key", async () => {
    const rpc = vi.fn<RecordPlayerViewRpc>().mockResolvedValue({});
    const handler = handlerWith(rpc);

    expect(
      (await handler(request({ playerId }, { origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect(
      (await handler(request({ playerId }, { apikey: "wrong-key" }))).status,
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses anything other than a bare player id", async () => {
    const rpc = vi.fn<RecordPlayerViewRpc>().mockResolvedValue({});
    const handler = handlerWith(rpc);

    for (const body of [
      { playerId: "김탁구" },
      { playerId, query: "김탁구 용인" },
      { playerId: `${playerId} ` },
      {},
    ])
      expect((await handler(request(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never fails the caller when the counter is unavailable", async () => {
    const rpc = vi
      .fn<RecordPlayerViewRpc>()
      .mockResolvedValue({ error: { message: "server_not_configured" } });
    const response = await handlerWith(rpc)(request());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ code: "not_recorded" });
  });

  it("only accepts POST", async () => {
    const rpc = vi.fn<RecordPlayerViewRpc>().mockResolvedValue({});
    const response = await handlerWith(rpc)(
      new Request(
        "https://project.supabase.co/functions/v1/record-player-view",
        { method: "GET", headers: { apikey: "public-key" } },
      ),
    );

    expect(response.status).toBe(405);
  });
});
