import type { Metadata } from "next";
import { getPlatformConfig } from "@/lib/config-server";

export const metadata: Metadata = { title: "Privacy" };

/** What Hilltop keeps about students, in plain words. */
export default async function PrivacyPage() {
  const { brand } = await getPlatformConfig();
  const sections: [string, React.ReactNode][] = [
    [
      "What we keep",
      <>
        Your school email, to check you&rsquo;re a student and send you sign-in codes. Your name, and your class year and major if you add
        them. What you list, with its photos; your messages, offers, orders and reviews; items and searches you save; and listings you
        report.
      </>,
    ],
    [
      "Who sees what",
      <>
        Everyone sees your name and what you list, sell and are reviewed for. Your messages and offers are only seen by you and the other
        student. Your orders are seen by you, the other student and the Hilltop team. Your email is only seen by the Hilltop team, never by
        other students.
      </>,
    ],
    [
      "Where it’s stored",
      <>
        Accounts and data are stored with Supabase, photos with Cloudflare, and sign-in emails are sent through Resend. Errors in the app
        are reported to Sentry so we can fix them. We don&rsquo;t sell your data or show ads.
      </>,
    ],
    [
      "Payments",
      <>
        For now you pay the seller directly when you meet, so Hilltop never sees your Mobile Money or card details. If paying in the app is
        added, the payment provider handles those details.
      </>,
    ],
    [
      "Your choices",
      <>
        You can edit or delete your listings at any time. To delete your account, or to ask what we keep about you, email{" "}
        <a href={`mailto:${brand.supportEmail}`} className="font-medium text-ink-950 underline underline-offset-4">
          {brand.supportEmail}
        </a>
        .
      </>,
    ],
  ];

  return (
    <div className="container-page max-w-2xl pt-8 pb-16">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ink-950">Privacy</h1>
      <p className="mt-3 text-ink-500">
        {brand.name} is a student project for Ashesi, not an official university service. This is what it keeps about you and why.
      </p>
      <div className="mt-10 space-y-8">
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
            <p className="mt-2 leading-7 text-ink-700">{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
