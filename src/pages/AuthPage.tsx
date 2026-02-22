import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { NeonCard } from "@/components/common/NeonCard";
import { countries, detectCountryPreference, findCountryByCode, normalizePhone } from "@/data/countries";
import type { SignUpInput } from "@/hooks/useAuthSession";

interface AuthPageProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (input: SignUpInput) => Promise<void>;
  onGoogle: (emailHint?: string) => Promise<void>;
}

type AuthMode = "signin" | "signup";
const OAUTH_LAST_ERROR_KEY = "cashbook:oauth-last-error";

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

  const selectedCountry = findCountryByCode(countryCode) ?? defaultCountry;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedError = window.sessionStorage.getItem(OAUTH_LAST_ERROR_KEY);
    if (!storedError) {
      return;
    }
    setError(storedError);
    window.sessionStorage.removeItem(OAUTH_LAST_ERROR_KEY);
  }, []);

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await onSignIn(signinEmail, signinPassword);
      setMessage("Signed in successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
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

      await onSignUp({
        fullName: fullName.trim(),
        email: signupEmail,
        password: signupPassword,
        phone: normalizedPhone,
        country: selectedCountry.code,
        currency: selectedCountry.currency
      });

      setMessage("Account created. Check your email to verify, then sign in.");
      setMode("signin");
      setSigninEmail(signupEmail.trim());
      setSigninPassword("");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Sign up failed.";
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
      await onGoogle(emailHint || undefined);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Google sign in failed.";
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
