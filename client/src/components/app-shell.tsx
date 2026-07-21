import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Calculator, Info, LineChart, NotebookPen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCLAIMER } from "@shared/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const navItems = [
  { href: "/", label: "Research", icon: LineChart },
  { href: "/live", label: "Live", icon: Activity },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/calculators", label: "Calculators", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(location: string, href: string): boolean {
  return href === "/"
    ? location === "/" || location.startsWith("/opportunity")
    : location.startsWith(href);
}

/**
 * Responsive shell. Phones get a sticky header + bottom tab bar with 44px+
 * touch targets; medium screens and up get a full-width layout with the
 * navigation moved into the header. The standing disclaimer is one tap away
 * at all times and repeated in the footer.
 */
export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [location] = useLocation();

  // Each page starts at the top when navigating.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-background md:max-w-6xl">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-bold tracking-tight text-foreground">
              {title ?? "Edge Research"}
            </h1>
            <p className="truncate text-[11px] leading-3 text-muted-foreground">
              Research tool · no wagers placed
            </p>
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop navigation lives in the header. */}
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const active = isActive(location, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-10 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium",
                      active
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover-elevate",
                    )}
                    data-testid={`nav-desktop-${item.label.toLowerCase()}`}
                  >
                    <Icon className={cn("h-4 w-4", active && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

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
                <p className="mt-2 text-muted-foreground">
                Odds come from licensed data providers (SportsGameOdds and The Odds API) and are
                about 10 minutes delayed on the current plans. All collected books shape the
                market consensus; only your own books surface as opportunities.
              </p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-8">{children}</main>

      <footer className="px-4 pb-24 pt-2 md:pb-6">
        <p className="text-[11px] leading-4 text-muted-foreground">{DISCLAIMER}</p>
      </footer>

      {/* Bottom tab bar: phones only. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {navItems.map((item) => {
            const active = isActive(location, item.href);
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
