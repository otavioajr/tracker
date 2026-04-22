# Alert Bell Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o sininho do header por um dropdown ancorado que mostra os 10 alertas mais recentes, destaca não lidos, permite marcar cada item como lido por ícone de olho e mantém `/alerts` via link `Ver todos`.

**Architecture:** Manter `AlertBell` como Server Component que busca contador + lista recente e delega interação a um novo `AlertBellMenu` client-side. Reaproveitar `AlertFeed` com uma variante compacta de dropdown e callback local para decrementar badge sem recarregar a página.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Base UI `Menu`, Tailwind CSS v4, lucide-react, Vitest, Testing Library.

**Spec de referência:** `docs/superpowers/specs/2026-04-21-alert-bell-dropdown-design.md`

---

## Nota de Workspace

Antes de começar, preserve mudanças locais já existentes neste workspace:

- `web/src/components/dashboard/header.tsx` já contém a montagem de `<AlertBell />`
- `web/src/lib/actions/alerts.ts` já contém `getUnreadAlertCount()`
- `web/src/components/dashboard/alert-bell.tsx` existe como arquivo local novo

Não reverta essas mudanças. Use-as como baseline se o trabalho for executado neste checkout. Se executar em worktree limpo, reintroduza o mesmo wiring explicitamente nas tarefas abaixo.

## Visão Geral de Arquivos

### Novos
- `web/src/components/dashboard/alert-bell-menu.tsx`
- `web/src/components/dashboard/alert-bell-menu.test.tsx`
- `web/src/components/dashboard/alert-bell.test.tsx`
- `web/src/components/alerts/alert-feed.test.tsx`

### Modificados
- `web/src/components/dashboard/alert-bell.tsx` — deixa de ser link puro; busca contador + últimos 10 alertas; trata falha parcial
- `web/src/components/alerts/alert-feed.tsx` — ganha variante `dropdown`, ícone de olho, estado local e callback `onAlertRead`
- `web/src/lib/actions/alerts.ts` — garantir `getUnreadAlertCount()` com assinatura estável
- `web/src/components/dashboard/header.tsx` — somente se necessário num checkout limpo; manter `<AlertBell />` no grupo direito do header

---

## Task 1: Reutilizar `AlertFeed` para página e dropdown

**Files:**
- Modify: `web/src/components/alerts/alert-feed.tsx`
- Test: `web/src/components/alerts/alert-feed.test.tsx`

- [ ] **Step 1: Escrever testes falhando para variante compacta e update local**

Create `web/src/components/alerts/alert-feed.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { markAlertRead } = vi.hoisted(() => ({
  markAlertRead: vi.fn(),
}));

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead,
}));

import { AlertFeed, type AlertFeedAlert } from "./alert-feed";

const alerts: AlertFeedAlert[] = [
  {
    id: "alert-1",
    type: "speed",
    severity: "warning",
    message: "Excesso de velocidade detectado",
    read: false,
    created_at: "2026-04-21T13:00:00.000Z",
    devices: {
      imei: "861234567890123",
      vehicles: { plate: "ABC1D23" },
    },
  },
  {
    id: "alert-2",
    type: "ignition",
    severity: "info",
    message: "Ignição ligada",
    read: true,
    created_at: "2026-04-21T12:00:00.000Z",
    devices: {
      imei: "861234567890124",
      vehicles: { plate: "XYZ9K88" },
    },
  },
];

describe("AlertFeed", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders dropdown variant and marks one alert as read locally", async () => {
    const onAlertRead = vi.fn();
    markAlertRead.mockResolvedValueOnce({ success: true });

    render(
      <AlertFeed
        alerts={alerts}
        variant="dropdown"
        onAlertRead={onAlertRead}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /marcar alerta como lido/i })
    );

    await waitFor(() => {
      expect(markAlertRead).toHaveBeenCalledWith("alert-1");
    });

    await waitFor(() => {
      expect(onAlertRead).toHaveBeenCalledWith("alert-1");
    });

    expect(
      screen.queryByRole("button", { name: /marcar alerta como lido/i })
    ).toBeNull();
  });

  it("keeps the alert unread when markAlertRead fails", async () => {
    const onAlertRead = vi.fn();
    markAlertRead.mockResolvedValueOnce({ error: "falhou" });

    render(
      <AlertFeed
        alerts={[alerts[0]]}
        variant="dropdown"
        onAlertRead={onAlertRead}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /marcar alerta como lido/i })
    );

    await waitFor(() => {
      expect(markAlertRead).toHaveBeenCalledWith("alert-1");
    });

    expect(onAlertRead).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /marcar alerta como lido/i })
    ).toBeTruthy();
  });

  it("shows empty state for no alerts", () => {
    render(<AlertFeed alerts={[]} variant="dropdown" />);
    expect(screen.getByText("Nenhum alerta encontrado.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**

Run: `cd web && npm run test -- src/components/alerts/alert-feed.test.tsx`
Expected: FAIL com erro de import/export ou props inexistentes (`variant`, `onAlertRead`, `AlertFeedAlert`).

- [ ] **Step 3: Implementar variante compacta, estado local e ícone de olho**

Update `web/src/components/alerts/alert-feed.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, Info, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAlertRead } from "@/lib/actions/alerts";
import { cn } from "@/lib/utils";

