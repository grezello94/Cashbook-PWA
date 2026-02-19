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
