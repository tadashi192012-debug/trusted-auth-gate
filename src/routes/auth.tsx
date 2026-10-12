import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getCaptchaSiteKey, verifyCaptcha } from "@/lib/captcha.functions";

const NEXT_KEY = "auth:next";

// Only same-origin relative paths are accepted as post-login destinations.
function safeNext(v: unknown): string {
  if (typeof v !== "string") return "/dashboard";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.startsWith("/auth")) {
    return "/dashboard";
  }
  return v;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: z.object({ next: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Keystone" },
      { name: "description", content: "Verify you're human, then continue with Google." },
      { property: "og:title", content: "Sign in — Keystone" },
      { property: "og:description", content: "Verify you're human, then continue with Google." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Grecaptcha = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => number;
  reset: (id?: number) => void;
};
declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    __onRecaptchaLoad?: () => void;
  }
}

type CaptchaState = "loading" | "ready" | "verifying" | "verified" | "error";

const REASONS = {
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  invalid: "We couldn't verify the CAPTCHA. Please try again.",
  expired: "The verification expired. Please check the box again.",
  reused: "That verification was already used. Please check the box again.",
  config: "Verification isn't configured correctly yet. Please contact the site owner.",
  unavailable: "Verification service is unavailable. Please try again shortly.",
} as const;

