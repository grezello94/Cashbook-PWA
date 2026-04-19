import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { NeonCard } from "@/components/common/NeonCard";
import { countries, detectCountryPreference, findCountryByCode, normalizePhone } from "@/data/countries";
import type { SignUpInput } from "@/hooks/useAuthSession";
import { supabaseUrl } from "@/lib/supabase";

interface AuthPageProps {
  onSignIn: (email: string, password: string, staySignedIn: boolean) => Promise<void>;
  onSignUp: (input: SignUpInput, staySignedIn: boolean) => Promise<void>;
  onGoogle: (emailHint: string | undefined, staySignedIn: boolean) => Promise<void>;
  onReportError: (location: string, error: unknown, detail?: string) => void;
}

type AuthMode = "signin" | "signup";

function mapAuthError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback;
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("networkerror") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  ) {
    let host = "your Supabase auth host";
    try {
      host = new URL(supabaseUrl).host;
    } catch {
      // Keep fallback host label.
    }
    return `Cannot reach ${host}. Check firewall/VPN/DNS or try another network.`;
  }
  return raw;
}

export function AuthPage({ onSignIn, onSignUp, onGoogle, onReportError }: AuthPageProps): JSX.Element {
  const defaultCountry = useMemo(() => detectCountryPreference(), []);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [countryCode, setCountryCode] = useState(defaultCountry.code);
  const [mobile, setMobile] = useState("");

  const selectedCountry = findCountryByCode(countryCode) ?? defaultCountry;

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await onSignIn(signinEmail, signinPassword, false);
      setMessage("Signed in successfully.");
    } catch (err) {
      onReportError("AuthPage.submitSignIn", err);
      setError(mapAuthError(err, "Sign in failed."));
    } finally {
      setBusy(false);
    }
  };

  const submitSignUp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (signupPassword.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      if (signupPassword !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      const normalizedPhone = normalizePhone(selectedCountry.dialCode, mobile);
      if (!normalizedPhone) {
        throw new Error("Enter a valid mobile number.");
      }

      await onSignUp(
        {
          fullName: fullName.trim(),
          email: signupEmail,
          password: signupPassword,
          phone: normalizedPhone,
          country: selectedCountry.code,
          currency: selectedCountry.currency
        },
        false
      );

      setMessage("Account created. Check your email to verify, then sign in.");
      setMode("signin");
      setSigninEmail(signupEmail.trim());
      setSigninPassword("");
    } catch (err) {
      onReportError("AuthPage.submitSignUp", err);
      const raw = mapAuthError(err, "Sign up failed.");
      if (raw.toLowerCase().includes("already")) {
        setError("This email is already registered. Use Sign In to continue.");
      } else {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const emailHint = (mode === "signin" ? signinEmail : signupEmail).trim();
      await onGoogle(emailHint || undefined, false);
    } catch (err) {
      onReportError("AuthPage.continueWithGoogle", err);
      const raw = mapAuthError(err, "Google sign in failed.");
      if (raw.toLowerCase().includes("provider is not enabled")) {
        setError("Google login is not enabled in Supabase yet. Use email/password or enable Google provider.");
      } else {
        setError(raw);
      }
      setBusy(false);
    }
  };

  return (
    <div className="center-layout auth-page">
      <NeonCard className="max-w-xl auth-card">
        <BrandLogo className="auth-logo auth-logo-hero" />
        <div className="segment-row">
          <button
            type="button"
            className={`segment-btn ${mode === "signin" ? "segment-btn-active" : ""}`.trim()}
            onClick={() => setMode("signin")}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`segment-btn ${mode === "signup" ? "segment-btn-active" : ""}`.trim()}
            onClick={() => setMode("signup")}
          >
            Sign Up
          </button>
        </div>

        <div className="stack auth-stack" style={{ marginTop: 12 }}>
          <button className="google-btn" type="button" onClick={continueWithGoogle} disabled={busy}>
            {busy ? <span style={{ marginRight: 8, animation: "spin 1s linear infinite" }}>⏳</span> : (
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                  <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                  <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                  <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 41.939 C -8.804 40.009 -11.514 38.739 -14.754 38.739 C -19.444 38.739 -23.494 41.439 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                </g>
              </svg>
            )}
            {busy ? "Connecting..." : "Continue with Google"}
          </button>
          <div className="auth-divider" aria-hidden="true">
            <span>or use email</span>
          </div>

          {mode === "signin" && (
            <form 
              className="stack auth-form" 
              onSubmit={submitSignIn}
              style={{ opacity: busy ? 0.6 : 1, transition: "opacity 0.3s ease", pointerEvents: busy ? "none" : "auto" }}
            >
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                type="email"
                required
                value={signinEmail}
                onChange={(event) => setSigninEmail(event.target.value)}
                placeholder="you@example.com"
              />

              <label htmlFor="signin-password">Password</label>
              <input
                id="signin-password"
                type="password"
                required
                value={signinPassword}
                onChange={(event) => setSigninPassword(event.target.value)}
                placeholder="Enter password"
              />
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {mode === "signup" && (
            <form 
              className="stack auth-form" 
              onSubmit={submitSignUp}
              style={{ opacity: busy ? 0.6 : 1, transition: "opacity 0.3s ease", pointerEvents: busy ? "none" : "auto" }}
            >
              <label htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                type="text"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="John Doe"
              />

              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                required
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
                placeholder="you@example.com"
              />

              <label htmlFor="signup-country">Country</label>
              <select id="signup-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name} ({country.dialCode}) - {country.currency}
                  </option>
                ))}
              </select>

              <label htmlFor="signup-mobile">Mobile Number</label>
              <div className="phone-row">
                <span className="phone-prefix">{selectedCountry.dialCode}</span>
                <input
                  id="signup-mobile"
                  type="tel"
                  required
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  placeholder="9876543210"
                />
              </div>

              <small>Detected currency: {selectedCountry.currency}</small>

              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                required
                minLength={6}
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
                placeholder="Create password"
              />
              <label htmlFor="signup-confirm-password">Confirm Password</label>
              <input
                id="signup-confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
              />

              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? "Creating account..." : "Create Account"}
              </button>
            </form>
          )}

          {message && <small>{message}</small>}
          {error && <small className="error-text">{error}</small>}
        </div>
      </NeonCard>
    </div>
  );
}
