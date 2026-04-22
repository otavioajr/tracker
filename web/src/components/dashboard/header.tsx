import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { AlertBell } from "./alert-bell";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initials = user?.email?.charAt(0)?.toUpperCase() ?? "U";

  return (
    <header className="h-14 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
      <div className="lg:hidden">
        <span className="text-base font-bold tracking-tight">
          <span className="text-primary">●</span> Tracker
        </span>
      </div>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-3">
        <AlertBell />
        <span className="hidden lg:inline text-sm text-muted-foreground">
          {user?.email}
        </span>
        <div className="lg:hidden w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        <form action={logout} className="hidden lg:block">
          <Button variant="ghost" size="sm" type="submit">
            <LogOut size={16} className="mr-2" />
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
