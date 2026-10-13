<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- CAPTCHA verification runs in a TanStack server function (src/lib/captcha.functions.ts), not a Supabase Edge Function — the stack uses createServerFn for server logic.
- reCAPTCHA keys live in server secrets (RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET_KEY); the site key is served to the browser via a server function so no code edit is needed when keys change.
- Rate limiting and single-use token tracking use service-role-only tables with RLS and no policies.
- Keep branding cleanup limited to presentation and deployment settings; preserve generated authentication integrations and error telemetry because they power sign-in and production diagnostics.
- Keep the fixed-width CAPTCHA inside a shrinkable sign-in container so small screens never overflow the page.
