import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard" },
      { name: "description", content: "Your signed-in account." },
      { property: "og:title", content: "Dashboard" },
      { property: "og:description", content: "Your signed-in account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const meta = user.user_metadata as { full_name?: string; avatar_url?: string };

  async function signOut() {
    setBusy(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="auth-canvas min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <span className="font-display text-xl">Account</span>
          <button onClick={signOut} disabled={busy} className="btn-outline">
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </header>
        <section className="panel mt-12 p-8">
          <div className="flex items-center gap-4">
            {meta.avatar_url ? (
              <img src={meta.avatar_url} alt="" className="h-14 w-14 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-full bg-secondary font-display text-xl">
                {(meta.full_name ?? user.email ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <h1 className="font-display text-2xl">{meta.full_name ?? user.email}</h1>
              {meta.full_name && <p className="text-sm text-muted-foreground">{user.email}</p>}
            </div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            This page is only visible to signed-in users. Signed-out visitors are sent to the sign-in page.
          </p>
        </section>
      </div>
    </main>
  );
}
