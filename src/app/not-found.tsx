import { ButtonLink, Logo } from "@/components/ui";
export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="flex justify-center"><Logo /></div>
        <p className="mt-10 font-mono text-sm text-g500">404</p>
        <h1 className="mt-2 text-3xl font-semibold">We couldn't find that</h1>
        <p className="mt-3 text-g600">The link may be mistyped, the election may not be open to the public, or its data may have been deleted under its retention policy.</p>
        <div className="mt-8 flex justify-center gap-3"><ButtonLink href="/vote" variant="primary">Find your election</ButtonLink><ButtonLink href="/" variant="outline">Home</ButtonLink></div>
      </div>
    </main>
  );
}
