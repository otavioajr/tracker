# Plan 3: Web Core — Auth, Layout & CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated web platform with login/register, dashboard layout with sidebar navigation, and full CRUD for vehicles and devices.

**Architecture:** Next.js 16 App Router with Supabase Auth (SSR). Server Actions for data mutations. shadcn/ui for components. All data queries go through Supabase client SDK with RLS enforcing tenant isolation.

**Tech Stack:** Next.js 16, TypeScript, Supabase SDK, shadcn/ui, Tailwind CSS, Zod

**Spec:** `docs/superpowers/specs/2026-03-17-vehicle-tracker-design.md`

**Existing code:** `web/src/lib/supabase/` (client, server, middleware), `web/src/types/database.ts` (generated), `web/src/middleware.ts`

---

## File Structure

```
web/src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx                  # CREATE — centered auth layout
│   │   ├── login/page.tsx              # CREATE — login page
│   │   └── register/page.tsx           # CREATE — register page
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # CREATE — sidebar + header layout
│   │   ├── page.tsx                    # CREATE — dashboard home
│   │   ├── vehicles/page.tsx           # CREATE — vehicle list + CRUD
│   │   └── devices/page.tsx            # CREATE — device list + CRUD
│   ├── auth/callback/route.ts          # CREATE — Supabase auth callback
│   ├── layout.tsx                      # MODIFY — minimal root layout
│   └── page.tsx                        # MODIFY — redirect to dashboard
├── components/
│   ├── ui/                             # CREATE — via shadcn CLI
│   ├── auth/
│   │   ├── login-form.tsx              # CREATE
│   │   └── register-form.tsx           # CREATE
│   ├── dashboard/
│   │   ├── sidebar.tsx                 # CREATE
│   │   └── header.tsx                  # CREATE
│   ├── vehicles/
│   │   ├── vehicle-table.tsx           # CREATE
│   │   └── vehicle-dialog.tsx          # CREATE
│   └── devices/
│       ├── device-table.tsx            # CREATE
│       └── device-dialog.tsx           # CREATE
├── lib/
│   ├── actions/
│   │   ├── auth.ts                     # CREATE — login, register, logout
│   │   ├── vehicles.ts                 # CREATE — CRUD server actions
│   │   ├── devices.ts                  # CREATE — CRUD server actions
│   │   └── utils.ts                    # CREATE — shared helpers (getTenantId)
│   └── supabase/                       # EXISTS
└── types/
    └── database.ts                     # EXISTS (generated)
```

---

### Task 1: shadcn/ui Setup

**Files:**
- Create: `web/components.json` (via shadcn init)
- Create: `web/src/components/ui/` (multiple files via shadcn add)
- Create: `web/src/lib/utils.ts`

- [ ] **Step 1: Initialize shadcn**

```bash
cd web && npx shadcn@latest init -d
```

Accept defaults (New York style, Zinc color, CSS variables).

- [ ] **Step 2: Add required components**

```bash
cd web && npx shadcn@latest add button input label card table dialog select badge separator toast sheet dropdown-menu avatar
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): add shadcn/ui components"
```

---

### Task 2: Auth Callback & Server Actions

**Files:**
- Create: `web/src/app/auth/callback/route.ts`
- Create: `web/src/lib/actions/auth.ts`

- [ ] **Step 1: Create auth callback route**