type Vehicle = { plate: string } | null;
type Device = { imei: string; vehicles: Vehicle | Vehicle[] | null } | null;

export type AlertFeedAlert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  read: boolean;
  created_at: string;
  devices: Device | Device[] | null;
};

type AlertFeedProps = {
  alerts: AlertFeedAlert[];
  variant?: "page" | "dropdown";
  onAlertRead?: (id: string) => void;
};

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertTriangle size={16} className="text-destructive" />;
    case "warning":
      return <Zap size={16} className="text-yellow-500" />;
    default:
      return <Info size={16} className="text-blue-500" />;
  }
}

function getSeverityVariant(
  severity: string
): "destructive" | "default" | "secondary" {
  switch (severity) {
    case "critical":
      return "destructive";
    case "warning":
      return "default";
    default:
      return "secondary";
  }
}

function getVehicleLabel(device: Device | Device[] | null): string {
  const d = Array.isArray(device) ? device[0] : device;
  if (!d) return "—";

  const vehicles = d.vehicles;
  const vehicle = Array.isArray(vehicles) ? vehicles[0] : vehicles;

  if (vehicle?.plate) return vehicle.plate;
  return d.imei ?? "—";
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function AlertFeed({
  alerts,
  variant = "page",
  onAlertRead,
}: AlertFeedProps) {
  const [items, setItems] = useState(alerts);
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    setItems(alerts);
  }, [alerts]);

  async function handleMarkRead(id: string) {
    setMarking(id);
    const result = await markAlertRead(id);

    if (!result?.error) {
      setItems((current) =>
        current.map((alert) =>
          alert.id === id ? { ...alert, read: true } : alert
        )
      );
      onAlertRead?.(id);
    }

    setMarking(null);
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum alerta encontrado.
      </p>
    );
  }

  return (
    <div className={variant === "dropdown" ? "space-y-2" : "space-y-3"}>
      {items.map((alert) => (
        <Card
          key={alert.id}
          size={variant === "dropdown" ? "sm" : "default"}
          className={cn(!alert.read && "bg-accent/50")}
        >
          <CardContent
            className={cn(
              "flex items-start gap-3",
              variant === "dropdown" ? "py-3" : "py-4"
            )}
          >
            <div className="mt-0.5">{getSeverityIcon(alert.severity)}</div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={getSeverityVariant(alert.severity)}>
                  {alert.type}
                </Badge>
                <span
                  className={cn(
                    "font-medium",
                    variant === "dropdown" ? "text-[13px]" : "text-sm"
                  )}
                >
                  {getVehicleLabel(alert.devices)}
                </span>
              </div>

              <p
                className={cn(
                  "text-muted-foreground",
                  variant === "dropdown" ? "text-[13px]" : "text-sm"
                )}
              >
                {alert.message}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(alert.created_at)}
              </p>
            </div>

            {!alert.read && (
              <Button
                variant="ghost"
                size="sm"
                disabled={marking === alert.id}
                aria-label="Marcar alerta como lido"
                title="Marcar alerta como lido"
                onClick={() => handleMarkRead(alert.id)}
              >
                <Eye size={14} />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rodar teste e confirmar passagem**

Run: `cd web && npm run test -- src/components/alerts/alert-feed.test.tsx`
Expected: PASS com 3 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/alerts/alert-feed.tsx web/src/components/alerts/alert-feed.test.tsx
git commit -m "feat(web): add dropdown variant to alert feed"
```

---

## Task 2: Criar dropdown client-side do sininho

**Files:**
- Create: `web/src/components/dashboard/alert-bell-menu.tsx`
- Test: `web/src/components/dashboard/alert-bell-menu.test.tsx`

- [ ] **Step 1: Escrever testes falhando para abertura, erro e badge local**

Create `web/src/components/dashboard/alert-bell-menu.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { markAlertRead } = vi.hoisted(() => ({
  markAlertRead: vi.fn(),
}));

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead,
}));

import type { AlertFeedAlert } from "@/components/alerts/alert-feed";
import { AlertBellMenu } from "./alert-bell-menu";

const alerts: AlertFeedAlert[] = [
  {
    id: "alert-1",
    type: "speed",
    severity: "warning",
    message: "Excesso de velocidade detectado",
    read: false,
    created_at: "2026-04-21T13:00:00.000Z",
    devices: {
      imei: "861234567890123",
      vehicles: { plate: "ABC1D23" },
    },
  },
  {
    id: "alert-2",
    type: "ignition",
    severity: "info",
    message: "Ignição ligada",
    read: false,
    created_at: "2026-04-21T12:00:00.000Z",
    devices: {
      imei: "861234567890124",
      vehicles: { plate: "XYZ9K88" },
    },
  },
];

describe("AlertBellMenu", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the dropdown and shows recent alerts", async () => {
    render(
      <AlertBellMenu
        initialAlerts={alerts}
        initialUnreadCount={2}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /alertas \(2 não lidos\)/i })
    );

    expect(await screen.findByText("Alertas")).toBeTruthy();
    expect(screen.getByText("2 não lidos")).toBeTruthy();
    expect(screen.getByText("Excesso de velocidade detectado")).toBeTruthy();
    expect(screen.getByRole("link", { name: /ver todos/i })).toHaveAttribute(
      "href",
      "/alerts"
    );
  });

  it("decrements the badge when one unread alert is marked as read", async () => {
    markAlertRead.mockResolvedValueOnce({ success: true });

    render(
      <AlertBellMenu
        initialAlerts={alerts}
        initialUnreadCount={2}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /alertas \(2 não lidos\)/i })
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /marcar alerta como lido/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /alertas \(1 não lidos\)/i })
      ).toBeTruthy();
    });
  });

  it("shows load error state without breaking the footer link", async () => {
    render(
      <AlertBellMenu
        initialAlerts={[]}
        initialUnreadCount={0}
        hasLoadError
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Alertas" }));

    expect(
      await screen.findByText("Não foi possível carregar os alertas.")
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /ver todos/i })).toHaveAttribute(
      "href",
      "/alerts"
    );
  });
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**

