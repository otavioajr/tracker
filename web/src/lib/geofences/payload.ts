import {
  polygonToWkt,
  pointToWkt,
  validatePolygonCoords,
  validateRadiusMeters,
} from "./shape-utils";
import type { GeofenceMeta, GeofenceType, ShapeInput } from "./types";

export type CreateGeofenceInput = GeofenceMeta & { shape: ShapeInput };
export type UpdateGeofenceMetaInput = Partial<GeofenceMeta>;

function assertName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) throw new Error("Nome da geocerca é obrigatório.");
  if (name.length > 100) throw new Error("Nome da geocerca deve ter no máximo 100 caracteres.");
  return name;
}

function assertType(type: GeofenceType): GeofenceType {
  if (type !== "inclusion" && type !== "exclusion") throw new Error("Tipo de geocerca inválido.");
  return type;
}

function assertShape(shape: ShapeInput): void {
  if (shape.kind === "polygon" || shape.kind === "rectangle") {
    const res = validatePolygonCoords(shape.coordinates);
    if (!res.ok) throw new Error(res.error);
    return;
  }
  const radiusRes = validateRadiusMeters(shape.radiusM);
  if (!radiusRes.ok) throw new Error(radiusRes.error);
  const polyRes = validatePolygonCoords(shape.polygon);
  if (!polyRes.ok) throw new Error(polyRes.error);
}

export function normalizeMetaInput(input: UpdateGeofenceMetaInput): UpdateGeofenceMetaInput {
  const out: UpdateGeofenceMetaInput = {};
  if (input.name !== undefined) out.name = assertName(input.name);
  if (input.type !== undefined) out.type = assertType(input.type);
  if (input.active !== undefined) out.active = Boolean(input.active);
  return out;
}

export type InsertPayload = {
  tenant_id: string;
  name: string;
  type: GeofenceType;
  active: boolean;
  shape_type: ShapeInput["kind"];
  area: string;
  center: string | null;
  radius_m: number | null;
};

export function buildGeofenceInsertPayload(args: {
  tenantId: string;
  input: CreateGeofenceInput;
}): InsertPayload {
  const { tenantId, input } = args;
  const name = assertName(input.name);
  const type = assertType(input.type);
  assertShape(input.shape);

  if (input.shape.kind === "circle") {
    return {
      tenant_id: tenantId,
      name,
      type,
      active: input.active,
      shape_type: "circle",
      area: polygonToWkt(input.shape.polygon),
      center: pointToWkt(input.shape.center),
      radius_m: input.shape.radiusM,
    };
  }

  return {
    tenant_id: tenantId,
    name,
    type,
    active: input.active,
    shape_type: input.shape.kind,
    area: polygonToWkt(input.shape.coordinates),
    center: null,
    radius_m: null,
  };
}

export type ShapeUpdatePayload = {
  shape_type: ShapeInput["kind"];
  area: string;
  center: string | null;
  radius_m: number | null;
};

export function buildShapeUpdatePayload(shape: ShapeInput): ShapeUpdatePayload {
  assertShape(shape);
  if (shape.kind === "circle") {
    return {
      shape_type: "circle",
      area: polygonToWkt(shape.polygon),
      center: pointToWkt(shape.center),
      radius_m: shape.radiusM,
    };
  }
  return {
    shape_type: shape.kind,
    area: polygonToWkt(shape.coordinates),
    center: null,
    radius_m: null,
  };
}
