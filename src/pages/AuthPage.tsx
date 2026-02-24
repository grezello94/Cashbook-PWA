import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { NeonCard } from "@/components/common/NeonCard";
import { countries, detectCountryPreference, findCountryByCode, normalizePhone } from "@/data/countries";
import type { SignUpInput } from "@/hooks/useAuthSession";
import { getRememberSessionPreference, setRememberSessionPreference, supabaseUrl } from "@/lib/supabase";

interface AuthPageProps {
  onSignIn: (email: string, password: string, staySignedIn: boolean) => Promise<void>;
  onSignUp: (input: SignUpInput, staySignedIn: boolean) => Promise<void>;
  onGoogle: (emailHint: string | undefined, staySignedIn: boolean) => Promise<void>;
}

type AuthMode = "signin" | "signup";
const OAUTH_LAST_ERROR_KEY = "cashbook:oauth-last-error";
const OAUTH_ERROR_MAX_AGE_MS = 2 * 60 * 1000;

interface OAuthLastErrorPayload {
  message: string;
  createdAt: number;
}

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

export function AuthPage({ onSignIn, onSignUp, onGoogle }: AuthPageProps): JSX.Element {
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
  const [staySignedIn, setStaySignedIn] = useState<boolean>(() => getRememberSessionPreference());

  const selectedCountry = findCountryByCode(countryCode) ?? defaultCountry;
  const handleStaySignedInChange = (checked: boolean) => {
    setStaySignedIn(checked);
    setRememberSessionPreference(checked);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.sessionStorage.getItem(OAUTH_LAST_ERROR_KEY);
    if (!raw) {
      return;
    }

    let message = "";
    let createdAt = 0;
    try {
      const parsed = JSON.parse(raw) as Partial<OAuthLastErrorPayload>;
      message = typeof parsed.message === "string" ? parsed.message : "";
      createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    } catch {
      // Legacy plain-string values should be auto-cleared and not re-shown.
      message = "";
      createdAt = 0;
    }

    if (message && createdAt && Date.now() - createdAt <= OAUTH_ERROR_MAX_AGE_MS) {
      setError(message);
    }
    window.sessionStorage.removeItem(OAUTH_LAST_ERROR_KEY);
  }, []);

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await onSignIn(signinEmail, signinPassword, staySignedIn);
      setMessage("Signed in successfully.");
    } catch (err) {
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
        staySignedIn
      );

      setMessage("Account created. Check your email to verify, then sign in.");
      setMode("signin");
      setSigninEmail(signupEmail.trim());
      setSigninPassword("");
    } catch (err) {
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
      await onGoogle(emailHint || undefined, staySignedIn);
    } catch (err) {
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
            Continue with Google
          </button>
          <div className="auth-divider" aria-hidden="true">
            <span>or use email</span>
          </div>

          {mode === "signin" && (
            <form className="stack auth-form" onSubmit={submitSignIn}>
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

              <label className="auth-remember-row" htmlFor="stay-signed-in">
                <input
                  id="stay-signed-in"
                  className="auth-remember-input"
                  type="checkbox"
                  checked={staySignedIn}
                  onChange={(event) => handleStaySignedInChange(event.target.checked)}
                />
                <span>Stay signed in on this device</span>
              </label>

              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {mode === "signup" && (
            <form className="stack auth-form" onSubmit={submitSignUp}>
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

              <label className="auth-remember-row" htmlFor="stay-signed-in-signup">
                <input
                  id="stay-signed-in-signup"
                  className="auth-remember-input"
                  type="checkbox"
                  checked={staySignedIn}
                  onChange={(event) => handleStaySignedInChange(event.target.checked)}
                />
                <span>Stay signed in on this device</span>
              </label>

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
