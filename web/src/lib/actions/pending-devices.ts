"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getPendingDevices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_devices")
    .select("*")
    .is("linked_device_id", null)
    .order("last_seen_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function linkPendingDevice(pendingId: string, deviceId: string) {
  const supabase = await createClient();

  const { data: pending, error: pendingError } = await supabase
    .from("pending_devices")
    .select("serial")
    .eq("id", pendingId)
    .single();

  if (pendingError || !pending) return { error: "Dispositivo pendente não encontrado" };

  const { error: updateError } = await supabase
    .from("devices")
    .update({ serial_number: pending.serial })
    .eq("id", deviceId);

  if (updateError) return { error: updateError.message };

  await supabase.from("pending_devices").delete().eq("id", pendingId);

  revalidatePath("/devices");
  return { success: true };
}

export async function dismissPendingDevice(pendingId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pending_devices")
    .delete()
    .eq("id", pendingId);

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}
