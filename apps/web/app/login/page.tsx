"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign-in only — there is deliberately no sign-up.
 *
 * This is a single-operator tool sitting on top of other people's contact
 * details. Accounts are created by hand in the Supabase dashboard, so an open
 * registration form cannot quietly hand someone else the board.
 */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/startups");
    router.refresh();
  }

  return (
    <main className="login">
      <div className="card">
        <h1>gigpull</h1>
        <p>Private board. Sign in to continue.</p>
        <form onSubmit={onSubmit}>
          <input
            type="email" placeholder="email" value={email} required
            autoComplete="username" onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password" placeholder="password" value={password} required
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          {error && <p className="error">{error}</p>}
        </form>
        <p className="note">
          Holds contact details for real businesses and founders. Keep it to yourself.
        </p>
      </div>
    </main>
  );
}
