export const industries = [
  "Restaurant",
  "Home",
  "Retail",
  "Pharmacy / Medical Store",
  "Salon / Spa & Wellness",
  "Automobile Workshop / Garage",
  "Electronics / Mobile Shop",
  "Bakery / Cloud Kitchen",
  "Boutique / Fashion",
  "Gym / Fitness Center",
  "Freelancer / Consultant",
  "Construction / Contractor",
  "Transport / Logistics",
  "Event Management"
] as const;

export type IndustryName = (typeof industries)[number];
