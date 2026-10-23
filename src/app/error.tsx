"use client";
import { useEffect } from "react";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ui]", error.digest); }, [error]);
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-g600">The problem has been noted. No ballot or setting was changed by this error.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
        <button onClick={reset} className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 text-paper">Try again</button>
      </div>
    </main>
  );
}
