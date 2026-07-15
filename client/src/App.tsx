import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import ResearchPage from "./pages/research";
import OpportunityDetailPage from "./pages/opportunity-detail";
import LivePage from "./pages/live";
import CalculatorsPage from "./pages/calculators";
import AppSettingsPage from "./pages/app-settings";
import NotFound from "./pages/not-found";

function App() {
  // The dashboard uses a near-black dark theme by design (research tool,
  // information-dense, easy on the eyes). Light mode is a later phase.
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={ResearchPage} />
          <Route path="/opportunity/:id" component={OpportunityDetailPage} />
          <Route path="/live" component={LivePage} />
          <Route path="/calculators" component={CalculatorsPage} />
          <Route path="/settings" component={AppSettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
