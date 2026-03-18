import { getAlerts } from "@/lib/actions/alerts";
import { AlertFeed } from "@/components/alerts/alert-feed";

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Alertas</h1>
      <AlertFeed alerts={alerts} />
    </div>
  );
}
