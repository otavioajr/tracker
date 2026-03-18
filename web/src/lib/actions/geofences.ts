"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getGeofences() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGeofence(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("geofences").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/geofences");
  return { success: true };
}
