"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GeofenceDialog } from "./geofence-dialog";
import {
  createGeofence,
  updateGeofenceShape,
} from "@/lib/actions/geofences";
import type { GeofenceMeta, LngLat, ShapeInput } from "@/lib/geofences/types";

const GeofenceEditorMap = dynamic(
  () => import("./geofence-editor-map").then((m) => m.GeofenceEditorMap),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground">Carregando mapa...</div> }
);

type CreateProps = {
  mode: "create";
  initialCenter: [number, number];
};

type EditShapeProps = {
  mode: "edit-shape";
  geofenceId: string;
  initialMeta: GeofenceMeta;
  initialShape:
    | { shape_type: "polygon" | "rectangle"; coordinates: LngLat[] }
    | { shape_type: "circle"; center: LngLat; radiusM: number };
  initialCenter: [number, number];
};

type Props = CreateProps | EditShapeProps;

export function GeofenceEditor(props: Props) {
  const router = useRouter();
  const [shape, setShape] = useState<ShapeInput | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasShape = shape !== null;
  const canConfirmCreate = props.mode === "create" && hasShape;

  const handleSaveCreate = async (meta: GeofenceMeta) => {
    if (!shape) return;
    setSubmitting(true);
    setErrorMessage(null);
    const result = await createGeofence({ ...meta, shape });
    setSubmitting(false);
    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }
    toast.success("Geocerca criada.");
    router.push("/geofences");
    router.refresh();
  };

  const handleSaveShape = async () => {
    if (props.mode !== "edit-shape" || !shape) return;
    setSubmitting(true);
    const result = await updateGeofenceShape(props.geofenceId, shape);
    setSubmitting(false);
    if ("error" in result) {
      toast.error(`Falha ao salvar: ${result.error}`);
      return;
    }
    toast.success("Forma atualizada.");
    router.push("/geofences");
    router.refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b p-3 gap-2">
        <h1 className="text-lg font-semibold">
          {props.mode === "create" ? "Nova geocerca" : `Editar forma · ${props.initialMeta.name}`}
        </h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push("/geofences")} disabled={submitting}>
            Cancelar
          </Button>
          {props.mode === "create" ? (
            <Button
              onClick={() => {
                setErrorMessage(null);
                setDialogOpen(true);
              }}
              disabled={!canConfirmCreate || submitting}
            >
              Confirmar geocerca
            </Button>
          ) : (
            <Button onClick={handleSaveShape} disabled={!hasShape || submitting}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <GeofenceEditorMap
          mode={props.mode}
          initialShape={props.mode === "edit-shape" ? props.initialShape : undefined}
          center={props.initialCenter}
          onShapeChange={setShape}
        />
      </div>

      {props.mode === "create" && (
        <GeofenceDialog
          open={dialogOpen}
          title="Detalhes da geocerca"
          description="Defina nome, tipo e estado. A forma desenhada no mapa será salva junto."
          submitting={submitting}
          errorMessage={errorMessage}
          onCancel={() => setDialogOpen(false)}
          onSubmit={handleSaveCreate}
        />
      )}
    </div>
  );
}
