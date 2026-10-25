import { ButtonLink, Logo } from "@/components/ui";
export const metadata = { title: "Access denied" };
export default function Forbidden() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="flex justify-center"><Logo /></div>
        <p className="mt-10 font-mono text-sm text-g500">403</p>
        <h1 className="mt-2 text-3xl font-semibold">You don't have access to this</h1>
        <p className="mt-3 text-g600">This area belongs to a different role or a college you're not assigned to. If you think this is a mistake. Contact your platform administrator.</p>
        <div className="mt-8 flex justify-center gap-3"><ButtonLink href="/" variant="outline">Home</ButtonLink><ButtonLink href="/admin/login">Sign in</ButtonLink></div>
      </div>
    </main>
  );
}
