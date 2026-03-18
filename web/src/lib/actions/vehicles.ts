"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";

export async function getVehicles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, devices(imei, protocol, last_communication_at)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createVehicle(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { error } = await supabase.from("vehicles").insert({
    tenant_id: tenantId,
    plate: formData.get("plate") as string,
    brand: formData.get("brand") as string || null,
    model: formData.get("model") as string || null,
    year: formData.get("year") ? parseInt(formData.get("year") as string) : null,
    color: formData.get("color") as string || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}

export async function updateVehicle(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vehicles")
    .update({
      plate: formData.get("plate") as string,
      brand: formData.get("brand") as string || null,
      model: formData.get("model") as string || null,
      year: formData.get("year") ? parseInt(formData.get("year") as string) : null,
      color: formData.get("color") as string || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}

export async function deleteVehicle(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}

export async function associateDevice(vehicleId: string, deviceId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ device_id: deviceId })
    .eq("id", vehicleId);

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}
