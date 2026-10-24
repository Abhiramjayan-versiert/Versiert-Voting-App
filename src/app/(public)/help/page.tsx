import { SiteHeader, SiteFooter } from "@/components/site";
import { Prose } from "@/components/prose";

export const metadata = { title: "Student help" };
const faq: [string, React.ReactNode][] = [
  ["Do I need an account?", "No. Open the election link and enter the email your college registered for you, plus your student ID."],
  ["It says my details couldn't be verified.", "Check that you used the exact email your college registered and your student ID as it appears on college records (spaces and capitals don't matter). For privacy we can't say which part didn't match — contact your election administrator. After several wrong tries the email is locked for an hour."],
  ["Can someone vote for me?", "Only someone who knows both your registered email and your student ID. Keep your student ID private during the election, and tell your election administrator immediately if you think someone voted as you — they can record an incident."],
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