Run: `cd web && npm run test -- src/components/dashboard/alert-bell-menu.test.tsx`
Expected: FAIL com `Cannot find module './alert-bell-menu'`.

- [ ] **Step 3: Implementar componente client com dropdown, contador e footer**

Create `web/src/components/dashboard/alert-bell-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";

import { AlertFeed, type AlertFeedAlert } from "@/components/alerts/alert-feed";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const display = unreadCount > 99 ? "99+" : String(unreadCount);

  function handleAlertRead() {
    setUnreadCount((current) => Math.max(0, current - 1));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Alertas${unreadCount > 0 ? ` (${unreadCount} não lidos)` : ""}`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {display}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1rem))] rounded-xl p-0"
      >
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Alertas</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} não lidos` : "Nenhum novo alerta"}
            </p>
          </div>
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

        <div className="border-t border-border/50 p-2">
          <Link
            href="/alerts"
            className="flex h-9 items-center justify-center rounded-lg text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Ver todos
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Rodar teste e confirmar passagem**

Run: `cd web && npm run test -- src/components/dashboard/alert-bell-menu.test.tsx`
Expected: PASS com 3 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/dashboard/alert-bell-menu.tsx web/src/components/dashboard/alert-bell-menu.test.tsx
git commit -m "feat(web): add alert bell dropdown menu"
```

