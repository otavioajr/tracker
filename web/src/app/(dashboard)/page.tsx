import { getLatestPositions } from "@/lib/actions/positions";
import { DashboardMap } from "./dashboard-map";

export default async function DashboardPage() {
  const positions = await getLatestPositions();
  return (
    <div className="h-full -m-4 -mb-24 lg:-m-6 lg:-mb-6">
      <DashboardMap initialPositions={positions} />
    </div>
  );
}
