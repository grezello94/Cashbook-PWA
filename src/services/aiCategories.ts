const fallbackByKeyword: Record<string, string[]> = {
  vegan: ["Plant Milk Sourcing", "Dairy-Free Toppings", "Compostable Cups"],
  truck: ["Fuel", "Generator Maintenance", "Parking Permit"],
  bakery: ["Flour", "Packaging", "Oven Maintenance"],
  salon: ["Consumables", "Stylist Commission", "Sanitization Supplies"],
  pharmacy: ["Medicine Inventory", "Cold Storage", "Supplier Payments"]
};

export async function generateAICategories(prompt: string, industry: string): Promise<string[]> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return [];
  }

  const endpoint = import.meta.env.VITE_AI_CATEGORIES_ENDPOINT;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: trimmed, industry })
      });
      if (res.ok) {
        const body = (await res.json()) as { categories?: string[] };
        if (Array.isArray(body.categories)) {
          return body.categories.filter(Boolean).slice(0, 8);
        }
      }
    } catch {
      // Fallback below when endpoint is unreachable.
    }
  }

  const lower = `${industry} ${trimmed}`.toLowerCase();
  const set = new Set<string>();

  Object.entries(fallbackByKeyword).forEach(([keyword, categories]) => {
    if (lower.includes(keyword)) {
      categories.forEach((item) => set.add(item));
    }
  });

  if (!set.size) {
    [
      "Raw Materials",
      "Utility & Energy",
      "Repairs & Maintenance",
      "Packaging",
      "Vendor Payments"
    ].forEach((item) => set.add(item));
  }

  return Array.from(set).slice(0, 8);
}