---

## Task 3: Buscar dados no servidor e ligar o dropdown ao header

**Files:**
- Modify: `web/src/components/dashboard/alert-bell.tsx`
- Modify: `web/src/lib/actions/alerts.ts`
- Modify: `web/src/components/dashboard/header.tsx` (somente se necessário num checkout limpo)
- Test: `web/src/components/dashboard/alert-bell.test.tsx`

- [ ] **Step 1: Escrever testes falhando para fetch server-side e fallback**

Create `web/src/components/dashboard/alert-bell.test.tsx`:

```tsx
// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const {
  getUnreadAlertCount,
  getAlerts,
  alertBellMenuMock,
} = vi.hoisted(() => ({
  getUnreadAlertCount: vi.fn(),
  getAlerts: vi.fn(),
  alertBellMenuMock: vi.fn(() => <div data-testid="alert-bell-menu" />),
}));

vi.mock("@/lib/actions/alerts", () => ({
  getUnreadAlertCount,
  getAlerts,
}));

vi.mock("./alert-bell-menu", () => ({
  AlertBellMenu: alertBellMenuMock,
}));

import { AlertBell } from "./alert-bell";

describe("AlertBell", () => {
  it("passes unread count and recent alerts to the client menu", async () => {
    getUnreadAlertCount.mockResolvedValueOnce(3);
    getAlerts.mockResolvedValueOnce([
      {
        id: "alert-1",
        type: "speed",
        severity: "warning",
        message: "Excesso de velocidade detectado",
        read: false,
        created_at: "2026-04-21T13:00:00.000Z",
        devices: null,
      },
    ]);

    const tree = await AlertBell();
    render(tree);

    expect(getUnreadAlertCount).toHaveBeenCalledTimes(1);
    expect(getAlerts).toHaveBeenCalledWith(10);
    expect(screen.getByTestId("alert-bell-menu")).toBeTruthy();
    expect(alertBellMenuMock.mock.calls[0][0]).toEqual({
      initialUnreadCount: 3,
      initialAlerts: [
        {
          id: "alert-1",
          type: "speed",
          severity: "warning",
          message: "Excesso de velocidade detectado",
          read: false,
          created_at: "2026-04-21T13:00:00.000Z",
          devices: null,
        },
      ],
      hasLoadError: false,
    });
  });

  it("falls back to empty alerts and error state when recent alerts fail", async () => {
    getUnreadAlertCount.mockResolvedValueOnce(2);
    getAlerts.mockRejectedValueOnce(new Error("boom"));

    const tree = await AlertBell();
    render(tree);

    expect(alertBellMenuMock.mock.calls[0][0]).toEqual({
      initialUnreadCount: 2,
      initialAlerts: [],
      hasLoadError: true,
    });
  });
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**

Run: `cd web && npm run test -- src/components/dashboard/alert-bell.test.tsx`
Expected: FAIL porque `AlertBell` ainda retorna `<Link>` puro e não chama `AlertBellMenu`.

- [ ] **Step 3: Implementar wrapper server e garantir action de contador**

Update `web/src/components/dashboard/alert-bell.tsx`:

```tsx
import { getAlerts, getUnreadAlertCount } from "@/lib/actions/alerts";
import { AlertBellMenu } from "./alert-bell-menu";

const RECENT_ALERTS_LIMIT = 10;

export async function AlertBell() {
  const [countResult, alertsResult] = await Promise.allSettled([
    getUnreadAlertCount(),
    getAlerts(RECENT_ALERTS_LIMIT),
  ]);

  const initialUnreadCount =
    countResult.status === "fulfilled" ? countResult.value : 0;

  const initialAlerts =
    alertsResult.status === "fulfilled" ? alertsResult.value : [];

  return (
    <AlertBellMenu
      initialUnreadCount={initialUnreadCount}
      initialAlerts={initialAlerts}
      hasLoadError={alertsResult.status === "rejected"}
    />
  );
}
```

Ensure `web/src/lib/actions/alerts.ts` contains:

```ts
export async function getUnreadAlertCount() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("alerts")
    .select("*", { count: "exact", head: true })
    .eq("read", false);

  if (error) return 0;
  return count ?? 0;
}
```

If executing from checkout limpo, ensure `web/src/components/dashboard/header.tsx` still mounts `AlertBell`:

```tsx
import { AlertBell } from "./alert-bell";

