"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/live";

interface DemoAccount {
  name: string;
  role: string;
  phone: string;
}

export function LoginApp({ next, denied, demoAccounts }: { next?: string; denied: boolean; demoAccounts: DemoAccount[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [demoCode, setDemoCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const sendCode = async (value = phone) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await postJson<{ demoCode?: string }>("/api/auth/otp", { phone: value });
      setPhone(value);
      setDemoCode(res.demoCode);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await postJson<{ home: string }>("/api/auth/verify", { phone, code });
      router.replace(next ?? res.home);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <main id="main" className="home">
      <section className="card login">
        <p className="eyebrow">
          <Link href="/">TableTap</Link> · staff and owner
        </p>
        <h1>Sign in</h1>
        {denied ? (
          <p className="notice notice--warn" role="status">
            Your role cannot open that screen. Sign in with another account.
          </p>
        ) : null}
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        {step === "phone" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <label className="field">
              <span>Mobile number</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn btn--wide" disabled={busy || phone.trim().length < 10}>
              Send code
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p className="muted">We sent a 6-digit code to {phone}.</p>
            {demoCode ? (
              <p className="notice notice--ok" role="status">
                Demo code: <strong className="otp">{demoCode}</strong> (shown because this is a demo; no SMS is sent)
              </p>
            ) : (
              <p className="muted small">If this number belongs to a staff account, a code is on its way.</p>
            )}
            <label className="field">
              <span>Code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </label>
            <button type="submit" className="btn btn--wide" disabled={busy || code.length !== 6}>
              Sign in
            </button>
            <button type="button" className="link-button" onClick={() => setStep("phone")}>
              Use another number
            </button>
          </form>
        )}
      </section>

      <section className="card" aria-labelledby="demo-accounts">
        <h2 id="demo-accounts">Demo accounts</h2>
        <p className="muted">Made-up staff of the demo restaurant. Tap one to get a code.</p>
        <ul className="list">
          {demoAccounts.map((a) => (
            <li key={a.phone} className="list-row">
              <span>
                <strong>{a.role}</strong> · {a.name}
                <span className="muted"> · {a.phone}</span>
              </span>
              <button type="button" className="btn btn--small btn--ghost" disabled={busy} onClick={() => sendCode(a.phone)}>
                Sign in as {a.role.toLowerCase()}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
