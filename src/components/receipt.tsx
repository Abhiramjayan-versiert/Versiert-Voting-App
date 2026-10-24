"use client";
import { useEffect, useState } from "react";
import { CopyButton } from "./forms";

export function Receipt({ slug }: { slug: string }) {
  const [r, setR] = useState<{ receipt: string | null; accepted: number; alreadyVoted: number; checkCode?: string | null } | null>(null);
  useEffect(() => { try { const v = sessionStorage.getItem(`vapp-receipt-${slug}`); if (v) setR(JSON.parse(v)); } catch { /* ignore */ } }, [slug]);
  if (!r) return null;
  return (
    <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-g200 p-5 text-left">
      {r.receipt ? <>
        <p className="text-xs text-g500">Confirmation code</p>
        <p className="mt-1 font-mono text-xl tracking-wider">{r.receipt}</p>
        <p className="mt-2 text-xs text-g500">Proves your ballot was recorded — it does not reveal your choices. Check it any time at <a href="/receipt" className="underline">/receipt</a>.</p>
        <CopyButton text={r.receipt} label="Copy code" className="mt-3" />
        {r.checkCode && <div className="mt-5 border-t border-g200 pt-5">
          <p className="text-xs text-g500">Vote verification code</p>
          <p className="mt-1 font-mono text-xl tracking-wider">{r.checkCode}</p>
          <p className="mt-2 text-xs text-g500">Save this now — it is shown only once and V.app does not know it belongs to you. Enter it at <a href="/receipt" className="underline">/receipt</a> to see exactly how your ballot was recorded. Keep it private: anyone with this code can see your choices.</p>
          <CopyButton text={r.checkCode} label="Copy verification code" className="mt-3" />
        </div>}
      </> : <p className="text-sm">No new positions were recorded.</p>}
      {r.alreadyVoted > 0 && <p className="mt-3 rounded-lg bg-g50 px-3 py-2 text-sm text-g600">{r.alreadyVoted} position{r.alreadyVoted === 1 ? " was" : "s were"} already voted on earlier, so {r.alreadyVoted === 1 ? "that selection was" : "those selections were"} not counted again. Your first ballot stands.</p>}
    </div>
  );
}