// ...
<div className="flex items-center gap-3">
  <AlertBell />
  <span className="hidden lg:inline text-sm text-muted-foreground">
    {user?.email}
  </span>
```

- [ ] **Step 4: Rodar teste e confirmar passagem**

Run: `cd web && npm run test -- src/components/dashboard/alert-bell.test.tsx`
Expected: PASS com 2 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/dashboard/alert-bell.tsx web/src/lib/actions/alerts.ts web/src/components/dashboard/header.tsx web/src/components/dashboard/alert-bell.test.tsx
git commit -m "feat(web): wire alert bell dropdown data"
```

---

## Task 4: Verificação integrada e lint do fluxo completo

**Files:**
- No code changes expected; only verification and small polish if a test exposes mismatch

- [ ] **Step 1: Rodar suíte focada do recurso**

Run:

```bash
cd web && npm run test -- \
  src/components/alerts/alert-feed.test.tsx \
  src/components/dashboard/alert-bell-menu.test.tsx \
  src/components/dashboard/alert-bell.test.tsx
```

Expected: PASS com todas as suítes verdes.

- [ ] **Step 2: Rodar lint dos arquivos alterados**

Run:

```bash
cd web && npm run lint -- \
  src/components/alerts/alert-feed.tsx \
  src/components/alerts/alert-feed.test.tsx \
  src/components/dashboard/alert-bell.tsx \
  src/components/dashboard/alert-bell-menu.tsx \
  src/components/dashboard/alert-bell-menu.test.tsx \
  src/components/dashboard/alert-bell.test.tsx
```

Expected: sem erros.

- [ ] **Step 3: Verificação manual no navegador**

Run dev server se ainda não estiver ativo:

```bash
cd web && npm run dev
```

Manual check:

- login em conta válida
- clicar no sino
- confirmar dropdown abaixo do ícone
- confirmar rolagem interna com muitos alertas
- clicar no olho
- confirmar destaque removido e badge decrementado
- clicar em `Ver todos`
- confirmar navegação para `/alerts`

- [ ] **Step 4: Ajustar qualquer mismatch visual pequeno detectado na verificação**

Se a revisão manual encontrar overflow, largura ruim ou alinhamento quebrado, limite os ajustes a:

```tsx
<DropdownMenuContent
  align="end"
  sideOffset={8}
  className="w-[min(24rem,calc(100vw-1rem))] rounded-xl p-0"
>
```

e:

```tsx
<div className="max-h-96 overflow-y-auto px-2 py-2">
```

Não ampliar escopo para realtime, filtros ou navegação por item.

- [ ] **Step 5: Commit final**

```bash
git add web/src/components/alerts/alert-feed.tsx web/src/components/alerts/alert-feed.test.tsx web/src/components/dashboard/alert-bell.tsx web/src/components/dashboard/alert-bell-menu.tsx web/src/components/dashboard/alert-bell-menu.test.tsx web/src/components/dashboard/alert-bell.test.tsx web/src/lib/actions/alerts.ts web/src/components/dashboard/header.tsx
git commit -m "feat(web): add alert bell dropdown"
```

---

## Self-Review

### Cobertura da spec

- dropdown abaixo do sino: coberto na Task 2
- últimos alertas com destaque para novos: coberto na Task 1 + Task 2
- sem clique no corpo do alerta: mantido em `AlertFeed` sem `Link`
- ícone de olho para marcar lido: coberto na Task 1
- badge atualiza localmente: coberto na Task 2
- `/alerts` continua acessível: coberto na Task 2 + manual check Task 4
- estado vazio e erro: coberto na Task 1 + Task 2 + Task 3

### Placeholder scan

- sem `TODO`
- sem `TBD`
- sem referências vagas tipo “ajuste conforme necessário”

### Consistência de tipos

- tipo compartilhado: `AlertFeedAlert`
- callback estável: `onAlertRead(id: string)`
- props estáveis do menu: `initialAlerts`, `initialUnreadCount`, `hasLoadError`
- limite de lista fixado em `10`
