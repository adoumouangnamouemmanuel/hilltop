import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Mail, ShieldCheck } from "lucide-react";
import { getPlatformConfig } from "@/lib/config-server";

export const metadata: Metadata = { title: "Help" };

/** Answers to the questions students ask most, and how to reach the team. */
export default async function HelpPage() {
  const { brand, pickupSpots } = await getPlatformConfig();
  const spots = pickupSpots.slice(0, 3).join(", ");
  const faqs: [string, React.ReactNode][] = [
    [
      "How does buying work?",
      <>
        Tap Buy now and reserve the item. You meet the seller on campus and pay them directly with Mobile Money or cash when you have it in
        your hands. Your order is under Purchases on your account page.
      </>,
    ],
    [
      "Where should we meet?",
      <>
        Somewhere public on campus, like {spots}. Check the item before you pay. If something feels off, don&rsquo;t go ahead: you can
        cancel the order.
      </>,
    ],
    [
      "How do I sell something?",
      <>
        Tap the + button, add a few photos, pick a category and set your price. Buyers can message you, make offers and reserve. Mark the
        order ready, then collected once you&rsquo;re paid.
      </>,
    ],
    [
      "Can I make an offer?",
      <>Yes, on most items. The seller can accept or decline. If they accept, the listing shows your price when you buy.</>,
    ],
    [
      "Something went wrong with an order",
      <>
        Message the other student first; most things are sorted that way. If not, email us with the order number (it&rsquo;s on the order)
        and we&rsquo;ll help.
      </>,
    ],
    ["A listing breaks the rules", <>Open it and tap Report this listing. The team reviews every report.</>],
    [
      "How do I delete my account?",
      <>
        Email us from your school address. We delete your account, listings, chats and saved items. See{" "}
        <Link href="/privacy" className="font-medium text-ink-950 underline underline-offset-4">
          Privacy
        </Link>{" "}
        for what we keep and why.
      </>,
    ],
  ];

  return (
    <div className="container-page max-w-2xl pt-8 pb-16">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ink-950">Help</h1>
      <p className="mt-2 text-ink-500">Quick answers, and a real person if you need one.</p>

      <a
        href={`mailto:${brand.supportEmail}`}
        className="mt-8 flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink-400"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-maroon-50 text-maroon-700">
          <Mail className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-ink-950">Email the {brand.name} team</span>
          <span className="block truncate text-sm text-ink-500">{brand.supportEmail} · We reply within a day</span>
        </span>
      </a>

      <div className="mt-10 divide-y divide-line rounded-2xl border border-line">
        {faqs.map(([question, answer]) => (
          <details key={question} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-ink-950">
              {question}
              <ChevronDown className="size-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-5 text-[15px] leading-7 text-ink-700">{answer}</p>
          </details>
        ))}
      </div>

      <p className="mt-8 flex items-center gap-2 text-sm text-ink-500">
        <ShieldCheck className="size-4 text-maroon-700" aria-hidden /> Only Ashesi students can join, checked with a school email.
      </p>
    </div>
  );
}
