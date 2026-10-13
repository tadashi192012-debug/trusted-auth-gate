# Trusted Auth Gate

Build a professional login page with Google OAuth and CAPTCHA verification.

Stack: React + Vite + TypeScript, Tailwind CSS, Supabase Auth (Google OAuth only), Google reCAPTCHA v2 checkbox, Supabase Edge Function for server-side CAPTCHA verification.

Auth requirements:
- Google Sign-In button as the ONLY auth method. No email/password, no magic links, no other providers.
- Use Supabase Auth's Google OAuth integration, redirecting to Google's official consent flow.
- Handle successful login, cancellation, and auth errors.
- Secure session management via Supabase's supported session handling.
- Logout button for authenticated users.
- Redirect unauthenticated users away from protected pages.

CAPTCHA requirements:
- Google reCAPTCHA v2 "I'm not a robot" checkbox, shown before the Google Sign-In button.
- Keep the Google Sign-In button disabled until CAPTCHA verification succeeds.
- Support the image challenge if reCAPTCHA presents one.
- Send the CAPTCHA response token to a server-side Supabase Edge Function.
- Verify the token using Google's official siteverify endpoint from the edge function (never from the frontend).
- Only start the Google OAuth flow after successful server-side CAPTCHA verification.
- Reject expired, invalid, or reused tokens, and reset the CAPTCHA widget after failure/expiry.
- Never expose the reCAPTCHA secret key in frontend code.

Supabase setup:
- Enable Google as the only auth provider.
- Store the reCAPTCHA secret key server-side only (Supabase secrets), never in frontend code.
- Use the Supabase publishable key in the frontend only; never expose the service-role key to the browser.
- Use Row Level Security for any user-specific tables.

UI/UX: premium, modern, responsive (desktop + mobile). Clear Google-branded sign-in button following Google's branding guidelines. Visible CAPTCHA state, loading indicators during verification/sign-in, helpful error messages with retry, accessible (keyboard nav, contrast). Avoid unnecessary animation/clutter.

Security: always verify CAPTCHA server-side, never trust frontend-only success. Validate OAuth redirect destinations. Rate-limit the CAPTCHA verification endpoint. Don't treat CAPTCHA as a substitute for real auth/rate limiting.

No mock auth and no fake/simulated CAPTCHA verification — this needs to be a real, working implementation end to end.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b8e38e82-a48e-476a-bc76-43602ac955e4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
