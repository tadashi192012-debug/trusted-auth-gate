import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

// Public site key is served from server config so it lives next to the secret.
export const getCaptchaSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  return { siteKey: process.env["RECAPTCHA_SITE_KEY"] ?? null };
});

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "invalid" | "expired" | "reused" | "config" | "unavailable" };

const RATE_MAX = 10; // attempts
const RATE_WINDOW_S = 600; // per 10 minutes per client
const MAX_TOKEN_AGE_MS = 120_000;

export const verifyCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(20).max(4000) }).parse(d))
  .handler(async ({ data }): Promise<VerifyResult> => {
    const secret = process.env["RECAPTCHA_SECRET_KEY"];
    if (!secret) return { ok: false, reason: "config" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ip =
      getRequestHeader("cf-connecting-ip") ?? getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const clientKey = await sha256(`ip:${ip}`);

    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("captcha_rate_check", {
      _key: clientKey,
      _max: RATE_MAX,
      _window_seconds: RATE_WINDOW_S,
    });
    if (rlErr) {
      console.error("rate check failed", rlErr);
      return { ok: false, reason: "unavailable" };
    }
    if (!allowed) return { ok: false, reason: "rate_limited" };

    // Single-use: record the token hash; a conflict means it was already used.
    const tokenHash = await sha256(data.token);
    const { error: useErr } = await supabaseAdmin
      .from("captcha_used_tokens")
      .insert({ token_hash: tokenHash });
    if (useErr) {
      if (useErr.code === "23505") return { ok: false, reason: "reused" };
      console.error("token record failed", useErr);
      return { ok: false, reason: "unavailable" };
    }

    let body: {
      success: boolean;
      challenge_ts?: string;
      hostname?: string;
      "error-codes"?: string[];
    };
    try {
      const params = new URLSearchParams({ secret, response: data.token });
      if (ip !== "unknown") params.set("remoteip", ip);
      const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params,
      });
      body = await res.json();
    } catch (e) {
      console.error("siteverify unreachable", e);
      return { ok: false, reason: "unavailable" };
    }

    if (!body.success) {
      const codes = body["error-codes"] ?? [];
      if (codes.includes("timeout-or-duplicate")) return { ok: false, reason: "expired" };
      if (codes.some((c) => c.includes("secret"))) {
        console.error("reCAPTCHA secret misconfigured", codes);
        return { ok: false, reason: "config" };
      }
      return { ok: false, reason: "invalid" };
    }
    if (body.challenge_ts && Date.now() - Date.parse(body.challenge_ts) > MAX_TOKEN_AGE_MS) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true };
  });
