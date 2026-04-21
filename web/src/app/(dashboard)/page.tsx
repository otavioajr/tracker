import { getLatestPositions } from "@/lib/actions/positions";
import { getGeofences } from "@/lib/actions/geofences";
import { createClient } from "@/lib/supabase/server";
import { DashboardMap } from "./dashboard-map";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Não autenticado");
  }

  const [positions, geofences] = await Promise.all([
    getLatestPositions(),
    getGeofences(),
  ]);

  return (
    <div className="h-full -m-4 -mb-24 lg:-m-6 lg:-mb-6">
      <DashboardMap
        initialPositions={positions}
        initialGeofences={geofences}
        userId={user.id}
      />
    </div>
  );
}
