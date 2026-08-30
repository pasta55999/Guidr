import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Content-Type": "application/json",
    ...(allowed
      ? {
          "Access-Control-Allow-Origin": allowed,
          Vary: "Origin",
        }
      : {}),
  };
}

/**
 * Mints an ephemeral OpenAI Realtime token for the browser.
 *
 * The permanent OPENAI_API_KEY never leaves this deployment, and only
 * { value, expiresAt, model } is returned — never OpenAI's full response.
 *
 * Requires a real, active sessionId so a scraped URL alone is not a free-token
 * faucet. This is a deliberate lightweight guard, not authentication: this MVP
 * has no user accounts.
 */
const token = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);

  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as { sessionId?: string };
    sessionId = body.sessionId;
  } catch {
    return new Response(JSON.stringify({ error: "Expected JSON body" }), {
      status: 400,
      headers,
    });
  }

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers,
    });
  }

  let active = false;
  try {
    active = await ctx.runQuery(api.sessions.exists, {
      sessionId: sessionId as Id<"sessions">,
    });
  } catch {
    active = false;
  }

  if (!active) {
    return new Response(
      JSON.stringify({ error: "Unknown or inactive session" }),
      { status: 403, headers },
    );
  }

  try {
    const minted = await ctx.runAction(internal.realtime.mintClientSecret, {});
    return new Response(JSON.stringify(minted), { status: 200, headers });
  } catch (error) {
    console.error("token mint failed", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Token mint failed",
      }),
      { status: 502, headers },
    );
  }
});

const preflight = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
});

const http = httpRouter();
http.route({ path: "/realtime/token", method: "POST", handler: token });
http.route({ path: "/realtime/token", method: "OPTIONS", handler: preflight });

export default http;
