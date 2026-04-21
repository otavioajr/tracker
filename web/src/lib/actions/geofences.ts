"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";
import {
  buildGeofenceInsertPayload,
  buildShapeUpdatePayload,
  normalizeMetaInput,
  type CreateGeofenceInput,
  type UpdateGeofenceMetaInput,
} from "@/lib/geofences/payload";
import type { GeofenceRow, ShapeInput } from "@/lib/geofences/types";

export async function getGeofences(): Promise<GeofenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geofences_geojson")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GeofenceRow[];
}

export async function getGeofence(id: string): Promise<GeofenceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geofences_geojson")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as GeofenceRow | null;
}

export async function createGeofence(
  input: CreateGeofenceInput
): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    const payload = buildGeofenceInsertPayload({ tenantId, input });

    const { data, error } = await supabase
      .from("geofences")
      .insert(payload as never)
      .select("id")
      .single();

    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { id: (data as { id: string }).id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function updateGeofenceMeta(
  id: string,
  input: UpdateGeofenceMetaInput
): Promise<{ ok: true } | { error: string }> {
  try {
    const payload = normalizeMetaInput(input);
    if (Object.keys(payload).length === 0) return { ok: true };

    const supabase = await createClient();
    const { error } = await supabase.from("geofences").update(payload).eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function updateGeofenceShape(
  id: string,
  shape: ShapeInput
): Promise<{ ok: true } | { error: string }> {
  try {
    const payload = buildShapeUpdatePayload(shape);
    const supabase = await createClient();
    const { error } = await supabase.from("geofences").update(payload as never).eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function deleteGeofence(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("geofences").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
