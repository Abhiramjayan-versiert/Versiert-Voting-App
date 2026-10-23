import { SiteHeader, SiteFooter } from "@/components/site";
import { Prose } from "@/components/prose";

export const metadata = { title: "Student help" };
const faq: [string, React.ReactNode][] = [
  ["Do I need an account?", "No. Open the election link, enter your official college email, and type the 6-digit code we send you."],
  ["I didn't get a code.", <>Codes arrive within a minute. Check spam or “Promotions”. Make sure you typed the address your college registered. If it still doesn't arrive, contact your election administrator — for privacy we can't tell you whether an address is on the list.</>],
  ["Can someone vote for me if they know my email?", "No. Voting requires the one-time code sent to your inbox. Never share that code — election staff will never ask for it."],
  ["How many times can I vote?", "Once per position. If an election has four positions, you can vote once for each. You can do them in one go, or vote for some now and the rest later while voting is open."],
  ["Can I change my vote?", "You can change your selections as often as you like before you press Submit. After submission, choices for those positions are final."],
  ["What if I press Submit twice or my connection drops?", "It's safe to retry. Each ballot carries a unique key and the database accepts at most one vote per position for you, so a vote can never be counted twice."],
  ["Who can see how I voted?", <>In a secret-ballot election (the default), nobody — your choices are stored with no link to you. Administrators see only whether you participated. See <a href="/privacy">voting privacy</a>.</>],
  ["What is the confirmation code?", <>Proof that your ballot was recorded. It reveals nothing about your choices. You can check it at <a href="/receipt">/receipt</a>.</>],
  ["When will results be published?", "After voting closes and your election administrators review the integrity checks. The public results page shows totals only."],
  ["Can I install V.app?", "Yes. On iPhone/iPad: Share → Add to Home Screen. On Android: menu → Install app. On desktop Chrome or Edge: the install icon in the address bar. It's the same secure web app — not a separate native app."],
];
export default function Help() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-14">
        <p className="eyebrow text-g500">Help</p>
        <h1 className="mt-3 text-[2.4rem] font-semibold leading-tight">Voting on V.app</h1>
        <dl className="mt-10 divide-y divide-g200 border-y border-g200">
          {faq.map(([q, a]) => (
            <div key={q} className="py-5"><dt className="font-semibold">{q}</dt><dd className="mt-2 text-g600">{a}</dd></div>
          ))}
        </dl>
        <Prose><h2>Still stuck?</h2><p>Contact your college's election administrator — they manage the voter list and can confirm your eligibility. For technical problems with V.app itself, ask them to contact the platform administrator.</p></Prose>
      </main>
      <SiteFooter />
    </>
  );
}
