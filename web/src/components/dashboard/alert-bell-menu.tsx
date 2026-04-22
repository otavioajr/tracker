"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ALERT_READ_EVENT,
  AlertFeed,
  type AlertFeedAlert,
} from "@/components/alerts/alert-feed";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type AlertBellMenuProps = {
  initialAlerts: AlertFeedAlert[];
  initialUnreadCount: number;
  hasLoadError?: boolean;
};

export function AlertBellMenu({
  initialAlerts,
  initialUnreadCount,
  hasLoadError = false,
}: AlertBellMenuProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const processedReadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    function applyReadEvent(id?: string) {
      if (!id || processedReadIdsRef.current.has(id)) return;

      processedReadIdsRef.current.add(id);
      setUnreadCount((current) => Math.max(0, current - 1));
    }

    function handleExternalAlertRead(event: Event) {
      const { detail } = event as CustomEvent<{ id?: string }>;

      applyReadEvent(detail?.id);
    }

    window.addEventListener(ALERT_READ_EVENT, handleExternalAlertRead);

    return () => {
      window.removeEventListener(ALERT_READ_EVENT, handleExternalAlertRead);
    };
  }, []);

  const triggerLabel =
    unreadCount === 0
      ? "Alertas"
      : `Alertas (${unreadCount} não lidos)`;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const subtitle =
    unreadCount > 0 ? `${unreadCount} não lidos` : "Nenhum novo alerta";

  function handleAlertRead(id: string) {
    if (processedReadIdsRef.current.has(id)) return;

    processedReadIdsRef.current.add(id);
    setUnreadCount((current) => Math.max(0, current - 1));
  }

  return (
    <Popover>
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
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Alertas</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>

        <div className="max-h-96 overflow-y-auto px-2 py-2">
          {hasLoadError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Não foi possível carregar os alertas.
            </p>
          ) : (
            <AlertFeed
              alerts={initialAlerts}
              variant="dropdown"
              onAlertRead={handleAlertRead}
            />
          )}
        </div>

        <div className="border-t px-4 py-3">
          <Link href="/alerts" className="text-sm font-medium text-primary transition-colors hover:underline">
            Ver todos
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
