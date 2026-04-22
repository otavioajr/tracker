"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Map, Car, Clock, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { MobileMoreMenu } from "./mobile-more-menu";

const navItems = [
  { href: "/", label: "Mapa", icon: Map },
  { href: "/vehicles", label: "Frota", icon: Car },
  { href: "/history", label: "Histórico", icon: Clock },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = ["/devices", "/geofences", "/reports"].some((p) =>
    pathname.startsWith(p)
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="nav-glass border-t border-white/[0.06]">
          <div
            className="flex items-center justify-around px-2"
            style={{
              paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            }}
          >
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
                    "flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[64px] transition-all duration-200",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center w-10 h-7 rounded-full transition-all duration-300",
                      isActive && "bg-primary/15"
                    )}
                  >
                    <item.icon
                      size={20}
                      strokeWidth={isActive ? 2.5 : 1.8}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tracking-wide">
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <button
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[64px] transition-all duration-200",
                isMoreActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-7 rounded-full transition-all duration-300",
                  isMoreActive && "bg-primary/15"
                )}
              >
                <MoreHorizontal
                  size={20}
                  strokeWidth={isMoreActive ? 2.5 : 1.8}
                />
              </div>
              <span className="text-[10px] font-semibold tracking-wide">
                Mais
              </span>
            </button>
          </div>
        </div>
      </nav>
      <MobileMoreMenu open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
