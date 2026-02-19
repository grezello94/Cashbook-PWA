import type { CategoryType } from "@/types/domain";

export interface CategorySeed {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  source: "system";
}

const shared: CategorySeed[] = [
  { name: "Misc Income", type: "income", icon: "💸", color: "#16f2a5", source: "system" },
  { name: "Misc Expense", type: "expense", icon: "🧾", color: "#f43f5e", source: "system" }
];

const byIndustry: Record<string, CategorySeed[]> = {
  Restaurant: [
    { name: "Vegetables", type: "expense", icon: "🥬", color: "#34d399", source: "system" },
    { name: "Meat", type: "expense", icon: "🥩", color: "#fb7185", source: "system" },
    { name: "Beverages", type: "expense", icon: "🥤", color: "#22d3ee", source: "system" },
    { name: "Staff Salary", type: "expense", icon: "🧑‍🍳", color: "#f59e0b", source: "system" },
    { name: "Dine-in Sales", type: "income", icon: "🍽️", color: "#60a5fa", source: "system" },
    { name: "Delivery Sales", type: "income", icon: "🛵", color: "#14b8a6", source: "system" }
  ],
  Retail: [
    { name: "Inventory Purchase", type: "expense", icon: "📦", color: "#22d3ee", source: "system" },
    { name: "Shop Rent", type: "expense", icon: "🏬", color: "#f97316", source: "system" },
    { name: "Counter Sales", type: "income", icon: "🛒", color: "#10b981", source: "system" }
  ],
  "Freelancer / Consultant": [
    { name: "Software Subscription", type: "expense", icon: "💻", color: "#38bdf8", source: "system" },
    { name: "Client Payment", type: "income", icon: "📨", color: "#10b981", source: "system" },
    { name: "Travel", type: "expense", icon: "✈️", color: "#fb7185", source: "system" }
  ],
  "Transport / Logistics": [
    { name: "Fuel", type: "expense", icon: "⛽", color: "#fb7185", source: "system" },
    { name: "Toll", type: "expense", icon: "🛣️", color: "#f59e0b", source: "system" },
    { name: "Trip Revenue", type: "income", icon: "🚚", color: "#10b981", source: "system" }
  ]
};

export function getDefaultCategories(industry: string): CategorySeed[] {
  const selected = byIndustry[industry] ?? [];
  return [...selected, ...shared];
}
