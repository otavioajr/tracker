import { getLatestPositions } from "@/lib/actions/positions";
import { DashboardMap } from "./dashboard-map";

export default async function DashboardPage() {
  const positions = await getLatestPositions();
  return (
    <div className="h-full -m-6">
      <DashboardMap initialPositions={positions} />
    </div>
  );
}
