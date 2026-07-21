import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryClient } from "@/lib/queryClient";

interface TrendSignal {
  kind: "recent" | "vs_opponent" | "home_away" | "alt_line" | "other";
  label: string;
  hits: number;
  total: number;
}

interface DraftTrend {
  playerName: string;
  team?: string | null;
  market: string;
  side: "over" | "under";
  line?: number | null;
  oddsAmerican?: number | null;
  signals: TrendSignal[];
  note?: string | null;
  source: "upload" | "manual";
}

interface SavedTrend extends DraftTrend {
  id: number;
  gameDate: string;
}

interface PendingImage {
  name: string;
  mediaType: string;
  data: string; // base64, no data: prefix
}

function signalSummary(signals: TrendSignal[]): string {
  if (signals.length === 0) return "No counted signals";
  return signals.map((s) => `${s.hits}/${s.total} ${shortKind(s.kind)}`).join(" · ");
}

function shortKind(kind: TrendSignal["kind"]): string {
  switch (kind) {
    case "recent":
      return "recent";
    case "vs_opponent":
      return "vs opp";
    case "home_away":
      return "home/away";
    case "alt_line":
      return "alt line";
    default:
      return "";
  }
}

async function fileToImage(file: File): Promise<PendingImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error(`Could not read ${file.name}`);
  return { name: file.name, mediaType: match[1], data: match[2] };
}

/**
 * Trend research page: upload screenshots of trend cards (Linemate etc.),
 * have them parsed into structured signals, review, and save. Saved trends
 * are matched by player + market into today's research feed, where they
 * grade the "Recent form" and "Matchup" categories.
 */
