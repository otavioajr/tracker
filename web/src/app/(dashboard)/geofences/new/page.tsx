import { GeofenceEditor } from "@/components/geofences/geofence-editor";

export default function NewGeofencePage() {
  // Centro padrão: São Paulo. Futuro: ler do dashboardMapPreferences.
  const initialCenter: [number, number] = [-23.55, -46.63];

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6">
      <GeofenceEditor mode="create" initialCenter={initialCenter} />
    </div>
  );
}
