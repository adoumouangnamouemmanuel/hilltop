"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CalendarDays, CreditCard, Info, Megaphone, Package, Scale, Settings2, ToggleRight, Trash2 } from "lucide-react";
import { deepEqual, platformConfigSchema, type PlatformConfig } from "@hilltop/shared/config";
import { Switch } from "@hilltop/ui/controls";
import { buttonClass, cn } from "@hilltop/ui/ui";
import { AddButton, Card, CardHeader, Field, Gate, NumberInput, PageHeader, Select, TagList, TextArea, TextInput } from "@/components/kit";
import { editDraft } from "@/lib/model";
import { perform, useCan, usePublished, useWorkingConfig } from "@/lib/store";
import { useQueryState } from "@/lib/use-query";

type Key = keyof PlatformConfig;
type Set = (patch: Partial<PlatformConfig>) => void;
type Errors = (path: string) => string | undefined;
type SectionProps = { value: PlatformConfig; set: Set; err: Errors };

const sections = [
  {
    id: "general",
    label: "General",
    icon: Settings2,
    keys: ["brand", "access"],
    description: "Name, support contact and who can sign up.",
  },
  {
    id: "payments",
    label: "Fees & payments",
    icon: CreditCard,
    keys: ["fees", "payments", "boostPlans"],
    description: "What buyers and sellers pay, and how.",
  },
  {
    id: "listings",
    label: "Listings",
    icon: Package,
    keys: ["listings", "conditions", "pickupSpots", "search"],
    description: "Limits, conditions, pickup spots and search.",
  },
  {
    id: "rules",
    label: "Offers & disputes",
    icon: Scale,
    keys: ["offers", "disputes"],
    description: "Negotiation rules and how problems are handled.",
  },
  { id: "features", label: "Features", icon: ToggleRight, keys: ["features"], description: "Turn parts of the marketplace on or off." },
  { id: "events", label: "Events", icon: CalendarDays, keys: ["events"], description: "Seasonal sales shown across the marketplace." },
  { id: "announcement", label: "Announcement", icon: Megaphone, keys: ["announcement"], description: "A banner at the top of every page." },
] as const satisfies { id: string; label: string; icon: React.ElementType; keys: Key[]; description: string }[];

type SectionId = (typeof sections)[number]["id"];

const forms: Record<SectionId, (p: SectionProps) => React.ReactNode> = {
  general: General,
  payments: Payments,
  listings: Listings,
  rules: Rules,
  features: Features,
  events: Events,
  announcement: Announcement,
};

export function SettingsView() {
  return (
    <Gate permission="settings.view">
      <SettingsInner />
    </Gate>
  );
}