const VERIFIED_TTL_MS = 90_000;

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fetchSiteKey = useServerFn(getCaptchaSiteKey);
  const verify = useServerFn(verifyCaptcha);

  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const expiryTimer = useRef<number | null>(null);

  const [captcha, setCaptcha] = useState<CaptchaState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [siteKeyMissing, setSiteKeyMissing] = useState(false);

  const resetWidget = useCallback(() => {
    if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
    if (widgetId.current !== null) window.grecaptcha?.reset(widgetId.current);
  }, []);

  // Persist validated destination; bounce already-signed-in users.
  useEffect(() => {
    if (search.next) sessionStorage.setItem(NEXT_KEY, safeNext(search.next));
    const goNext = () => {
      const next = safeNext(sessionStorage.getItem(NEXT_KEY));
      sessionStorage.removeItem(NEXT_KEY);
      navigate({ to: next, replace: true });
    };
    supabase.auth.getUser().then(({ data }) => data.user && goNext());
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") goNext();
    });

    // OAuth errors returned via URL (e.g. user cancelled consent).
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const desc = params.get("error_description") ?? params.get("error");
    if (desc) {
      setError(
        /denied|cancel/i.test(desc)
          ? "Google sign-in was cancelled. You can try again whenever you're ready."
          : `Sign-in failed: ${desc.replace(/\+/g, " ")}`,
      );
    }
    return () => sub.subscription.unsubscribe();
  }, [navigate, search.next]);

  // Load and render reCAPTCHA v2 checkbox (supports image challenges natively).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { siteKey } = await fetchSiteKey();
      if (cancelled) return;
      if (!siteKey) {
        setSiteKeyMissing(true);
        setCaptcha("error");
        return;
      }
      const render = () => {
        if (!boxRef.current || !window.grecaptcha || widgetId.current !== null) return;
        widgetId.current = window.grecaptcha.render(boxRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: async (token: string) => {
            setError(null);
            setCaptcha("verifying");
            try {
              const res = await verify({ data: { token } });
              if (res.ok) {
                setCaptcha("verified");
                expiryTimer.current = window.setTimeout(() => {
                  setCaptcha("ready");
                  setError(REASONS.expired);
                  resetWidget();
                }, VERIFIED_TTL_MS);
              } else {
                setCaptcha("ready");
                setError(REASONS[res.reason]);
                resetWidget();
              }
            } catch {
              setCaptcha("ready");
              setError(REASONS.unavailable);
              resetWidget();
            }
          },
          "expired-callback": () => {
            setCaptcha("ready");
            setError(REASONS.expired);
          },
          "error-callback": () => {
            setCaptcha("error");
            setError("reCAPTCHA couldn't load. Check your connection and retry.");
          },
        });
        setCaptcha("ready");
      };
      if (window.grecaptcha?.render) return render();
      window.__onRecaptchaLoad = render;
      if (!document.getElementById("recaptcha-script")) {
        const s = document.createElement("script");
        s.id = "recaptcha-script";
        s.src = "https://www.google.com/recaptcha/api.js?onload=__onRecaptchaLoad&render=explicit";
        s.async = true;
        s.defer = true;
        s.onerror = () => {
          setCaptcha("error");
          setError("reCAPTCHA couldn't load. Check your connection and retry.");
        };
        document.head.appendChild(s);
      }
    })();
    return () => {
      cancelled = true;
      if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
    };
  }, [fetchSiteKey, verify, resetWidget]);

  async function signIn() {
    if (captcha !== "verified") return;
    setSigningIn(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
      extraParams: { prompt: "select_account" },
    });
    if (result.redirected) return;
    setSigningIn(false);
    if (result.error) {
      const msg = result.error.message ?? "";
      setError(
        /cancel|closed|denied/i.test(msg)
          ? "Google sign-in was cancelled. Verify again to retry."
          : "Google sign-in failed. Please verify again and retry.",
      );
      setCaptcha("ready");
      resetWidget();
    }
    // On success, onAuthStateChange navigates.
  }

  const statusText: Record<CaptchaState, string> = {
    loading: "Loading verification…",
    ready: "Complete the check to continue",
    verifying: "Verifying with server…",
    verified: "Verified — you can continue",
    error: siteKeyMissing ? "Verification not configured" : "Verification unavailable",
  };

  return (
    <main className="auth-canvas grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl tracking-tight">Keystone</span>
        </div>
        <section className="panel p-7 sm:p-9" aria-labelledby="signin-title">
          <h1 id="signin-title" className="font-display text-3xl leading-tight">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            First confirm you're human, then continue with your Google account.
          </p>

          <ol className="mt-8 space-y-6">
            <li>
              <StepLabel n={1} done={captcha === "verified"}>
                Verify
              </StepLabel>
              <div className="mt-3 min-h-[78px] overflow-x-auto">
                <div ref={boxRef} />
                {captcha === "loading" && <div className="skeleton h-[78px] w-[304px]" />}
              </div>
              <p
                role="status"
                aria-live="polite"
                className={`mt-2 flex items-center gap-2 text-xs ${
                  captcha === "verified" ? "text-success" : "text-muted-foreground"
                }`}
              >
                {(captcha === "verifying" || captcha === "loading") && <span className="spinner" aria-hidden />}
                {statusText[captcha]}
              </p>
            </li>
            <li>
              <StepLabel n={2} done={false}>
                Continue
              </StepLabel>
              <button
                type="button"
                onClick={signIn}
                disabled={captcha !== "verified" || signingIn}
                className="gsi-button mt-3"
                aria-describedby="gsi-hint"
              >
                {signingIn ? <span className="spinner" aria-hidden /> : <GoogleG />}
                <span>{signingIn ? "Opening Google…" : "Sign in with Google"}</span>
              </button>
              <p id="gsi-hint" className="sr-only">
                Enabled after verification succeeds.
              </p>
            </li>
          </ol>

          {error && (
            <div role="alert" className="alert mt-6">
              <p>{error}</p>
              {captcha === "error" && !siteKeyMissing && (
                <button className="mt-2 underline underline-offset-2" onClick={() => window.location.reload()}>
                  Retry
                </button>
              )}
            </div>
          )}
          {siteKeyMissing && !error && (
            <div role="alert" className="alert mt-6">
              reCAPTCHA keys haven't been added yet.
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by reCAPTCHA. Google{" "}
          <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>{" "}
          &{" "}
          <a className="underline" href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
            Terms
          </a>{" "}
          apply.
        </p>
      </div>
    </main>
  );
}

function StepLabel({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium">
      <span className={`step-dot ${done ? "step-dot-done" : ""}`} aria-hidden>
        {done ? "✓" : n}
      </span>
      {children}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
