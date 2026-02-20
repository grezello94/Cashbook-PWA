import { useMemo, useState, type FormEvent } from "react";
import type { CreateWorkspaceInput } from "@/types/domain";
import { industries } from "@/data/industries";
import { NeonCard } from "@/components/common/NeonCard";
import type { AICategorySuggestion } from "@/services/aiCategories";

interface OnboardingPageProps {
  defaultCurrency: string;
  loading: boolean;
  onGenerateAICategories: (prompt: string, industry: string) => Promise<AICategorySuggestion[]>;
  onCreateWorkspace: (input: CreateWorkspaceInput, aiCategories: AICategorySuggestion[]) => Promise<void>;
}

export function OnboardingPage(props: OnboardingPageProps): JSX.Element {
  const { defaultCurrency, loading, onGenerateAICategories, onCreateWorkspace } = props;
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>(industries[0]);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [niche, setNiche] = useState("");
  const [aiCategories, setAICategories] = useState<AICategorySuggestion[]>([]);
  const [generating, setGenerating] = useState(false);

  const canGenerate = useMemo(() => industry.trim().length > 0, [industry]);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const generated = await onGenerateAICategories(niche, industry);
      setAICategories(generated);
    } finally {
      setGenerating(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreateWorkspace(
      {
        name: name.trim(),
        industry,
        currency: currency.toUpperCase(),
        timezone
      },
      aiCategories
    );
  };

  return (
    <div className="center-layout">
      <NeonCard title="Onboarding" subtitle="Set up your workspace in under a minute" className="max-w-xl">
        <form className="stack" onSubmit={onSubmit}>
          <label htmlFor="business-name">Business Name</label>
          <input
            id="business-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Green Bowl Kitchen"
          />

          <label htmlFor="industry">Industry</label>
          <select id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)}>
            {industries.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div className="grid-2">
            <div>
              <label htmlFor="currency">Currency</label>
              <input
                id="currency"
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label htmlFor="timezone">Timezone</label>
              <input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </div>
          </div>

          <label htmlFor="niche">Niche Description (AI Categories)</label>
          <textarea
            id="niche"
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            placeholder="Example: I run a vegan ice-cream truck near schools and offices."
          />

          <button type="button" className="secondary-btn" onClick={onGenerate} disabled={!canGenerate || generating}>
            {generating ? "Generating..." : "Generate Smart AI Categories"}
          </button>

          {!!aiCategories.length && (
            <div className="chip-list">
              {aiCategories.map((item) => (
                <span key={`${item.type}-${item.name}`} className="chip">
                  {item.name} ({item.type === "income" ? "Income" : "Expense"})
                </span>
              ))}
            </div>
          )}

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Workspace"}
          </button>
        </form>
      </NeonCard>
    </div>
  );
}
