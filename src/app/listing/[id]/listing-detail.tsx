"use client";

import { use, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Eye, Heart, MapPin, MessageCircle, Share, ShieldCheck } from "lucide-react";
import { getSeller, PROTECTION_FEE_RATE, type AttrValue, type Listing, type Seller } from "@/lib/data";
import type { CategoryDef } from "@/lib/catalog";
import { discountPercent, firstName, formatCedi, postedLabel, protectionFee } from "@/lib/format";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "@/components/category-icon";
import { ListingRail } from "@/components/rail";
import { Avatar, buttonClass, cn, Rating, Verified } from "@/components/ui";
import { CheckoutDialog } from "./checkout-dialog";
import { Gallery } from "./gallery";

export function ListingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { allListings, saved, toggleSaved, user, offers, makeOffer } = useStore();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [panel, setPanel] = useState<"offer" | "message" | null>(null);
  const [copied, setCopied] = useState(false);
  const catalog = useCatalog();

  const listing = allListings.find((l) => l.id === id);
  if (!listing) return <NotFound />;

  // Listings created on /sell belong to the signed-in user.
  const seller: Seller = getSeller(listing.sellerId) ?? {
    id: "me",
    name: user?.name ?? "You",
    classOf: 2027,
    major: "Ashesi student",
    rating: 5,
    reviews: 0,
    sales: 0,
    responseTime: "within an hour",
    joined: "2026",
  };
  const isOwn = seller.id === "me";
  const category = catalog.get(listing.category);
  const specs = specsFor(listing, category);
  const fee = protectionFee(listing.price);
  const off = discountPercent(listing.price, listing.originalPrice);
  const isSaved = saved.includes(listing.id);
  const fromSeller = allListings.filter((l) => l.sellerId === listing.sellerId && l.id !== listing.id);
  const similar = allListings.filter((l) => l.category === listing.category && l.id !== listing.id && l.sellerId !== listing.sellerId);

  const facts: [string, string][] = [
    ...(listing.condition ? [["Condition", listing.condition] as [string, string]] : []),
    ["Category", category.label],
    ...specs.map((s) => [s.label, s.value] as [string, string]),
    ...(listing.extra ?? []),
    ...(listing.stock !== undefined ? [["Available", `${listing.stock} left`] as [string, string]] : []),
    ["Pickup", `${listing.pickup}, Ashesi campus`],
    ["Listed", postedLabel(listing.postedDaysAgo)],
  ];
  const highlights = specs.filter((s) => s.highlight).slice(0, 4);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="container-page pt-4 sm:pt-6">
      <nav className="hidden text-xs text-ink-500 sm:block" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink-950">
          Home
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <Link href={`/browse?category=${category.id}`} className="hover:text-ink-950">
          {category.label}
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <span className="text-ink-950">{listing.title}</span>
      </nav>

      <div className="grid gap-8 sm:mt-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        {/* Left column */}
        <div className="min-w-0">
          <Gallery images={listing.images} title={listing.title} />

          <div className="hidden lg:block">
            <About description={listing.description} facts={facts} pickup={listing.pickup} />
          </div>
        </div>

        {/* Right column */}
        <div className="lg:sticky lg:top-[132px] lg:self-start">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[22px] leading-snug font-semibold tracking-[-0.02em] text-ink-950 sm:text-2xl">{listing.title}</h1>
            <div className="flex shrink-0 gap-1">
              <IconButton label={copied ? "Link copied" : "Share"} onClick={share}>
                {copied ? <Check className="size-[18px]" /> : <Share className="size-[18px]" />}
              </IconButton>
              <IconButton
                label={isSaved ? "Remove from saved" : "Save"}
                onClick={() => {
                  toggleSaved(listing.id);
                  if (!isSaved) toast("Saved to your list", { tone: "saved", action: { label: "View", href: "/saved" } });
                }}
                pressed={isSaved}
              >
                <Heart className={cn("size-[18px]", isSaved && "fill-maroon-700 text-maroon-700")} />
              </IconButton>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="text-[28px] font-semibold tracking-[-0.02em] text-ink-950 tabular">{formatCedi(listing.price)}</span>
            {off > 0 && (
              <>
                <span className="text-sm text-ink-400 tabular line-through">{formatCedi(listing.originalPrice!)}</span>
                <span className="text-sm font-medium text-maroon-700">{off}% below retail</span>
              </>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
            <Link
              href={`/browse?category=${category.id}`}
              className="inline-flex items-center gap-1 font-medium text-ink-950 hover:underline"
            >
              <CategoryIcon name={category.icon} className="size-3.5" /> {category.label}
            </Link>
            <span aria-hidden>·</span>
            {listing.condition && (
              <>
                <span className="font-medium text-ink-950">{listing.condition}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>Listed {postedLabel(listing.postedDaysAgo).toLowerCase()}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden /> {listing.views} views
            </span>
            <span aria-hidden>·</span>
            <span>{listing.saves + (isSaved ? 1 : 0)} saved</span>
          </p>

          {highlights.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-2">
              {highlights.map((h, i) => (
                <motion.div
                  key={h.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="rounded-xl bg-surface px-3.5 py-2.5"
                >
                  <dt className="text-[11px] text-ink-500">{h.label}</dt>
                  <dd className="truncate text-sm font-medium text-ink-950">{h.value}</dd>
                </motion.div>
              ))}
            </dl>
          )}

          {/* Buy box */}
          <div id="buy-box" className="mt-6 scroll-mt-40 rounded-2xl border border-line p-5">
            {isOwn ? (
              <p className="text-sm text-ink-500">This is your listing. Buyers will see Buy now and Make an offer here.</p>
            ) : (
              <>
                <button type="button" onClick={() => setCheckoutOpen(true)} className={buttonClass("primary", "lg", "w-full")}>
                  Buy now
                </button>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPanel(panel === "offer" ? null : "offer")}
                    className={buttonClass("outline", "lg", cn(panel === "offer" && "border-ink-950"))}
                    aria-expanded={panel === "offer"}
                  >
                    Make offer
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel(panel === "message" ? null : "message")}
                    className={buttonClass("outline", "lg", cn(panel === "message" && "border-ink-950"))}
                    aria-expanded={panel === "message"}
                  >
                    <MessageCircle className="size-4" aria-hidden /> Message
                  </button>
                </div>

                <AnimatePresence initial={false} mode="wait">
                  {panel && (
                    <motion.div
                      key={panel}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      {panel === "offer" ? (
                        <OfferPanel
                          price={listing.price}
                          sent={offers[listing.id]}
                          sellerName={seller.name}
                          onSend={(v) => {
                            makeOffer(listing.id, v);
                            toast(`Offer of ${formatCedi(v)} sent`, { tone: "success" });
                          }}
                        />
                      ) : (
                        <MessagePanel sellerName={seller.name} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <FeeBreakdown price={listing.price} fee={fee} />
              </>
            )}

            <div className="mt-4 flex gap-3 border-t border-line pt-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-maroon-700" aria-hidden />
              <p className="text-[13px] leading-5 text-ink-500">
                <span className="font-medium text-ink-950">Hilltop Buyer Protection.</span> Your payment is held until you confirm
                collection. Full refund if it isn&rsquo;t as described.
              </p>
            </div>
          </div>

          {/* Seller */}
          <div className="mt-4 rounded-2xl border border-line p-5">
            <div className="flex items-center gap-3.5">
              <Avatar name={seller.name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-semibold text-ink-950">
                  {seller.name}
                  <Verified />
                </p>
                <p className="truncate text-[13px] text-ink-500">
                  {seller.major} · Class of {seller.classOf}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface py-3 text-center">
              <div>
                <dt className="sr-only">Rating</dt>
                <dd className="text-sm">
                  <Rating value={seller.rating} />
                </dd>
                <dd className="mt-0.5 text-[11px] text-ink-500">{seller.reviews} reviews</dd>
              </div>
              <div>
                <dt className="sr-only">Sold</dt>
                <dd className="text-sm font-medium text-ink-950 tabular">{seller.sales}</dd>
                <dd className="mt-0.5 text-[11px] text-ink-500">items sold</dd>
              </div>
              <div>
                <dt className="sr-only">Response time</dt>
                <dd className="text-sm font-medium text-ink-950">{seller.responseTime.replace("within ", "")}</dd>
                <dd className="mt-0.5 text-[11px] text-ink-500">to reply</dd>
              </div>
            </dl>
            {!isOwn && (
              <Link href={`/seller/${seller.id}`} className={buttonClass("ghost", "md", "mt-3 w-full")}>
                View {firstName(seller.name)}&rsquo;s profile
              </Link>
            )}
          </div>
        </div>

        <div className="lg:hidden">
          <About description={listing.description} facts={facts} pickup={listing.pickup} />
        </div>
      </div>

      <div className="mt-16 space-y-16">
        <ListingRail
          title={`More from ${firstName(seller.name)}`}
          href={isOwn ? undefined : `/seller/${seller.id}`}
          listings={fromSeller}
        />
        <ListingRail title="Similar items" href={`/browse?category=${category.id}`} listings={similar} />
      </div>

      {/* Mobile buy bar */}
      {!isOwn && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-elevated px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-tight font-semibold text-ink-950 tabular">{formatCedi(listing.price)}</p>
            <p className="text-[11px] text-ink-500">+ {formatCedi(fee)} buyer protection</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPanel("offer");
              document.getElementById("buy-box")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={buttonClass("outline", "md")}
          >
            Offer
          </button>
          <button type="button" onClick={() => setCheckoutOpen(true)} className={buttonClass("primary", "md")}>
            Buy now
          </button>
        </div>
      )}

      <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} listing={listing} fee={fee} />
    </div>
  );
}

function About({ description, facts, pickup }: { description: string; facts: [string, string][]; pickup: string }) {
  return (
    <div className="space-y-10 lg:mt-12">
      <section>
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">About this item</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-700">{description}</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">Details</h2>
        <dl className="mt-3 max-w-2xl divide-y divide-line border-y border-line">
          {facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-3 text-sm">
              <dt className="text-ink-500">{k}</dt>
              <dd className="text-ink-950">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="max-w-2xl rounded-2xl bg-surface p-5">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-ink-950" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-ink-950">Meet at {pickup}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">
              Check the item in person before you confirm. Only confirm collection once you&rsquo;re happy, and never pay outside Hilltop.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeeBreakdown({ price, fee }: { price: number; fee: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[13px] text-ink-500"
        aria-expanded={open}
      >
        <span>
          <span className="font-medium text-ink-950 tabular">{formatCedi(price + fee)}</span> total with buyer protection
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.dl
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden text-[13px]"
          >
            <div className="mt-3 flex justify-between text-ink-500">
              <dt>Item</dt>
              <dd className="text-ink-950 tabular">{formatCedi(price)}</dd>
            </div>
            <div className="mt-1.5 flex justify-between text-ink-500">
              <dt>Buyer protection ({Math.round(PROTECTION_FEE_RATE * 100)}%)</dt>
              <dd className="text-ink-950 tabular">{formatCedi(fee)}</dd>
            </div>
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  );
}

function OfferPanel({
  price,
  sent,
  sellerName,
  onSend,
}: {
  price: number;
  sent?: number;
  sellerName: string;
  onSend: (v: number) => void;
}) {
  const suggestions = [0.95, 0.9, 0.85].map((r) => Math.round((price * r) / 5) * 5);
  const [value, setValue] = useState(String(suggestions[1]));
  const amount = Number(value) || 0;
  const tooLow = amount > 0 && amount < price * 0.5;

  if (sent) {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-success-bg px-4 py-3 text-[13px] text-success">
        <Check className="size-4 shrink-0" aria-hidden />
        Offer of {formatCedi(sent)} sent to {firstName(sellerName)}. You&rsquo;ll be notified when they reply.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-surface p-4">
      <div className="flex gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(String(s))}
            className={cn(
              "flex-1 rounded-lg border py-1.5 text-xs tabular transition-colors",
              Number(value) === s
                ? "border-ink-950 bg-elevated font-medium text-ink-950"
                : "border-transparent bg-elevated text-ink-700 hover:border-line-strong",
            )}
          >
            {formatCedi(s)}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-500">GH₵</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            aria-label="Your offer in cedis"
            className="h-11 w-full rounded-xl border border-line-strong bg-elevated pr-3 pl-12 text-sm tabular outline-none focus:border-ink-950"
          />
        </label>
        <button
          type="button"
          disabled={!amount || tooLow || amount >= price}
          onClick={() => onSend(amount)}
          className={buttonClass("dark", "md")}
        >
          Send
        </button>
      </div>
      <p className={cn("mt-2 text-xs", tooLow ? "text-maroon-700" : "text-ink-500")}>
        {tooLow
          ? "Offers below half the asking price are hidden from sellers."
          : "If accepted, you'll pay through Hilltop with buyer protection."}
      </p>
    </div>
  );
}

function MessagePanel({ sellerName }: { sellerName: string }) {
  const quick = ["Is this still available?", "Can we meet today?", "Is the price negotiable?"];
  const [text, setText] = useState(`Hi ${firstName(sellerName)}, is this still available?`);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-success-bg px-4 py-3 text-[13px] text-success">
        <Check className="size-4 shrink-0" aria-hidden />
        Message sent. {firstName(sellerName)} usually replies quickly.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-surface p-4">
      <div className="-mx-1 no-scrollbar flex gap-1.5 overflow-x-auto px-1">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setText(q)}
            className="shrink-0 rounded-lg bg-elevated px-2.5 py-1.5 text-xs text-ink-700 hover:text-ink-950"
          >
            {q}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label={`Message to ${sellerName}`}
        className="mt-2.5 w-full resize-none rounded-xl border border-line-strong bg-elevated p-3 text-sm outline-none focus:border-ink-950"
      />
      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => {
          setSent(true);
          toast("Message sent", { tone: "success" });
        }}
        className={buttonClass("dark", "md", "mt-2 w-full")}
      >
        Send message
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="grid size-10 place-items-center rounded-full border border-line text-ink-900 transition-colors hover:border-ink-900"
    >
      {children}
    </button>
  );
}

function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">This item is no longer available</h1>
      <p className="mt-2 text-ink-500">It may have sold or been removed by the seller.</p>
      <Link href="/browse" className={buttonClass("dark", "md", "mt-6")}>
        Keep browsing
      </Link>
    </div>
  );
}

type Spec = { label: string; value: string; highlight: boolean };

const display = (v: AttrValue, unit?: string) => (typeof v === "boolean" ? (v ? "Yes" : "No") : `${v}${unit ?? ""}`);

/** Turns a listing's attribute values into labelled specs using its category schema. */
function specsFor(listing: Listing, category: CategoryDef): Spec[] {
  const values = listing.attributes ?? {};
  const known = category.attributes
    .filter((a) => values[a.key] !== undefined && values[a.key] !== "" && values[a.key] !== "Other")
    .map((a) => ({ label: a.label, value: display(values[a.key], a.unit), highlight: a.type !== "boolean" || values[a.key] === true }));
  // Values for keys the schema doesn't know (e.g. after a category changes) still show up.
  const unknown = Object.entries(values)
    .filter(([k]) => !category.attributes.some((a) => a.key === k))
    .map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: display(v), highlight: false }));
  return [...known, ...unknown];
}
