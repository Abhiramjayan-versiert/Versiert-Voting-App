"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") { router.refresh(); setAt(new Date()); } }, seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <div className="no-print flex items-center gap-3 text-xs text-g500">
      <span className="flex items-center gap-1.5">{on && <span className="size-1.5 animate-pulse rounded-full bg-lime ring-2 ring-ink/10" aria-hidden />}{on ? `Live · refreshed ${at.toLocaleTimeString()}` : "Auto-refresh paused"}</span>
      <button type="button" onClick={() => setOn((o) => !o)} className="underline">{on ? "Pause" : "Resume"}</button>
    </div>
  );
}
