"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { getTenantId } from "./utils";

type PendingLookupResult =
  | {
      pending: {
        id: string;
        serial: string;
        protocol: string;
      };
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | {
      error: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
    };

type ActionError = { error: string };
type PendingDeviceCreateResult = ActionError | { deviceId: string };

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
  const lookup = await getPendingDevice(pendingId);

  if ("error" in lookup) return { error: lookup.error };

  const { pending, supabase } = lookup;

  const { error: updateError } = await supabase
    .from("devices")
    .update({ serial_number: pending.serial })
    .eq("id", deviceId);

  if (updateError) return { error: updateError.message };

  const pendingRemoval = await removePending(supabase, pendingId);
  if (pendingRemoval?.error) {
    await supabase
      .from("devices")
      .update({ serial_number: null })
      .eq("id", deviceId)
      .eq("serial_number", pending.serial);
    return pendingRemoval;
  }

  revalidatePath("/devices");
  return { success: true };
}

export async function createDeviceFromPending(pendingId: string, formData: FormData) {
  const lookup = await getPendingDevice(pendingId);

  if ("error" in lookup) return { error: lookup.error };

  const { pending, supabase } = lookup;
  const tenantId = await getTenantId();
  const createdDevice = await createPendingDeviceRecord({
    formData,
    pending,
    supabase,
    tenantId,
  });

  if ("error" in createdDevice) return createdDevice;

  const pendingRemoval = await removePending(supabase, pendingId);

  if (pendingRemoval?.error) {
    await cleanupDevice(supabase, createdDevice.deviceId);
    return pendingRemoval;
  }

  revalidatePath("/devices");
  return { success: true, deviceId: createdDevice.deviceId };
}

export async function createDeviceAndAssignVehicleFromPending(
  pendingId: string,
  vehicleId: string,
  formData: FormData,
) {
  if (!vehicleId) return { error: "Selecione um veículo para continuar" };

  const lookup = await getPendingDevice(pendingId);

  if ("error" in lookup) return { error: lookup.error };

  const { pending, supabase } = lookup;
  const tenantId = await getTenantId();
  const availability = await getVehicleAvailability(supabase, vehicleId);

  if ("error" in availability) return availability;

  const createdDevice = await createPendingDeviceRecord({
    formData,
    pending,
    supabase,
    tenantId,
  });

  if ("error" in createdDevice) return createdDevice;

  const { data: linkedVehicle, error: linkError } = await supabase
    .from("vehicles")
    .update({ device_id: createdDevice.deviceId })
    .eq("id", vehicleId)
    .is("device_id", null)
    .select("id")
    .single();

  if (linkError || !linkedVehicle) {
    await cleanupDevice(supabase, createdDevice.deviceId);
    return { error: "Veículo indisponível para vínculo" };
  }

  const pendingRemoval = await removePending(supabase, pendingId);

  if (pendingRemoval?.error) {
    await supabase
      .from("vehicles")
      .update({ device_id: null })
      .eq("id", vehicleId)
      .eq("device_id", createdDevice.deviceId);
    await cleanupDevice(supabase, createdDevice.deviceId);
    return pendingRemoval;
  }

  revalidatePath("/devices");
  revalidatePath("/vehicles");
  return { success: true };
}

export async function createDeviceAndVehicleFromPending(
  pendingId: string,
  formData: FormData,
) {
  const plate = getRequiredText(formData, "plate", "Informe a placa do veículo");

  if (typeof plate !== "string") return plate;

  const lookup = await getPendingDevice(pendingId);

  if ("error" in lookup) return { error: lookup.error };

  const { pending, supabase } = lookup;
  const tenantId = await getTenantId();
  const createdDevice = await createPendingDeviceRecord({
    formData,
    pending,
    supabase,
    tenantId,
  });

  if ("error" in createdDevice) return createdDevice;

  const { data: createdVehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .insert({
      tenant_id: tenantId,
      name: getOptionalText(formData, "name"),
      plate,
      brand: getOptionalText(formData, "brand"),
      model: getOptionalText(formData, "vehicle_model"),
      year: getOptionalNumber(formData, "year"),
      color: getOptionalText(formData, "color"),
      device_id: createdDevice.deviceId,
    })
    .select("id")
    .single();

  if (vehicleError || !createdVehicle) {
    await cleanupDevice(supabase, createdDevice.deviceId);
    return { error: vehicleError?.message ?? "Não foi possível criar o veículo" };
  }

  const pendingRemoval = await removePending(supabase, pendingId);

  if (pendingRemoval?.error) {
    await supabase.from("vehicles").delete().eq("id", createdVehicle.id);
    await cleanupDevice(supabase, createdDevice.deviceId);
    return pendingRemoval;
  }

  revalidatePath("/devices");
  revalidatePath("/vehicles");
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

async function getPendingDevice(pendingId: string): Promise<PendingLookupResult> {
  const supabase = await createClient();
  const { data: pending, error } = await supabase
    .from("pending_devices")
    .select("id, serial, protocol")
    .eq("id", pendingId)
    .single();

  if (error || !pending) {
    return {
      error: "Dispositivo pendente não encontrado",
      supabase,
    };
  }

  return { pending, supabase };
}

async function createPendingDeviceRecord({
  formData,
  pending,
  supabase,
  tenantId,
}: {
  formData: FormData;
  pending: {
    id: string;
    serial: string;
    protocol: string;
  };
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
}): Promise<PendingDeviceCreateResult> {
  const imei = getRequiredText(formData, "imei", "Informe o IMEI do dispositivo");

  if (typeof imei !== "string") return imei;

  const { data: device, error } = await supabase
    .from("devices")
    .insert({
      tenant_id: tenantId,
      imei,
      protocol: pending.protocol as "suntech",
      model: getOptionalText(formData, "model"),
      serial_number: pending.serial,
    })
    .select("id")
    .single();

  if (error || !device) {
    return { error: error?.message ?? "Não foi possível criar o dispositivo" };
  }

  return { deviceId: device.id };
}

async function getVehicleAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicleId: string,
) {
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, device_id")
    .eq("id", vehicleId)
    .single();

  if (error || !vehicle || vehicle.device_id) {
    return { error: "Veículo indisponível para vínculo" };
  }

  return { success: true };
}

async function removePending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pendingId: string,
) {
  const { error } = await supabase
    .from("pending_devices")
    .delete()
    .eq("id", pendingId);

  if (error) return { error: error.message };
  return null;
}

async function cleanupDevice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deviceId: string,
) {
  await supabase.from("devices").delete().eq("id", deviceId);
}

function getRequiredText(
  formData: FormData,
  key: string,
  error: string,
): string | ActionError {
  const value = getOptionalText(formData, key);

  if (!value) return { error };
  return value;
}

function getOptionalText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getOptionalNumber(formData: FormData, key: string) {
  const value = getOptionalText(formData, key);

  if (!value) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
