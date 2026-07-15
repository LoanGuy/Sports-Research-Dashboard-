import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Calculator, Info, LineChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCLAIMER } from "@shared/types";
import { MOCK_DATA_NOTICE } from "@/data/opportunities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const navItems = [
  { href: "/", label: "Research", icon: LineChart },
  { href: "/live", label: "Live", icon: Activity },
  { href: "/calculators", label: "Calculators", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Mobile-first shell: sticky header, scrollable content, bottom navigation
 * with 44px+ touch targets. The standing disclaimer is one tap away at all
 * times and repeated in the footer.
 */
export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [location] = useLocation();

  // Each page starts at the top when navigating.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-bold tracking-tight text-foreground">
              {title ?? "Edge Research"}
            </h1>
            <p className="truncate text-[11px] leading-3 text-muted-foreground">
              Research tool · sample data · no wagers placed
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover-elevate"
                aria-label="About this dashboard"
                data-testid="button-disclaimer"
              >
                <Info className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-[13px] leading-snug">
              <p className="font-semibold text-foreground">About this dashboard</p>
              <p className="mt-1.5 text-muted-foreground">{DISCLAIMER}</p>
              <p className="mt-2 text-muted-foreground">{MOCK_DATA_NOTICE}</p>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      <footer className="px-4 pb-24 pt-2">
        <p className="text-[11px] leading-4 text-muted-foreground">{DISCLAIMER}</p>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? location === "/" || location.startsWith("/opportunity") : location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className={cn("h-5 w-5", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