function SettingsInner() {
  const [tab, setTab] = useQueryState<SectionId>("section", "general");
  const section = sections.find((s) => s.id === tab) ?? sections[0];
  const canEdit = useCan("settings.edit");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Everything the marketplace runs on. Changes are saved as a draft and go live when someone publishes them."
      />
      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-[13px] text-ink-700">
          <Info className="size-4 shrink-0" aria-hidden />
          You can view settings. Editing needs the settings.edit permission.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="-mx-4 no-scrollbar flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:px-0"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTab(s.id)}
              aria-current={tab === s.id ? "page" : undefined}
              className={cn(
                "relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                tab === s.id ? "text-ink-950" : "text-ink-500 hover:text-ink-900",
              )}
            >
              {tab === s.id && (
                <motion.span
                  layoutId="settings-tab"
                  className="absolute inset-0 rounded-xl bg-surface"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <s.icon className="relative size-4" aria-hidden />
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </nav>
        <AnimatePresence mode="wait">
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <SectionForm section={section} canEdit={canEdit} />
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

/** Holds a local copy of the config while editing; only this section's keys are saved. */
function SectionForm({ section, canEdit }: { section: (typeof sections)[number]; canEdit: boolean }) {
  const working = useWorkingConfig();
  const { config: published } = usePublished();
  const [local, setLocal] = useState(working);
  const keys = section.keys as readonly Key[];

  const pick = (c: PlatformConfig) => keys.map((k) => c[k]);
  const dirty = !deepEqual(pick(local), pick(working));
  const changedFromLive = !deepEqual(pick(working), pick(published));

  const issues = useMemo(() => {
    const result = platformConfigSchema.safeParse(local);
    if (result.success) return new Map<string, string>();
    return new Map(result.error.issues.filter((i) => keys.includes(i.path[0] as Key)).map((i) => [i.path.join("."), i.message]));
  }, [local, keys]);

  const save = () =>
    perform(
      (s, now) =>
        editDraft(
          s,
          published,
          "settings.edit",
          `Edited ${section.label.toLowerCase()} settings`,
          (c) => ({ ...c, ...Object.fromEntries(keys.map((k) => [k, local[k]])) }),
          now,
        ),
      "Saved to draft. Publish to make it live.",
    );

  return (
    <Card>
      <CardHeader title={section.label} description={section.description}>
        {changedFromLive && !dirty && (
          <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11.5px] font-medium text-warning">Unpublished</span>
        )}
      </CardHeader>
      <fieldset disabled={!canEdit} className="min-w-0 space-y-6 p-5">
        {forms[section.id]({ value: local, set: (patch) => setLocal((c) => ({ ...c, ...patch })), err: (p) => issues.get(p) })}
      </fieldset>
      <AnimatePresence>
        {canEdit && dirty && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="sticky bottom-3 mx-3 mb-3 flex flex-col gap-3 rounded-2xl bg-ink-950 p-3 pl-4 text-canvas shadow-pop sm:flex-row sm:items-center"
          >
            <p className="flex-1 text-[13px]">
              {issues.size ? (
                <span className="flex items-center gap-2 text-[#f0b45a]">
                  <AlertTriangle className="size-4" aria-hidden />
                  Fix {issues.size} problem{issues.size > 1 ? "s" : ""} before saving
                </span>
              ) : (
                "You have unsaved changes"
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setLocal(working)} className={buttonClass("glass", "sm")}>
                Reset
              </button>
              <button type="button" onClick={save} disabled={issues.size > 0} className={buttonClass("white", "sm", "disabled:opacity-50")}>
                Save to draft
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// Small helpers

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink-950">{title}</p>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Group({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-line pt-6 first:border-0 first:pt-0">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink-950">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-400 hover:bg-maroon-50 hover:text-maroon-700"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

const pct = (rate: number) => Math.round(rate * 1000) / 10;
const fromPct = (v: number) => Math.round(v * 10) / 1000;
const replaceAt = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));

// Sections

function General({ value: c, set, err }: SectionProps) {
  return (
    <>
      <Group title="Brand">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marketplace name" error={err("brand.name")}>
            {(id) => <TextInput id={id} value={c.brand.name} onChange={(e) => set({ brand: { ...c.brand, name: e.target.value } })} />}
          </Field>
          <Field label="Support email" error={err("brand.supportEmail")}>
            {(id) => (
              <TextInput
                id={id}
                type="email"
                value={c.brand.supportEmail}
                onChange={(e) => set({ brand: { ...c.brand, supportEmail: e.target.value } })}
              />
            )}
          </Field>
          <Field label="Tagline" className="sm:col-span-2" error={err("brand.tagline")} hint="Shown in browser tabs and search results.">
            {(id) => (
              <TextInput id={id} value={c.brand.tagline} onChange={(e) => set({ brand: { ...c.brand, tagline: e.target.value } })} />
            )}
          </Field>
        </div>
      </Group>
      <Group title="Access" description="Only students with these email domains can create an account.">
        <TagList
          label="Allowed email domains"
          values={c.access.allowedEmailDomains}
          onChange={(v) => set({ access: { ...c.access, allowedEmailDomains: v.map((d) => d.replace(/^@/, "").toLowerCase()) } })}
          placeholder="Add a domain, e.g. ashesi.edu.gh"
        />
        {err("access.allowedEmailDomains") && <p className="text-xs text-maroon-700">Add at least one domain.</p>}
        <Row title="School single sign-on" description="Show the “Continue with school account” button on sign-in.">
          <Switch
            label="School single sign-on"
            checked={c.access.allowSingleSignOn}
            onChange={(v) => set({ access: { ...c.access, allowSingleSignOn: v } })}
          />
        </Row>
      </Group>
    </>
  );
}

function Payments({ value: c, set, err }: SectionProps) {
  const methods = c.payments.methods;
  const plans = c.boostPlans;
  return (
    <>
      <Group title="Fees" description="Rates apply to new orders as soon as the change is published.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Buyer protection fee"
            error={err("fees.buyerProtectionRate")}
            hint="Added at checkout. Covers held payments and refunds."
          >
            {(id) => (
              <NumberInput
                id={id}
                value={pct(c.fees.buyerProtectionRate)}
                onChange={(v) => set({ fees: { ...c.fees, buyerProtectionRate: fromPct(v) } })}
                suffix="%"
                step={0.5}
                min={0}
                max={30}
              />
            )}
          </Field>
          <Field label="Seller fee" error={err("fees.sellerFeeRate")} hint="Taken from the seller's payout. 0% keeps selling free.">
            {(id) => (
              <NumberInput
                id={id}
                value={pct(c.fees.sellerFeeRate)}
                onChange={(v) => set({ fees: { ...c.fees, sellerFeeRate: fromPct(v) } })}
                suffix="%"
                step={0.5}
                min={0}
                max={30}
              />
            )}
          </Field>
        </div>
      </Group>
      <Group
        title="Payment methods"
        description="Shown at checkout in this order."
        action={
          <AddButton
            onClick={() =>
              set({
                payments: {
                  methods: [...methods, { id: `method-${methods.length + 1}`, label: "New method", kind: "momo", enabled: false }],
                },
              })
            }
          >
            Add
          </AddButton>
        }
      >
        <ul className="space-y-2">
          {methods.map((m, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 sm:flex-nowrap">
              <TextInput
                aria-label="Method name"
                value={m.label}
                onChange={(e) => set({ payments: { methods: replaceAt(methods, i, { label: e.target.value }) } })}
                className="min-w-0 flex-1"
              />
              <Select
                aria-label="Type"
                value={m.kind}
                onChange={(e) => set({ payments: { methods: replaceAt(methods, i, { kind: e.target.value as "momo" | "card" }) } })}
                className="w-44"
              >
                <option value="momo">Mobile money</option>
                <option value="card">Card</option>
              </Select>
              <Switch
                label={`${m.label} enabled`}
                checked={m.enabled}
                onChange={(v) => set({ payments: { methods: replaceAt(methods, i, { enabled: v }) } })}
              />
              <RemoveButton label={`Remove ${m.label}`} onClick={() => set({ payments: { methods: methods.filter((_, j) => j !== i) } })} />
            </li>
          ))}
        </ul>
        {!methods.some((m) => m.enabled) && <p className="text-xs text-warning">With no method enabled, nobody can check out.</p>}
      </Group>
      <Group
        title="Promotion plans"
        description="What sellers can pay to boost a listing."
        action={
          <AddButton
            onClick={() =>
              set({ boostPlans: [...plans, { id: `plan-${plans.length + 1}`, label: "New plan", price: 10, reach: "", enabled: false }] })
            }
          >
            Add
          </AddButton>
        }
      >
        <ul className="space-y-2">
          {plans.map((p, i) => (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_120px_1.4fr_auto_auto] sm:items-center"
            >
              <TextInput
                aria-label="Plan name"
                value={p.label}
                onChange={(e) => set({ boostPlans: replaceAt(plans, i, { label: e.target.value }) })}
              />
              <div className="sm:order-none">
                <NumberInput
                  value={p.price}
                  onChange={(v) => set({ boostPlans: replaceAt(plans, i, { price: v }) })}
                  prefix="GH₵"
                  min={0}
                />
              </div>
              <TextInput
                aria-label="Expected reach"
                placeholder="e.g. About 2x more views"
                value={p.reach}
                onChange={(e) => set({ boostPlans: replaceAt(plans, i, { reach: e.target.value }) })}
              />
              <div className="flex items-center justify-end gap-1">
                <Switch
                  label={`${p.label} enabled`}
                  checked={p.enabled}
                  onChange={(v) => set({ boostPlans: replaceAt(plans, i, { enabled: v }) })}
                />
                <RemoveButton label={`Remove ${p.label}`} onClick={() => set({ boostPlans: plans.filter((_, j) => j !== i) })} />
              </div>
            </li>
          ))}
        </ul>
      </Group>
    </>
  );
}

function Listings({ value: c, set, err }: SectionProps) {
  const l = c.listings;
  const num = (key: "maxPhotos" | "titleMax" | "descriptionMax" | "maxPrice") => (v: number) => set({ listings: { ...l, [key]: v } });
  return (
    <>
      <Group title="Limits">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Photos per listing" error={err("listings.maxPhotos")}>
            {(id) => <NumberInput id={id} value={l.maxPhotos} onChange={num("maxPhotos")} min={1} max={20} />}
          </Field>
          <Field label="Highest price" error={err("listings.maxPrice")}>
            {(id) => <NumberInput id={id} value={l.maxPrice} onChange={num("maxPrice")} prefix="GH₵" min={0} />}
          </Field>
          <Field label="Title length" error={err("listings.titleMax")}>
            {(id) => <NumberInput id={id} value={l.titleMax} onChange={num("titleMax")} suffix="characters" min={20} max={140} />}
          </Field>
          <Field label="Description length" error={err("listings.descriptionMax")}>
            {(id) => (
              <NumberInput id={id} value={l.descriptionMax} onChange={num("descriptionMax")} suffix="characters" min={100} max={5000} />
            )}
          </Field>
        </div>
      </Group>
      <Group title="Banned words" description="Listings containing these words can't be posted.">
        <TagList
          label="Banned words"
          values={l.bannedWords}
          onChange={(v) => set({ listings: { ...l, bannedWords: v } })}
          placeholder="Add a word and press Enter"
        />
      </Group>
      <Group
        title="Conditions"
        description="The condition options sellers pick from."
        action={<AddButton onClick={() => set({ conditions: [...c.conditions, { value: "", help: "" }] })}>Add</AddButton>}
      >
        <ul className="space-y-2">
          {c.conditions.map((cond, i) => (
            <li key={i} className="flex gap-2">
              <TextInput
                aria-label="Condition"
                placeholder="Name"
                value={cond.value}
                onChange={(e) => set({ conditions: replaceAt(c.conditions, i, { value: e.target.value }) })}
                className="w-36 shrink-0"
                aria-invalid={!!err(`conditions.${i}.value`)}
              />
              <TextInput
                aria-label="Explanation"
                placeholder="What it means"
                value={cond.help}
                onChange={(e) => set({ conditions: replaceAt(c.conditions, i, { help: e.target.value }) })}
              />
              <RemoveButton label={`Remove ${cond.value}`} onClick={() => set({ conditions: c.conditions.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Pickup spots" description="Safe places on campus where buyers and sellers meet.">
        <TagList label="Pickup spots" values={c.pickupSpots} onChange={(v) => set({ pickupSpots: v })} placeholder="Add a spot" />
        {err("pickupSpots") && <p className="text-xs text-maroon-700">Add at least one pickup spot.</p>}
      </Group>
      <Group title="Popular searches" description="Suggested in the search box. Up to 12.">
        <TagList
          label="Popular searches"
          values={c.search.popular}
          onChange={(v) => set({ search: { popular: v } })}
          placeholder="Add a search"
          max={12}
        />
      </Group>
    </>
  );
}

function Rules({ value: c, set, err }: SectionProps) {
  const reasons = c.disputes.reasons;
  return (
    <>
      <Group title="Offers">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lowest offer allowed" error={err("offers.minRatio")} hint="As a share of the asking price.">
            {(id) => (
              <NumberInput
                id={id}
                value={pct(c.offers.minRatio)}
                onChange={(v) => set({ offers: { ...c.offers, minRatio: fromPct(v) } })}
                suffix="% of price"
                min={0}
                max={100}
                step={5}
              />
            )}
          </Field>
          <Field label="Auto-accept at" error={err("offers.autoAcceptRatio")} hint="Offers at or above this are accepted instantly.">
            {(id) => (
              <NumberInput
                id={id}
                value={pct(c.offers.autoAcceptRatio)}
                onChange={(v) => set({ offers: { ...c.offers, autoAcceptRatio: fromPct(v) } })}
                suffix="% of price"
                min={0}
                max={100}
                step={5}
              />
            )}
          </Field>
        </div>
      </Group>
      <Group
        title="Dispute reasons"
        description="What buyers choose from when reporting a problem."
        action={
          <AddButton
            onClick={() =>
              set({ disputes: { ...c.disputes, reasons: [...reasons, { id: `reason-${Date.now().toString(36)}`, label: "" }] } })
            }
          >
            Add
          </AddButton>
        }
      >
        <ul className="space-y-2">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <TextInput
                aria-label="Reason"
                value={r.label}
                placeholder="e.g. Item never arrived"
                onChange={(e) => set({ disputes: { ...c.disputes, reasons: replaceAt(reasons, i, { label: e.target.value }) } })}
                aria-invalid={!!err(`disputes.reasons.${i}.label`)}
              />
              <RemoveButton
                label={`Remove ${r.label}`}
                onClick={() => set({ disputes: { ...c.disputes, reasons: reasons.filter((_, j) => j !== i) } })}
              />
            </li>
          ))}
        </ul>
        <Field
          label="Response target"
          error={err("disputes.responseHours")}
          hint="Shown to students and used for the overdue alerts here."
          className="sm:w-1/2"
        >
          {(id) => (
            <NumberInput
              id={id}
              value={c.disputes.responseHours}
              onChange={(v) => set({ disputes: { ...c.disputes, responseHours: v } })}
              suffix="hours"
              min={1}
              max={168}
            />
          )}
        </Field>
      </Group>
    </>
  );
}

const featureInfo: Record<keyof PlatformConfig["features"], [string, string]> = {
  offers: ["Offers", "Buyers can propose a lower price."],
  messaging: ["Messaging", "Buyers and sellers can chat in the app."],
  reviews: ["Reviews", "Buyers rate sellers after collecting."],
  foodOrdering: ["Food pre-orders", "Same-day cut-offs and pickup slots for food sellers."],
  savedSearches: ["Saved searches", "Students get alerts for new matching listings."],
  sellerDashboard: ["Seller dashboard", "Sellers see views, saves and earnings."],
  sellerCategories: ["Seller-created categories", "Sellers can list under a category that doesn't exist yet."],
  installPrompt: ["Install prompt", "Suggest adding the app to the home screen."],
};

function Features({ value: c, set }: SectionProps) {
  return (
    <ul className="divide-y divide-line">
      {(Object.keys(featureInfo) as (keyof PlatformConfig["features"])[]).map((k) => (
        <li key={k} className="py-3.5 first:pt-0 last:pb-0">
          <Row title={featureInfo[k][0]} description={featureInfo[k][1]}>
            <Switch label={featureInfo[k][0]} checked={c.features[k]} onChange={(v) => set({ features: { ...c.features, [k]: v } })} />
          </Row>
        </li>
      ))}
    </ul>
  );
}

/** datetime-local works in local time; the config stores ISO strings. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

function Events({ value: c, set, err }: SectionProps) {
  const e = c.events.moveOut;
  const update = (patch: Partial<typeof e>) => set({ events: { ...c.events, moveOut: { ...e, ...patch } } });
  const backwards = new Date(e.endsAt) <= new Date(e.startsAt);
  return (
    <>
      <Row title="End-of-semester sale" description="Adds a sale page, badges on tagged listings and a banner on the home page.">
        <Switch label="End-of-semester sale" checked={e.enabled} onChange={(v) => update({ enabled: v })} />
      </Row>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={err("events.moveOut.name")}>
          {(id) => <TextInput id={id} value={e.name} onChange={(x) => update({ name: x.target.value })} />}
        </Field>
        <div className="hidden sm:block" />
        <Field label="Starts">
          {(id) => (
            <TextInput
              id={id}
              type="datetime-local"
              value={toLocal(e.startsAt)}
              onChange={(x) => update({ startsAt: fromLocal(x.target.value) })}
            />
          )}
        </Field>
        <Field label="Ends" error={backwards ? "Must be after the start." : undefined}>
          {(id) => (
            <TextInput
              id={id}
              type="datetime-local"
              value={toLocal(e.endsAt)}
              onChange={(x) => update({ endsAt: fromLocal(x.target.value) })}
            />
          )}
        </Field>
        <Field label="Description" className="sm:col-span-2" error={err("events.moveOut.blurb")} hint={`${e.blurb.length}/160`}>
          {(id) => <TextArea id={id} value={e.blurb} maxLength={160} onChange={(x) => update({ blurb: x.target.value })} />}
        </Field>
      </div>
    </>
  );
}

const toneStyles = {
  info: "bg-ink-950 text-canvas",
  promo: "bg-maroon-700 text-white",
  warning: "bg-warning-bg text-warning",
};

function Announcement({ value: c, set, err }: SectionProps) {
  const a = c.announcement;
  const update = (patch: Partial<typeof a>) => set({ announcement: { ...a, ...patch } });
  return (
    <>
      <Row title="Show announcement" description="Visible to everyone until you turn it off.">
        <Switch label="Show announcement" checked={a.enabled} onChange={(v) => update({ enabled: v })} />
      </Row>
      <Field label="Message" error={err("announcement.message")} hint={`${a.message.length}/160`}>
        {(id) => (
          <TextInput
            id={id}
            value={a.message}
            maxLength={160}
            placeholder="e.g. Payments are delayed this morning, we're on it"
            onChange={(e) => update({ message: e.target.value })}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Style">
          {(id) => (
            <Select id={id} value={a.tone} onChange={(e) => update({ tone: e.target.value as typeof a.tone })}>
              <option value="info">Information</option>
              <option value="promo">Promotion</option>
              <option value="warning">Warning</option>
            </Select>
          )}
        </Field>
        <Field label="Link (optional)" hint="A marketplace path like /move-out, or a full URL.">
          {(id) => (
            <TextInput
              id={id}
              value={a.href ?? ""}
              placeholder="/move-out"
              onChange={(e) => update({ href: e.target.value || undefined })}
            />
          )}
        </Field>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-ink-500">Preview</p>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className={cn("px-4 py-2.5 text-center text-[13px] font-medium", toneStyles[a.tone], !a.enabled && "opacity-40")}>
            {a.message || "Your message appears here"}
            {a.href && <span className="ml-2 underline underline-offset-4">Learn more</span>}
          </div>
          <div className="h-12 bg-surface" />
        </div>
      </div>
    </>
  );
}
