"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import {
  ALERT_READ_ALL_EVENT,
  ALERT_READ_EVENT,
  AlertFeed,
  type AlertFeedAlert,
} from "@/components/alerts/alert-feed";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { markAllAlertsRead } from "@/lib/actions/alerts";

type AlertBellMenuProps = {
  initialAlerts: AlertFeedAlert[];
  initialUnreadCount: number;
  hasLoadError?: boolean;
};

type AlertBellMenuState = {
  alerts: AlertFeedAlert[];
  unreadCount: number;
};

type AlertBellMenuAction =
  | {
      type: "sync";
      alerts: AlertFeedAlert[];
      unreadCount: number;
    }
  | {
      type: "mark-read";
      id: string;
      countChanged: boolean;
    }
  | { type: "mark-all-read" };

function markAlertReadInList(alerts: AlertFeedAlert[], id: string) {
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.id !== id || alert.read) {
      return alert;
    }

    changed = true;
    return { ...alert, read: true };
  });

  return changed ? next : alerts;
}

function markAllAlertsReadInList(alerts: AlertFeedAlert[]) {
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.read) {
      return alert;
    }

    changed = true;
    return { ...alert, read: true };
  });

  return changed ? next : alerts;
}

function alertBellMenuReducer(
  state: AlertBellMenuState,
  action: AlertBellMenuAction
): AlertBellMenuState {
  if (action.type === "sync") {
    return {
      alerts: action.alerts,
      unreadCount: action.unreadCount,
    };
  }

  if (action.type === "mark-all-read") {
    return {
      alerts: markAllAlertsReadInList(state.alerts),
      unreadCount: 0,
    };
  }

  const nextAlerts = markAlertReadInList(state.alerts, action.id);

  if (!action.countChanged) {
    return nextAlerts === state.alerts ? state : { ...state, alerts: nextAlerts };
  }

  return {
    alerts: nextAlerts,
    unreadCount: Math.max(0, state.unreadCount - 1),
  };
}

export function AlertBellMenu({
  initialAlerts,
  initialUnreadCount,
  hasLoadError = false,
}: AlertBellMenuProps) {
  const [{ alerts, unreadCount }, dispatch] = useReducer(alertBellMenuReducer, {
    alerts: initialAlerts,
    unreadCount: initialUnreadCount,
  });
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const processedReadIdsRef = useRef<Set<string>>(
    new Set(
      initialAlerts.filter((alert) => alert.read).map((alert) => alert.id)
    )
  );

  useEffect(() => {
    processedReadIdsRef.current = new Set(
      initialAlerts.filter((alert) => alert.read).map((alert) => alert.id)
    );
    dispatch({
      type: "sync",
      alerts: initialAlerts,
      unreadCount: initialUnreadCount,
    });
  }, [initialAlerts, initialUnreadCount]);

  useEffect(() => {
    function applyReadEvent(id?: string, countChanged?: boolean) {
      if (!id) {
        return;
      }

      if (countChanged !== true || processedReadIdsRef.current.has(id)) {
        dispatch({ type: "mark-read", id, countChanged: false });
        return;
      }

      processedReadIdsRef.current.add(id);
      dispatch({ type: "mark-read", id, countChanged: true });
    }

    function handleExternalAlertRead(event: Event) {
      const { detail } = event as CustomEvent<{
        id?: string;
        countChanged?: boolean;
      }>;

      applyReadEvent(detail?.id, detail?.countChanged);
    }

    function handleExternalAlertReadAll() {
      for (const alert of alerts) {
        if (!alert.read) {
          processedReadIdsRef.current.add(alert.id);
        }
      }
      dispatch({ type: "mark-all-read" });
    }

    window.addEventListener(ALERT_READ_EVENT, handleExternalAlertRead);
    window.addEventListener(ALERT_READ_ALL_EVENT, handleExternalAlertReadAll);

    return () => {
      window.removeEventListener(ALERT_READ_EVENT, handleExternalAlertRead);
      window.removeEventListener(ALERT_READ_ALL_EVENT, handleExternalAlertReadAll);
    };
  }, [alerts]);

  const triggerLabel =
    unreadCount === 0
      ? "Alertas"
      : `Alertas (${unreadCount} não lidos)`;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const subtitle =
    unreadCount > 0 ? `${unreadCount} não lidos` : "Nenhum novo alerta";

  function handleAlertRead(id: string) {
    if (processedReadIdsRef.current.has(id)) {
      dispatch({ type: "mark-read", id, countChanged: false });
      return;
    }

    processedReadIdsRef.current.add(id);
    dispatch({ type: "mark-read", id, countChanged: true });
  }

  async function handleClearAll() {
    if (clearing || unreadCount === 0) {
      return;
    }

    setClearing(true);

    try {
      const result = await markAllAlertsRead();
      if (result && "error" in result) {
        return;
      }

      for (const alert of alerts) {
        if (!alert.read) {
          processedReadIdsRef.current.add(alert.id);
        }
      }

      dispatch({ type: "mark-all-read" });
      window.dispatchEvent(new CustomEvent(ALERT_READ_ALL_EVENT));
    } catch {
      return;
    } finally {
      setClearing(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={triggerLabel}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {badgeLabel}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        positionerClassName="z-[1100]"
        className="w-[min(24rem,calc(100vw-1rem))] rounded-xl p-0"
      >
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Alertas</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={clearing}
              onClick={() => {
                void handleClearAll();
              }}
              aria-label="Limpar todos os alertas"
            >
              {clearing ? "Limpando…" : "Limpar todos"}
            </Button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto px-2 py-2">
          {hasLoadError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Não foi possível carregar os alertas.
            </p>
          ) : (
            <AlertFeed
              alerts={alerts}
              variant="dropdown"
              onAlertRead={handleAlertRead}
            />
          )}
        </div>

        <div className="border-t px-4 py-3">
          <Link
            href="/alerts"
            className="text-sm font-medium text-primary transition-colors hover:underline"
            onClick={() => {
              setOpen(false);
            }}
          >
            Ver todos
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
