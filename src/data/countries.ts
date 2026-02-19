export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  currency: string;
}

export const countries: CountryOption[] = [
  { code: "US", name: "United States", dialCode: "+1", currency: "USD" },
  { code: "CA", name: "Canada", dialCode: "+1", currency: "CAD" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", currency: "GBP" },
  { code: "IN", name: "India", dialCode: "+91", currency: "INR" },
  { code: "AU", name: "Australia", dialCode: "+61", currency: "AUD" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", currency: "AED" },
  { code: "SG", name: "Singapore", dialCode: "+65", currency: "SGD" },
  { code: "MY", name: "Malaysia", dialCode: "+60", currency: "MYR" },
  { code: "ZA", name: "South Africa", dialCode: "+27", currency: "ZAR" },
  { code: "DE", name: "Germany", dialCode: "+49", currency: "EUR" },
  { code: "FR", name: "France", dialCode: "+33", currency: "EUR" },
  { code: "IT", name: "Italy", dialCode: "+39", currency: "EUR" },
  { code: "ES", name: "Spain", dialCode: "+34", currency: "EUR" },
  { code: "NL", name: "Netherlands", dialCode: "+31", currency: "EUR" },
  { code: "BR", name: "Brazil", dialCode: "+55", currency: "BRL" },
  { code: "MX", name: "Mexico", dialCode: "+52", currency: "MXN" },
  { code: "JP", name: "Japan", dialCode: "+81", currency: "JPY" },
  { code: "KR", name: "South Korea", dialCode: "+82", currency: "KRW" },
  { code: "ID", name: "Indonesia", dialCode: "+62", currency: "IDR" },
  { code: "PH", name: "Philippines", dialCode: "+63", currency: "PHP" }
];

function detectRegionFromLocale(): string | null {
  const locale = navigator.language || "en-US";

  try {
    // Supported in modern browsers; fallback below if unavailable.
    const intlLocale = new Intl.Locale(locale);
    if (intlLocale.region) {
      return intlLocale.region.toUpperCase();
    }
  } catch {
    // Ignore and fallback.
  }

  const match = locale.match(/[-_]([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : null;
}

export function detectCountryPreference(): CountryOption {
  const region = detectRegionFromLocale();
  if (region) {
    const found = countries.find((country) => country.code === region);
    if (found) {
      return found;
    }
  }
  return countries.find((country) => country.code === "US") ?? countries[0];
}

export function findCountryByCode(code: string): CountryOption | undefined {
  return countries.find((country) => country.code === code.toUpperCase());
}

export function normalizePhone(dialCode: string, phoneRaw: string): string {
  const digits = phoneRaw.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  const cleanDial = dialCode.replace(/[^\d+]/g, "") || "+";
  return `${cleanDial}${digits}`;
}
