import { Card } from "./ui";

/** Shown to college administrators wherever information is restricted to the platform owner. Never reveals any contact address. */
export function Restricted({ what = "This information" }: { what?: string }) {
  return (
    <Card>
      <h2 className="font-semibold">Restricted</h2>
      <p className="mt-1 text-sm text-g600">{what} is available to the platform administrator only. Contact the admin if you need it.</p>
    </Card>
  );
}
