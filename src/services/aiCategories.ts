import type { CategoryType } from "@/types/domain";

export interface AICategorySuggestion {
  name: string;
  type: CategoryType;
}

const industryTemplates: Record<string, AICategorySuggestion[]> = {
  Restaurant: [
    { name: "Dine-in Sales", type: "income" },
    { name: "Delivery Sales", type: "income" },
    { name: "Catering Orders", type: "income" },
    { name: "Raw Ingredients", type: "expense" },
    { name: "Kitchen Staff Salary", type: "expense" },
    { name: "Utility & Gas", type: "expense" }
  ],
  Home: [
    { name: "Household Income", type: "income" },
    { name: "Rental Income", type: "income" },
    { name: "Grocery", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Home Maintenance", type: "expense" },
    { name: "School / Family Expenses", type: "expense" }
  ],
  Retail: [
    { name: "Counter Sales", type: "income" },
    { name: "Online Sales", type: "income" },
    { name: "Inventory Purchase", type: "expense" },
    { name: "Shop Rent", type: "expense" },
    { name: "Staff Wages", type: "expense" },
    { name: "Marketing", type: "expense" }
  ],
  "Pharmacy / Medical Store": [
    { name: "OTC Sales", type: "income" },
    { name: "Prescription Sales", type: "income" },
    { name: "Medicine Procurement", type: "expense" },
    { name: "Cold Storage", type: "expense" },
    { name: "Pharmacist Salary", type: "expense" },
    { name: "Regulatory Compliance", type: "expense" }
  ],
  "Salon / Spa & Wellness": [
    { name: "Service Revenue", type: "income" },
    { name: "Product Sales", type: "income" },
    { name: "Stylist Commission", type: "expense" },
    { name: "Beauty Consumables", type: "expense" },
    { name: "Sanitization Supplies", type: "expense" },
    { name: "Salon Rent", type: "expense" }
  ],
  "Automobile Workshop / Garage": [
    { name: "Repair Charges", type: "income" },
    { name: "Spare Parts Sales", type: "income" },
    { name: "Mechanic Wages", type: "expense" },
    { name: "Spare Parts Purchase", type: "expense" },
    { name: "Tool Maintenance", type: "expense" },
    { name: "Workshop Utilities", type: "expense" }
  ],
  "Electronics / Mobile Shop": [
    { name: "Device Sales", type: "income" },
    { name: "Accessories Sales", type: "income" },
    { name: "Repair Revenue", type: "income" },
    { name: "Stock Procurement", type: "expense" },
    { name: "Warranty Claims Cost", type: "expense" },
    { name: "Store Rent", type: "expense" }
  ],
  "Bakery / Cloud Kitchen": [
    { name: "Walk-in Orders", type: "income" },
    { name: "Online Orders", type: "income" },
    { name: "Bulk Catering Orders", type: "income" },
    { name: "Flour & Ingredients", type: "expense" },
    { name: "Packaging", type: "expense" },
    { name: "Oven Maintenance", type: "expense" }
  ],
  "Boutique / Fashion": [
    { name: "In-store Sales", type: "income" },
    { name: "Custom Orders", type: "income" },
    { name: "Fabric Purchase", type: "expense" },
    { name: "Tailor Wages", type: "expense" },
    { name: "Returns & Alterations", type: "expense" },
    { name: "Display & Packaging", type: "expense" }
  ],
  "Gym / Fitness Center": [
    { name: "Membership Fees", type: "income" },
    { name: "Personal Training Revenue", type: "income" },
    { name: "Supplement Sales", type: "income" },
    { name: "Trainer Salary", type: "expense" },
    { name: "Equipment Maintenance", type: "expense" },
    { name: "Facility Rent", type: "expense" }
  ],
  "Freelancer / Consultant": [
    { name: "Client Retainer", type: "income" },
    { name: "Project Fees", type: "income" },
    { name: "Software Subscription", type: "expense" },
    { name: "Travel", type: "expense" },
    { name: "Internet & Communication", type: "expense" },
    { name: "Outsourced Work", type: "expense" }
  ],
  "Construction / Contractor": [
    { name: "Project Billing", type: "income" },
    { name: "Advance Payments", type: "income" },
    { name: "Raw Material Purchase", type: "expense" },
    { name: "Labor Cost", type: "expense" },
    { name: "Equipment Rental", type: "expense" },
    { name: "Site Transport", type: "expense" }
  ],
  "Transport / Logistics": [
    { name: "Trip Revenue", type: "income" },
    { name: "Contract Freight Revenue", type: "income" },
    { name: "Fuel", type: "expense" },
    { name: "Driver Salary", type: "expense" },
    { name: "Toll Charges", type: "expense" },
    { name: "Vehicle Maintenance", type: "expense" }
  ],
  "Event Management": [
    { name: "Event Package Revenue", type: "income" },
    { name: "Sponsorship Revenue", type: "income" },
    { name: "Venue Booking", type: "expense" },
    { name: "Vendor Payments", type: "expense" },
    { name: "Decoration & Setup", type: "expense" },
    { name: "Crew Cost", type: "expense" }
  ]
};

const keywordBoosters: Record<string, AICategorySuggestion[]> = {
  vegan: [
    { name: "Plant-based Ingredients", type: "expense" },
    { name: "Vegan Product Sales", type: "income" }
  ],
  truck: [
    { name: "Truck Fuel", type: "expense" },
    { name: "Parking & Permit", type: "expense" }
  ],
  delivery: [{ name: "Delivery Revenue", type: "income" }],
  dine: [{ name: "Dine-in Sales", type: "income" }],
  online: [{ name: "Online Orders", type: "income" }],
  wholesale: [{ name: "Wholesale Orders", type: "income" }],
  catering: [{ name: "Catering Revenue", type: "income" }],
  rent: [{ name: "Rent", type: "expense" }],
  salary: [{ name: "Staff Salary", type: "expense" }],
  utility: [{ name: "Utilities", type: "expense" }],
  commission: [{ name: "Commission", type: "expense" }],
  repair: [{ name: "Repairs & Maintenance", type: "expense" }]
};

function sanitizeCategoryName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferTypeFromName(name: string): CategoryType {
  const text = name.toLowerCase();
  const incomeTokens = [
    "sale",
    "sales",
    "revenue",
    "income",
    "fee",
    "fees",
    "payment received",
    "order",
    "membership",
    "retainer"
  ];
  return incomeTokens.some((token) => text.includes(token)) ? "income" : "expense";
}

function normalizeSuggestions(items: AICategorySuggestion[]): AICategorySuggestion[] {
  const seen = new Set<string>();
  const output: AICategorySuggestion[] = [];

  items.forEach((item) => {
    const name = sanitizeCategoryName(item.name);
    if (!name) {
      return;
    }
    const type: CategoryType = item.type === "income" ? "income" : "expense";
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push({ name, type });
  });

  return output;
}

function parseEndpointCategories(body: unknown): AICategorySuggestion[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const payload = body as {
    categories?: unknown;
    income_categories?: unknown;
    expense_categories?: unknown;
  };
  const output: AICategorySuggestion[] = [];

  if (Array.isArray(payload.categories)) {
    payload.categories.forEach((item) => {
      if (typeof item === "string") {
        output.push({ name: item, type: inferTypeFromName(item) });
        return;
      }
      if (item && typeof item === "object") {
        const row = item as { name?: unknown; type?: unknown };
        if (typeof row.name === "string") {
          output.push({
            name: row.name,
            type: row.type === "income" ? "income" : inferTypeFromName(row.name)
          });
        }
      }
    });
  }

  if (Array.isArray(payload.income_categories)) {
    payload.income_categories.forEach((item) => {
      if (typeof item === "string") {
        output.push({ name: item, type: "income" });
      }
    });
  }

  if (Array.isArray(payload.expense_categories)) {
    payload.expense_categories.forEach((item) => {
      if (typeof item === "string") {
        output.push({ name: item, type: "expense" });
      }
    });
  }

  return normalizeSuggestions(output).slice(0, 12);
}

function buildFallbackSuggestions(prompt: string, industry: string): AICategorySuggestion[] {
  const lower = `${industry} ${prompt}`.toLowerCase();
  const base = industryTemplates[industry] ?? [
    { name: "Primary Sales", type: "income" },
    { name: "Secondary Income", type: "income" },
    { name: "Raw Materials", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Repairs & Maintenance", type: "expense" },
    { name: "Vendor Payments", type: "expense" }
  ];

  const boosted: AICategorySuggestion[] = [...base];
  Object.entries(keywordBoosters).forEach(([keyword, suggestions]) => {
    if (lower.includes(keyword)) {
      boosted.push(...suggestions);
    }
  });

  return normalizeSuggestions(boosted).slice(0, 12);
}

export async function generateAICategories(prompt: string, industry: string): Promise<AICategorySuggestion[]> {
  const trimmed = prompt.trim();
  const endpoint = import.meta.env.VITE_AI_CATEGORIES_ENDPOINT;

  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: trimmed,
          industry,
          instruction:
            "Generate practical bookkeeping categories for this business. Return JSON with category name and type (income or expense). Keep names short and professional."
        })
      });
      if (res.ok) {
        const parsed = parseEndpointCategories(await res.json());
        if (parsed.length) {
          return parsed;
        }
      }
    } catch {
      // Fallback below when endpoint is unreachable.
    }
  }

  return buildFallbackSuggestions(trimmed, industry);
}
