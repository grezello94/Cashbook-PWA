import { useMemo, useState, type FormEvent } from "react";
import { NeonCard } from "@/components/common/NeonCard";
import { countries, detectCountryPreference, findCountryByCode, normalizePhone } from "@/data/countries";

interface ProfileSetupPageProps {
  defaultName: string;
  loading: boolean;
  onSave: (input: { fullName: string; phone: string; country: string; currency: string }) => Promise<void>;
}

export function ProfileSetupPage({ defaultName, loading, onSave }: ProfileSetupPageProps): JSX.Element {
  const preferred = useMemo(() => detectCountryPreference(), []);

  const [fullName, setFullName] = useState(defaultName);
  const [countryCode, setCountryCode] = useState(preferred.code);
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");

  const country = findCountryByCode(countryCode) ?? preferred;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const phone = normalizePhone(country.dialCode, mobile);
    if (!phone) {
      setError("Enter a valid phone number.");
      return;
    }

    try {
      await onSave({
        fullName: fullName.trim(),
        phone,
        country: country.code,
        currency: country.currency
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    }
  };

  return (
    <div className="center-layout">
      <NeonCard title="Complete Profile" subtitle="Required before workspace access" className="max-w-xl">
        <form className="stack" onSubmit={submit}>
          <label htmlFor="profile-name">Full Name</label>
          <input
            id="profile-name"
            type="text"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="John Doe"
          />

          <label htmlFor="profile-country">Country</label>
          <select id="profile-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name} ({item.dialCode}) - {item.currency}
              </option>
            ))}
          </select>

          <label htmlFor="profile-phone">Mobile Number</label>
          <div className="phone-row">
            <span className="phone-prefix">{country.dialCode}</span>
            <input
              id="profile-phone"
              type="tel"
              required
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              placeholder="9876543210"
            />
          </div>

          <small>Default currency set to {country.currency} for workspace onboarding.</small>

          {error && <small className="error-text">{error}</small>}

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save and Continue"}
          </button>
        </form>
      </NeonCard>
    </div>
  );
}
