import { getAlerts, getUnreadAlertCount } from "@/lib/actions/alerts";

import { AlertBellMenu } from "./alert-bell-menu";

const RECENT_ALERTS_LIMIT = 10;

export async function AlertBell() {
  const [countResult, alertsResult] = await Promise.allSettled([
    getUnreadAlertCount(),
    getAlerts(RECENT_ALERTS_LIMIT),
  ]);

  const initialAlerts =
    alertsResult.status === "fulfilled" ? alertsResult.value : [];
  const unreadCountFromLoadedAlerts = initialAlerts.filter(
    (alert) => !alert.read
  ).length;
  const initialUnreadCount =
    countResult.status === "fulfilled"
      ? countResult.value === 0 && unreadCountFromLoadedAlerts > 0
        ? unreadCountFromLoadedAlerts
        : countResult.value
      : unreadCountFromLoadedAlerts;
  const hasLoadError = alertsResult.status === "rejected";

  return (
    <AlertBellMenu
      initialUnreadCount={initialUnreadCount}
      initialAlerts={initialAlerts}
      hasLoadError={hasLoadError}
    />
  );
}
