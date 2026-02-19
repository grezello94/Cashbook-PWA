import { getDefaultCategories } from "@/data/defaultCategories";
import { requireSupabase } from "@/lib/supabase";
import type { Category } from "@/types/domain";

interface CategoryInsert {
  workspace_id: string;
  name: string;
  type: "income" | "expense";
  icon: string;
  color: string;
  source: "system" | "ai_generated" | "manual";
  is_active: boolean;
  created_by: string;
}

export async function listCategories(workspaceId: string): Promise<Category[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("id,workspace_id,name,type,icon,color,source,is_active")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Category[];
}

export async function seedIndustryCategories(workspaceId: string, industry: string, userId: string): Promise<void> {
  const defaults = getDefaultCategories(industry);
  if (!defaults.length) {
    return;
  }

  const payload: CategoryInsert[] = defaults.map((category) => ({
    workspace_id: workspaceId,
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    source: category.source,
    is_active: true,
    created_by: userId
  }));

  const sb = requireSupabase();
  const { error } = await sb
    .from("categories")
    .upsert(payload, { onConflict: "workspace_id,type,name_key", ignoreDuplicates: true });

  if (error) {
    throw error;
  }
}

export async function addAICategories(
  workspaceId: string,
  names: string[],
  userId: string,
  type: "income" | "expense" = "expense"
): Promise<void> {
  const uniqueNames = Array.from(new Set(names.map((item) => item.trim()).filter(Boolean)));
  if (!uniqueNames.length) {
    return;
  }

  const payload: CategoryInsert[] = uniqueNames.map((name) => ({
    workspace_id: workspaceId,
    name,
    type,
    icon: "✨",
    color: "#22d3ee",
    source: "ai_generated",
    is_active: true,
    created_by: userId
  }));

  const sb = requireSupabase();
  const { error } = await sb
    .from("categories")
    .upsert(payload, { onConflict: "workspace_id,type,name_key", ignoreDuplicates: true });

  if (error) {
    throw error;
  }
}

export async function addManualCategory(
  workspaceId: string,
  userId: string,
  name: string,
  type: "income" | "expense"
): Promise<void> {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("Category name is required.");
  }
  const normalizedKey = normalized.toLowerCase();

  const sb = requireSupabase();
  const { data: existing, error: existingError } = await sb
    .from("categories")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .eq("type", type)
    .eq("name_key", normalizedKey)
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    throw new Error(`Duplicate category: "${normalized}" already exists.`);
  }

  const { error } = await sb
    .from("categories")
    .insert({
      workspace_id: workspaceId,
      name: normalized,
      type,
      icon: null,
      color: null,
      source: "manual",
      is_active: true,
      created_by: userId
    });

  if (error) {
    throw error;
  }
}

export async function archiveCategory(workspaceId: string, categoryId: string): Promise<void> {
  const sb = requireSupabase();
  const { count, error: countError } = await sb
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("category_id", categoryId);

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) > 0) {
    throw new Error("Cannot drop this category because it is already used in entries.");
  }

  const { error } = await sb
    .from("categories")
    .update({ is_active: false })
    .eq("workspace_id", workspaceId)
    .eq("id", categoryId);

  if (error) {
    throw error;
  }
}
