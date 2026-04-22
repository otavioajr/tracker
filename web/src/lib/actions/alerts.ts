"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getUnreadAlertCount() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("alerts")
    .select("*", { count: "exact", head: true })
    .eq("read", false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAlerts(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("*, devices(imei, vehicles(plate))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export async function markAlertRead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .update({ read: true })
    .eq("id", id)
    .eq("read", false)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Alert already read or not found." };
  revalidatePath("/alerts");
  return { success: true };
}

export async function getAlertRules() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alert_rules")
    .select("*, devices(imei)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
