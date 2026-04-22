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
  if (data) {
    revalidatePath("/alerts");
    return { success: true };
  }

  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .select("id, read")
    .eq("id", id)
    .maybeSingle();

  if (alertError) return { error: alertError.message };
  if (alert?.read) {
    revalidatePath("/alerts");
    return { success: true, alreadyRead: true };
  }

  return { error: "Alert not found or inaccessible." };
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
