import { Logo } from "@/components/ui";
export const metadata = { title: "You're offline" };
export const dynamic = "force-static";
export default function Offline() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-ink px-6 text-paper">
      <div className="max-w-sm text-center">
        <div className="flex justify-center"><Logo dark /></div>
        <h1 className="mt-10 text-3xl font-semibold">You're offline</h1>
        <p className="mt-3 text-g300">V.app needs a connection to verify voters and record ballots securely. Nothing is stored on this device. Reconnect and try again, if you pressed Submit. Retrying is safe.</p>
        <a href="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-lime px-6 font-medium text-ink">Try again</a>
      </div>
    </main>
  );
}
