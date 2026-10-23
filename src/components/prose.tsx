export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 text-g700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1.5 [&_strong]:text-ink [&_a]:underline [&_code]:rounded [&_code]:bg-g100 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-[0.85em]">{children}</div>;
}
