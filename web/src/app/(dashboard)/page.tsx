import { getLatestPositions } from "@/lib/actions/positions";
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

  const positions = await getLatestPositions();
  return (
    <div className="h-full -m-4 -mb-24 lg:-m-6 lg:-mb-6">
      <DashboardMap initialPositions={positions} userId={user.id} />
    </div>
  );
}
