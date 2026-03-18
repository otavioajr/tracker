import { getGeofences } from "@/lib/actions/geofences";
import { GeofenceTable } from "@/components/geofences/geofence-table";

export default async function GeofencesPage() {
  const geofences = await getGeofences();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Geocercas</h1>
      </div>
      <p className="text-muted-foreground text-sm">Desenho de geocercas no mapa sera adicionado em uma proxima versao.</p>
      <GeofenceTable geofences={geofences} />
    </div>
  );
}
