import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { getGeofences } from "@/lib/actions/geofences";
import { GeofenceTable } from "@/components/geofences/geofence-table";

export default async function GeofencesPage() {
  const geofences = await getGeofences();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Geocercas</h1>
        <Link href="/geofences/new" className={buttonVariants({ size: "default" })}>
          <Plus size={16} className="mr-1" />
          Nova geocerca
        </Link>
      </div>
      <GeofenceTable geofences={geofences} />
    </div>
  );
}
