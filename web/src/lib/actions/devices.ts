"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";

export async function getDevices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devices")
    .select("*, vehicles(id, plate)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createDevice(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { error } = await supabase.from("devices").insert({
    tenant_id: tenantId,
    imei: formData.get("imei") as string,
    protocol: ((formData.get("protocol") as string) || "suntech") as "suntech",
    model: (formData.get("model") as string) || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}

export async function updateDevice(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("devices")
    .update({
      imei: formData.get("imei") as string,
      model: formData.get("model") as string || null,
      active: formData.get("active") === "true",
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}

export async function deleteDevice(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("devices").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}
