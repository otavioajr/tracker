"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Cpu, MapPin, FileText, LogOut } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { logout } from "@/lib/actions/auth";

const moreItems = [
  {
    href: "/devices",
    label: "Dispositivos",
    icon: Cpu,
    description: "Gerenciar rastreadores",
  },
  {
    href: "/geofences",
    label: "Geocercas",
    icon: MapPin,
    description: "Áreas monitoradas",
  },
  {
    href: "/reports",
    label: "Relatórios",
    icon: FileText,
    description: "Dados e exportações",
  },
];

export function MobileMoreMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl"
        style={{
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/20 mb-1" />
        <SheetHeader>
          <SheetTitle>Mais opções</SheetTitle>
        </SheetHeader>
        <div className="space-y-1">
          {moreItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-4 rounded-xl px-4 py-3.5 transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground active:bg-accent"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg",
                    isActive ? "bg-primary/15" : "bg-muted"
                  )}
                >
                  <item.icon size={20} />
                </div>
                <div>
                  <div className="font-semibold text-sm">{item.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border/50">
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-4 rounded-xl px-4 py-3.5 w-full text-left text-destructive active:bg-destructive/10 transition-colors"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10">
                <LogOut size={20} />
              </div>
              <div>
                <div className="font-semibold text-sm">Sair</div>
                <div className="text-xs text-muted-foreground">
                  Encerrar sessão
                </div>
              </div>
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
