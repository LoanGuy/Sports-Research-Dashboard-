import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import ResearchPage from "./pages/research";
import OpportunityDetailPage from "./pages/opportunity-detail";
import LivePage from "./pages/live";
import CalculatorsPage from "./pages/calculators";
import AppSettingsPage from "./pages/app-settings";
import JournalPage from "./pages/journal";
import ReportPage from "./pages/report";
import TrendsPage from "./pages/trends";
import HistoryPage from "./pages/history";
import LoginPage from "./pages/login";
import NotFound from "./pages/not-found";

interface AuthStatus {
  authRequired: boolean;
  authenticated: boolean;
}

function AppContent() {
  // When the page is served statically (e.g. the shareable preview build),
  // there is no API — treat a failed status check as "auth not required" so
  // the mockup still works.
  const { data: auth, isLoading } = useQuery<AuthStatus>({
    queryKey: ["/api/auth/status"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/status");
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as AuthStatus;
      } catch {
        return { authRequired: false, authenticated: true };
      }
    },
    staleTime: 60_000,
  });

  if (isLoading) return null;
  if (auth?.authRequired && !auth.authenticated) return <LoginPage />;

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={ResearchPage} />
        <Route path="/opportunity/:id" component={OpportunityDetailPage} />
        <Route path="/live" component={LivePage} />
        <Route path="/journal" component={JournalPage} />
        <Route path="/report" component={ReportPage} />
        <Route path="/trends" component={TrendsPage} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/calculators" component={CalculatorsPage} />
        <Route path="/settings" component={AppSettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

function App() {
  // The dashboard uses a near-black dark theme by design (research tool,
  // information-dense, easy on the eyes). Light mode is a later phase.
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
