import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DISCLAIMER } from "@shared/types";

/** Password gate shown when the server has DASHBOARD_PASSWORD set. */
export default function LoginPage() {
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/login", { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/status"] });
    },
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border border-card-border bg-card px-5 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
            <Lock className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-foreground">Edge Research</h1>
            <p className="text-[12px] text-muted-foreground">Private research dashboard</p>
          </div>
        </div>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) login.mutate();
          }}
        >
          <Input
            type="password"
            autoFocus
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 text-[15px]"
            data-testid="input-password"
          />
          {login.isError ? (
            <p className="text-[13px] text-red-400">
              Incorrect password. Check the DASHBOARD_PASSWORD value and try again.
            </p>
          ) : null}
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={login.isPending || !password}
            data-testid="button-login"
          >
            {login.isPending ? "Checking…" : "Unlock"}
          </Button>
        </form>
      </div>
      <p className="mt-4 max-w-sm text-center text-[11px] leading-4 text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