```typescript
// web/src/app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

- [ ] **Step 2: Create auth server actions**

```typescript
// web/src/lib/actions/auth.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function login(_prevState: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function register(_prevState: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const tenantId = formData.get("tenant_id") as string;

  if (!tenantId) {
    return { error: "ID do tenant é obrigatório. Solicite ao administrador." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        tenant_id: tenantId,
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

Note: `login` and `register` use the `useActionState` signature `(prevState, formData)` for compatibility with React 19's `useActionState` hook. See Task 3 for the form implementation.

- [ ] **Step 3: Create shared utils for server actions**

```typescript
// web/src/lib/actions/utils.ts
"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Get the authenticated user's tenant_id from their profile.
 * Must be called from a server action or server component.
 */
export async function getTenantId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Não autenticado");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("Perfil não encontrado");
  }

  return profile.tenant_id;
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/auth/ web/src/lib/actions/ && git commit -m "feat(web): add auth callback, server actions, and tenant utils"
```

---

### Task 3: Auth Pages (Login & Register)

**Files:**
- Create: `web/src/app/(auth)/layout.tsx`
- Create: `web/src/app/(auth)/login/page.tsx`
- Create: `web/src/app/(auth)/register/page.tsx`
- Create: `web/src/components/auth/login-form.tsx`
- Create: `web/src/components/auth/register-form.tsx`

- [ ] **Step 1: Create auth layout**

```tsx
// web/src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create login form component**

```tsx
// web/src/components/auth/login-form.tsx
"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Tracker</CardTitle>
        <CardDescription>Entre com suas credenciais</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required placeholder="seu@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required placeholder="********" />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Sem conta?{" "}
            <Link href="/register" className="text-primary underline">
              Registre-se
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create login page**

```tsx
// web/src/app/(auth)/login/page.tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 4: Create register form component**

```tsx
// web/src/components/auth/register-form.tsx
"use client";

import { useActionState } from "react";
import { register } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(register, null);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Criar Conta</CardTitle>
        <CardDescription>Preencha seus dados para se registrar</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" name="full_name" required placeholder="Seu nome" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required placeholder="seu@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required minLength={6} placeholder="********" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant_id">ID do Tenant</Label>
            <Input id="tenant_id" name="tenant_id" required placeholder="Fornecido pelo administrador" />
            <p className="text-xs text-muted-foreground">Solicite este ID ao administrador da plataforma.</p>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Criando conta..." : "Criar conta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Ja tem conta?{" "}
            <Link href="/login" className="text-primary underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create register page**

```tsx
// web/src/app/(auth)/register/page.tsx
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return <RegisterForm />;
}
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add web/src/app/\(auth\)/ web/src/components/auth/ && git commit -m "feat(web): add login and register pages"
```

---

### Task 4: Dashboard Layout (Sidebar + Header)

**Files:**
- Create: `web/src/app/(dashboard)/layout.tsx`
- Create: `web/src/components/dashboard/sidebar.tsx`
- Create: `web/src/components/dashboard/header.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Create sidebar component**

```tsx
// web/src/components/dashboard/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Car, Cpu, Map, Bell, FileText, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Mapa", icon: Map },
  { href: "/vehicles", label: "Veiculos", icon: Car },
  { href: "/devices", label: "Dispositivos", icon: Cpu },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/reports", label: "Relatorios", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex items-center justify-between h-14 px-4 border-b">
        {!collapsed && <span className="font-bold text-lg">Tracker</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-accent"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create header component**

```tsx
// web/src/components/dashboard/header.tsx
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export async function Header() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{user?.email}</span>
        <form action={logout}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut size={16} className="mr-2" />
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create dashboard layout**

```tsx
// web/src/app/(dashboard)/layout.tsx
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create dashboard home page**

```tsx
// web/src/app/(dashboard)/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { Car, Cpu, Bell } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [vehiclesRes, devicesRes, alertsRes] = await Promise.all([
    supabase.from("vehicles").select("*", { count: "exact", head: true }),
    supabase.from("devices").select("*", { count: "exact", head: true }),
    supabase.from("alerts").select("*", { count: "exact", head: true }).eq("read", false),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Veiculos</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vehiclesRes.count ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Dispositivos</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devicesRes.count ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Alertas nao lidos</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertsRes.count ?? 0}</div>
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground">O mapa em tempo real sera adicionado no Plan 4.</p>
    </div>
  );
}
```

- [ ] **Step 5: Update root page to redirect**

Replace `web/src/app/page.tsx` entirely:

```tsx
// web/src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/");
}
```

Wait — this creates a redirect loop. The dashboard page IS at `/` inside the `(dashboard)` route group. So the root `page.tsx` and `(dashboard)/page.tsx` will conflict. Remove `web/src/app/page.tsx` entirely — the `(dashboard)/page.tsx` will serve `/`.

- [ ] **Step 6: Install lucide-react icons**

```bash
cd web && npm install lucide-react
```

- [ ] **Step 7: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add web/ && git commit -m "feat(web): add dashboard layout with sidebar and header"
```

---

### Task 5: Vehicle CRUD

**Files:**
- Create: `web/src/lib/actions/vehicles.ts`
- Create: `web/src/components/vehicles/vehicle-table.tsx`
- Create: `web/src/components/vehicles/vehicle-dialog.tsx`
- Create: `web/src/app/(dashboard)/vehicles/page.tsx`

- [ ] **Step 1: Create vehicle server actions**

```typescript
// web/src/lib/actions/vehicles.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";

export async function getVehicles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, devices(imei, protocol, last_communication_at)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createVehicle(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { error } = await supabase.from("vehicles").insert({
    tenant_id: tenantId,
    plate: formData.get("plate") as string,
    brand: formData.get("brand") as string || null,
    model: formData.get("model") as string || null,
    year: formData.get("year") ? parseInt(formData.get("year") as string) : null,
    color: formData.get("color") as string || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}

export async function updateVehicle(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vehicles")
    .update({
      plate: formData.get("plate") as string,
      brand: formData.get("brand") as string || null,
      model: formData.get("model") as string || null,
      year: formData.get("year") ? parseInt(formData.get("year") as string) : null,
      color: formData.get("color") as string || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}

export async function deleteVehicle(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}

export async function associateDevice(vehicleId: string, deviceId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ device_id: deviceId })
    .eq("id", vehicleId);

  if (error) return { error: error.message };

  revalidatePath("/vehicles");
  return { success: true };
}
```

- [ ] **Step 2: Create vehicle dialog (create/edit form)**

```tsx
// web/src/components/vehicles/vehicle-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createVehicle, updateVehicle } from "@/lib/actions/vehicles";
import { Plus, Pencil } from "lucide-react";

type Vehicle = {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
};

export function VehicleDialog({ vehicle }: { vehicle?: Vehicle }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!vehicle;

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEdit
      ? await updateVehicle(vehicle!.id, formData)
      : await createVehicle(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm"><Pencil size={14} /></Button>
        ) : (
          <Button><Plus size={16} className="mr-2" /> Novo Veiculo</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Veiculo" : "Novo Veiculo"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="plate">Placa</Label>
            <Input id="plate" name="plate" required defaultValue={vehicle?.plate ?? ""} placeholder="ABC-1234" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" name="brand" defaultValue={vehicle?.brand ?? ""} placeholder="Toyota" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Input id="model" name="model" defaultValue={vehicle?.model ?? ""} placeholder="Hilux" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Ano</Label>
              <Input id="year" name="year" type="number" defaultValue={vehicle?.year ?? ""} placeholder="2024" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" name="color" defaultValue={vehicle?.color ?? ""} placeholder="Branco" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">{isEdit ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create vehicle table component**

```tsx
// web/src/components/vehicles/vehicle-table.tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleDialog } from "./vehicle-dialog";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { Trash2, Cpu } from "lucide-react";
import { useState } from "react";

type Vehicle = {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  active: boolean;
  device_id: string | null;
  devices: { imei: string; protocol: string; last_communication_at: string | null } | null;
};

export function VehicleTable({ vehicles }: { vehicles: Vehicle[] }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este veiculo?")) return;
    setDeleting(id);
    await deleteVehicle(id);
    setDeleting(null);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Placa</TableHead>
          <TableHead>Marca/Modelo</TableHead>
          <TableHead>Ano</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Dispositivo</TableHead>
          <TableHead className="w-24">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              Nenhum veiculo cadastrado
            </TableCell>
          </TableRow>
        )}
        {vehicles.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.plate}</TableCell>
            <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
            <TableCell>{v.year ?? "—"}</TableCell>
            <TableCell>{v.color ?? "—"}</TableCell>
            <TableCell>
              {v.devices ? (
                <Badge variant="outline" className="gap-1">
                  <Cpu size={12} /> {v.devices.imei}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm">Sem dispositivo</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <VehicleDialog vehicle={v} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(v.id)}
                  disabled={deleting === v.id}
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Create vehicles page**

```tsx
// web/src/app/(dashboard)/vehicles/page.tsx
import { getVehicles } from "@/lib/actions/vehicles";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";

export default async function VehiclesPage() {
  const vehicles = await getVehicles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Veiculos</h1>
        <VehicleDialog />
      </div>
      <VehicleTable vehicles={vehicles} />
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/actions/vehicles.ts web/src/components/vehicles/ web/src/app/\(dashboard\)/vehicles/ && git commit -m "feat(web): add vehicle CRUD with table and dialog"
```

---

### Task 6: Device CRUD

**Files:**
- Create: `web/src/lib/actions/devices.ts`
- Create: `web/src/components/devices/device-table.tsx`
- Create: `web/src/components/devices/device-dialog.tsx`
- Create: `web/src/app/(dashboard)/devices/page.tsx`

- [ ] **Step 1: Create device server actions**

```typescript
// web/src/lib/actions/devices.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";

export async function getDevices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devices")
    .select("*, vehicles(id, plate)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createDevice(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { error } = await supabase.from("devices").insert({
    tenant_id: tenantId,
    imei: formData.get("imei") as string,
    protocol: formData.get("protocol") as string || "suntech",
    model: formData.get("model") as string || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}

export async function updateDevice(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("devices")
    .update({
      imei: formData.get("imei") as string,
      model: formData.get("model") as string || null,
      active: formData.get("active") === "true",
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}

export async function deleteDevice(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("devices").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}
```

- [ ] **Step 2: Create device dialog**

```tsx
// web/src/components/devices/device-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createDevice, updateDevice } from "@/lib/actions/devices";
import { Plus, Pencil } from "lucide-react";

type Device = {
  id: string;
  imei: string;
  protocol: string;
  model: string | null;
  active: boolean;
};

export function DeviceDialog({ device }: { device?: Device }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!device;

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEdit
      ? await updateDevice(device!.id, formData)
      : await createDevice(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm"><Pencil size={14} /></Button>
        ) : (
          <Button><Plus size={16} className="mr-2" /> Novo Dispositivo</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Dispositivo" : "Novo Dispositivo"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="imei">IMEI</Label>
            <Input id="imei" name="imei" required defaultValue={device?.imei ?? ""} placeholder="123456789012345" disabled={isEdit} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="protocol">Protocolo</Label>
              <Input id="protocol" name="protocol" defaultValue={device?.protocol ?? "suntech"} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Input id="model" name="model" defaultValue={device?.model ?? ""} placeholder="ST340LC" />
            </div>
          </div>
          {isEdit && <input type="hidden" name="active" value={String(device?.active ?? true)} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">{isEdit ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create device table**

```tsx
// web/src/components/devices/device-table.tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeviceDialog } from "./device-dialog";
import { deleteDevice } from "@/lib/actions/devices";
import { Trash2, Car } from "lucide-react";
import { useState } from "react";

type Device = {
  id: string;
  imei: string;
  protocol: string;
  model: string | null;
  active: boolean;
  last_communication_at: string | null;
  vehicles: { id: string; plate: string }[] | null;
};

export function DeviceTable({ devices }: { devices: Device[] }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este dispositivo?")) return;
    setDeleting(id);
    await deleteDevice(id);
    setDeleting(null);
  }

  function formatDate(date: string | null) {
    if (!date) return "Nunca";
    return new Date(date).toLocaleString("pt-BR");
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>IMEI</TableHead>
          <TableHead>Protocolo</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead>Veiculo</TableHead>
          <TableHead>Ultima comunicacao</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              Nenhum dispositivo cadastrado
            </TableCell>
          </TableRow>
        )}
        {devices.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-mono text-sm">{d.imei}</TableCell>
            <TableCell><Badge variant="outline">{d.protocol}</Badge></TableCell>
            <TableCell>{d.model ?? "—"}</TableCell>
            <TableCell>
              {d.vehicles && d.vehicles.length > 0 ? (
                <Badge variant="secondary" className="gap-1">
                  <Car size={12} /> {d.vehicles[0].plate}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm">Sem veiculo</span>
              )}
            </TableCell>
            <TableCell className="text-sm">{formatDate(d.last_communication_at)}</TableCell>
            <TableCell>
              <Badge variant={d.active ? "default" : "secondary"}>
                {d.active ? "Ativo" : "Inativo"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <DeviceDialog device={d} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(d.id)}
                  disabled={deleting === d.id}
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Create devices page**

```tsx
// web/src/app/(dashboard)/devices/page.tsx
import { getDevices } from "@/lib/actions/devices";
import { DeviceTable } from "@/components/devices/device-table";
import { DeviceDialog } from "@/components/devices/device-dialog";

export default async function DevicesPage() {
  const devices = await getDevices();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dispositivos</h1>
        <DeviceDialog />
      </div>
      <DeviceTable devices={devices} />
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/actions/devices.ts web/src/components/devices/ web/src/app/\(dashboard\)/devices/ && git commit -m "feat(web): add device CRUD with table and dialog"
```

---

### Task 7: Root Page Cleanup & Final Verification

**Files:**
- Delete: `web/src/app/page.tsx` (conflicts with dashboard route group)
- Modify: `web/src/app/layout.tsx` (clean up default styles)

- [ ] **Step 1: Remove root page.tsx**

The `(dashboard)/page.tsx` already serves `/`. The root `page.tsx` would conflict. Delete it.

```bash
rm web/src/app/page.tsx
```

- [ ] **Step 2: Clean up root layout**

Replace `web/src/app/layout.tsx` with a minimal version (remove the default Next.js styles/fonts if they cause visual conflicts):

```tsx
// web/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker",
  description: "Plataforma de rastreamento veicular",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify full build**

Run: `cd web && npm run build`
Expected: Build succeeds with pages: `/`, `/login`, `/register`, `/vehicles`, `/devices`

- [ ] **Step 4: Final commit**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): clean up root layout and remove conflicting page"
```