export default function TrendsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [drafts, setDrafts] = useState<DraftTrend[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [manual, setManual] = useState({ playerName: "", market: "Hits", side: "over" as "over" | "under", line: "0.5", hits: "", total: "" });

  const saved = useQuery<{ date: string; trends: SavedTrend[] }>({
    queryKey: ["/api/trends"],
    queryFn: async () => {
      const res = await fetch("/api/trends");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load trends");
      return res.json();
    },
  });

  const parse = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await fetch("/api/trends/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: images.map(({ mediaType, data }) => ({ mediaType, data })) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Parsing failed");
      return body.trends as DraftTrend[];
    },
    onSuccess: (trends) => {
      setDrafts((prev) => [...prev, ...trends.map((t) => ({ ...t, source: "upload" as const }))]);
      setImages([]);
      if (trends.length === 0) setError("No trends were found in those screenshots.");
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trends: drafts }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Saving failed");
      return body.saved as SavedTrend[];
    },
    onSuccess: (rows) => {
      setDrafts([]);
      setSavedMessage(`${rows.length} trend${rows.length === 1 ? "" : "s"} saved for today. They now feed the Research grades.`);
      queryClient.invalidateQueries({ queryKey: ["/api/trends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/trends/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
  });

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    try {
      const next = await Promise.all(Array.from(list).slice(0, 8).map(fileToImage));
      setImages((prev) => [...prev, ...next].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addManual = () => {
    const hits = Number(manual.hits);
    const total = Number(manual.total);
    if (!manual.playerName.trim() || !manual.market.trim() || !Number.isInteger(hits) || !Number.isInteger(total) || total <= 0) {
      setError("Manual entry needs a player, market, and a whole-number 'hit X of last Y'.");
      return;
    }
    setError(null);
    setDrafts((prev) => [
      ...prev,
      {
        playerName: manual.playerName.trim(),
        market: manual.market.trim(),
        side: manual.side,
        line: manual.line === "" ? null : Number(manual.line),
        signals: [{ kind: "recent", label: `Hit in ${hits} of last ${total} games`, hits, total }],
        source: "manual",
      },
    ]);
    setManual((m) => ({ ...m, playerName: "", hits: "", total: "" }));
  };

  return (
    <AppShell>
      <div className="space-y-4 px-4 pb-24 pt-3">
        <div>
          <h1 className="text-[20px] font-bold text-foreground">Today's trends</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Upload screenshots of trend cards (Linemate, etc.) before you refresh market data.
            Saved trends are matched to today's players and fill the "Recent form" and "Matchup"
            grades on the Research feed. Trends inform the grade — they never place anything.
          </p>
        </div>

        {/* Step 1: screenshots */}
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h2 className="text-[14px] font-bold text-foreground">1 · Add screenshots</h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="h-10" onClick={() => fileRef.current?.click()} data-testid="button-add-screenshots">
              <Camera className="mr-1.5 h-4 w-4" /> Choose screenshots
            </Button>
            <Button
              className="h-10"
              onClick={() => parse.mutate()}
              disabled={images.length === 0 || parse.isPending}
              data-testid="button-parse-trends"
            >
              {parse.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {parse.isPending ? "Reading…" : `Extract trends${images.length > 0 ? ` (${images.length})` : ""}`}
            </Button>
          </div>
          {images.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {images.map((img, i) => (
                <li key={`${img.name}-${i}`} className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[12px] text-muted-foreground">
                  {img.name}
                  <button onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${img.name}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Up to 8 images per pass. Reading uses the Claude API (needs ANTHROPIC_API_KEY in
            Railway). Manual entry below always works.
          </p>
        </section>

        {/* Step 2: review extracted/manual drafts */}
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h2 className="text-[14px] font-bold text-foreground">2 · Review &amp; save</h2>
          {drafts.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">Nothing to review yet — extract screenshots or add a trend manually below.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {drafts.map((t, i) => (
                <li key={i} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-semibold text-foreground">
                      {t.playerName}
                      {t.team ? <span className="ml-1 text-[12px] font-normal text-muted-foreground">{t.team}</span> : null}
                    </span>
                    <button
                      onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted-foreground hover:text-red-400"
                      aria-label={`Remove ${t.playerName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {t.side === "under" ? "Under" : "Over"}
                    {t.line != null ? ` ${t.line}` : ""} {t.market}
                    {t.oddsAmerican != null ? ` · ${t.oddsAmerican > 0 ? "+" : ""}${t.oddsAmerican}` : ""}
                  </div>
                  <div className="mt-0.5 text-[12px] text-emerald-400">{signalSummary(t.signals)}</div>
                  {t.note ? <div className="mt-0.5 text-[11px] text-muted-foreground">{t.note}</div> : null}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button className="h-10" onClick={() => save.mutate()} disabled={drafts.length === 0 || save.isPending} data-testid="button-save-trends">
              {save.isPending ? "Saving…" : `Save ${drafts.length || ""} trend${drafts.length === 1 ? "" : "s"}`}
            </Button>
            {drafts.length > 0 ? (
              <button className="text-[12px] text-muted-foreground" onClick={() => setDrafts([])}>
                Clear
              </button>
            ) : null}
          </div>
          {savedMessage ? <p className="mt-2 text-[12px] text-emerald-400">{savedMessage}</p> : null}
          {error ? <p className="mt-2 text-[12px] text-red-400">{error}</p> : null}
        </section>

        {/* Manual entry */}
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h2 className="text-[14px] font-bold text-foreground">Add one manually</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input placeholder="Player name" value={manual.playerName} onChange={(e) => setManual({ ...manual, playerName: e.target.value })} className="col-span-2 h-10" />
            <Input placeholder="Market (e.g. Hits)" value={manual.market} onChange={(e) => setManual({ ...manual, market: e.target.value })} className="h-10" />
            <div className="flex gap-2">
              <button
                onClick={() => setManual({ ...manual, side: manual.side === "over" ? "under" : "over" })}
                className="h-10 flex-1 rounded-md border border-border bg-secondary/50 text-[13px] font-medium text-foreground"
              >
                {manual.side === "over" ? "Over" : "Under"}
              </button>
              <Input placeholder="Line" inputMode="decimal" value={manual.line} onChange={(e) => setManual({ ...manual, line: e.target.value })} className="h-10 w-20" />
            </div>
            <Input placeholder="Hit X…" inputMode="numeric" value={manual.hits} onChange={(e) => setManual({ ...manual, hits: e.target.value })} className="h-10" />
            <Input placeholder="…of last Y games" inputMode="numeric" value={manual.total} onChange={(e) => setManual({ ...manual, total: e.target.value })} className="h-10" />
          </div>
          <Button variant="secondary" className="mt-2 h-10" onClick={addManual}>
            <Plus className="mr-1.5 h-4 w-4" /> Add to review list
          </Button>
        </section>

        {/* Saved for today */}
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h2 className="text-[14px] font-bold text-foreground">
            Saved for {saved.data?.date ?? "today"} {saved.data ? `· ${saved.data.trends.length}` : ""}
          </h2>
          {saved.isError ? (
            <p className="mt-2 text-[12px] text-red-400">{saved.error instanceof Error ? saved.error.message : "Failed to load"}</p>
          ) : !saved.data || saved.data.trends.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">Nothing saved yet for today.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {saved.data.trends.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-foreground">{t.playerName}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {t.side === "under" ? "Under" : "Over"}
                      {t.line != null ? ` ${t.line}` : ""} {t.market} · {signalSummary(t.signals as TrendSignal[])}
                    </div>
                  </div>
                  <button
                    onClick={() => remove.mutate(t.id)}
                    className="shrink-0 text-muted-foreground hover:text-red-400"
                    aria-label={`Delete trend for ${t.playerName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Trends apply to today's feed only. Small samples show direction, not proof — the
            market grade still leads.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
