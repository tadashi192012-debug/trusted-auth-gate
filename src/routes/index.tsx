import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Secure sign-in" },
      { name: "description", content: "Sign in securely with Google, protected by reCAPTCHA." },
      { property: "og:title", content: "Secure sign-in" },
      { property: "og:description", content: "Sign in securely with Google, protected by reCAPTCHA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
