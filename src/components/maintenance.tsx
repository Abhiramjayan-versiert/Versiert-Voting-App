import { getConfig } from "@/lib/config";
import { Logo } from "./ui";

export async function maintenanceScreen() {
  const cfg = await getConfig();
  if (!cfg.maintenance_mode) return null;
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-ink px-6 text-paper">
      <div className="max-w-md text-center">
        <div className="flex justify-center"><Logo dark /></div>
        <h1 className="mt-10 text-3xl font-semibold">Back shortly</h1>
        <p className="mt-3 text-g300">{cfg.maintenance_message}</p>
      </div>
    </main>
  );
}
