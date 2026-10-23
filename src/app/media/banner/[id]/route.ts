import { serveImage } from "@/lib/media";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return serveImage("banner", (await params).id);
}
