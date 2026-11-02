"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  CreditCard,
  Info,
  Megaphone,
  Package,
  Scale,
  Settings2,
  ShieldCheck,
  ToggleRight,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import type { Listing } from "@hilltop/shared/seed";
import { rankScore } from "@hilltop/shared/ranking";
import { formatCedi } from "@hilltop/shared/format";
import { paymentPlan } from "@hilltop/shared/payments";
import { deepEqual, platformConfigSchema, type PlatformConfig } from "@hilltop/shared/config";
import { Switch } from "@hilltop/ui/controls";
import { buttonClass, cn } from "@hilltop/ui/ui";
import { AddButton, Card, CardHeader, Field, Gate, NumberInput, PageHeader, Select, TagList, TextArea, TextInput } from "@/components/kit";
import { editDraft } from "@/lib/model";
import { perform, useAdmin, useCan, usePublished, useWorkingConfig } from "@/lib/store";
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
    id: "protection",
    label: "Payment protection",
    icon: ShieldCheck,
    keys: ["protection"],
    description: "When Hilltop holds the buyer's money, pre-order deposits and automatic release.",
  },
  {
    id: "listings",
    label: "Listings",
    icon: Package,
    keys: ["listings", "saved", "reports", "conditions", "pickupSpots", "search"],
    description: "Limits, expiry, reporting, conditions, pickup spots and search.",
  },
  {
    id: "ranking",
    label: "Ranking & featured",
    icon: TrendingUp,
    keys: ["ranking", "featured"],
    description: "How Best match orders listings, and the team's featured picks.",
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
  protection: Protection,
  ranking: Ranking,
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
        description={
          c.payments.inApp
            ? "Shown at checkout in this order."
            : "Paying in the app isn't connected yet, so every order is reserved and paid to the seller at pickup. These methods and the protection rules apply once it is."
        }
        action={
          <AddButton
            onClick={() =>
              set({
                payments: {
                  ...c.payments,
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
                onChange={(e) => set({ payments: { ...c.payments, methods: replaceAt(methods, i, { label: e.target.value }) } })}
                className="min-w-0 flex-1"
              />
              <Select
                aria-label="Type"
                value={m.kind}
                onChange={(e) =>
                  set({ payments: { ...c.payments, methods: replaceAt(methods, i, { kind: e.target.value as "momo" | "card" }) } })
                }
                className="w-44"
              >
                <option value="momo">Mobile money</option>
                <option value="card">Card</option>
              </Select>
              <Switch
                label={`${m.label} enabled`}
                checked={m.enabled}
                onChange={(v) => set({ payments: { ...c.payments, methods: replaceAt(methods, i, { enabled: v }) } })}
              />
              <RemoveButton
                label={`Remove ${m.label}`}
                onClick={() => set({ payments: { ...c.payments, methods: methods.filter((_, j) => j !== i) } })}
              />
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
  const num = (key: "maxPhotos" | "titleMax" | "descriptionMax" | "maxPrice" | "expiryDays" | "maxActive") => (v: number) =>
    set({ listings: { ...l, [key]: v } });
  const r = c.reports;
  return (
    <>
      <Group title="Keeping the marketplace fresh" description="Old and excess listings are the main source of clutter.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Listings expire after"
            error={err("listings.expiryDays")}
            hint="Sellers can renew with one tap. 0 keeps listings up until sold."
          >
            {(id) => <NumberInput id={id} value={l.expiryDays} onChange={num("expiryDays")} suffix="days" min={0} max={365} />}
          </Field>
          <Field label="Active listings per student" error={err("listings.maxActive")} hint="Drafts don't count. 0 means no limit.">
            {(id) => <NumberInput id={id} value={l.maxActive} onChange={num("maxActive")} min={0} max={500} />}
          </Field>
        </div>
      </Group>
      <Group title="Saved" description="How much each student can keep. 0 means no limit.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Saved items per student" error={err("saved.maxItems")}>
            {(id) => (
              <NumberInput
                id={id}
                value={c.saved.maxItems}
                onChange={(v) => set({ saved: { ...c.saved, maxItems: v } })}
                min={0}
                max={5000}
              />
            )}
          </Field>
          <Field
            label="Saved searches per student"
            error={err("saved.maxSearches")}
            hint="Each search with alerts is checked whenever anyone lists something, so keep this modest."
          >
            {(id) => (
              <NumberInput
                id={id}
                value={c.saved.maxSearches}
                onChange={(v) => set({ saved: { ...c.saved, maxSearches: v } })}
                min={0}
                max={200}
              />
            )}
          </Field>
        </div>
      </Group>
      <Group
        title="Reporting"
        description="Students can report listings; reports appear in the Listings moderation queue."
        action={
          r.enabled ? (
            <AddButton
              onClick={() => set({ reports: { ...r, reasons: [...r.reasons, { id: `reason-${Date.now().toString(36)}`, label: "" }] } })}
            >
              Add reason
            </AddButton>
          ) : undefined
        }
      >
        <Row title="Let students report listings" description="Shows a Report this listing link on every listing.">
          <Switch label="Let students report listings" checked={r.enabled} onChange={(v) => set({ reports: { ...r, enabled: v } })} />
        </Row>
        {r.enabled && (
          <ul className="space-y-2">
            {r.reasons.map((reason, i) => (
              <li key={reason.id} className="flex gap-2">
                <TextInput
                  aria-label="Report reason"
                  value={reason.label}
                  placeholder="e.g. Counterfeit item"
                  onChange={(e) => set({ reports: { ...r, reasons: replaceAt(r.reasons, i, { label: e.target.value }) } })}
                  aria-invalid={!!err(`reports.reasons.${i}.label`)}
                />
                <RemoveButton
                  label={`Remove ${reason.label}`}
                  onClick={() => set({ reports: { ...r, reasons: r.reasons.filter((_, j) => j !== i) } })}
                />
              </li>
            ))}
          </ul>
        )}
      </Group>

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

const modes = [
  {
    id: "hybrid",
    title: "Protect bigger purchases",
    body: "Held from a set price, or in chosen categories. Smaller items are paid at pickup.",
  },
  { id: "always", title: "Protect every purchase", body: "Every order is paid in the app and held until collection." },
  { id: "never", title: "Pay at pickup", body: "Buyers pay sellers directly when they meet. Hilltop holds nothing." },
] as const;

function Protection({ value: c, set, err }: SectionProps) {
  const p = c.protection;
  const update = (patch: Partial<typeof p>) => set({ protection: { ...p, ...patch } });
  const examples = [
    { label: "Textbook", total: 80, category: "books", preorder: false },
    { label: "Calculator", total: Math.max(1, p.threshold - 1), category: "calculators", preorder: false },
    { label: "Phone", total: Math.max(p.threshold, 1500), category: "phones", preorder: false },
    { label: "Food pre-order", total: 60, category: "food", preorder: true },
  ];

  return (
    <>
      <Group title="When to hold payments">
        <div role="radiogroup" aria-label="Protection mode" className="grid gap-2 sm:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={p.mode === m.id}
              onClick={() => update({ mode: m.id })}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-colors",
                p.mode === m.id ? "border-ink-950 bg-surface" : "border-line hover:border-line-strong",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-[13.5px] font-semibold text-ink-950">
                {m.title}
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full border-2",
                    p.mode === m.id ? "border-ink-950" : "border-line-strong",
                  )}
                >
                  {p.mode === m.id && <span className="size-2 rounded-full bg-ink-950" />}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-500">{m.body}</span>
            </button>
          ))}
        </div>
        {p.mode === "hybrid" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Protect orders from" error={err("protection.threshold")} hint="Orders at or above this total are always held.">
              {(id) => <NumberInput id={id} value={p.threshold} onChange={(v) => update({ threshold: v })} prefix="GH₵" min={0} />}
            </Field>
          </div>
        )}
        {p.mode === "hybrid" && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-900">Always protect these categories</p>
            <div className="flex flex-wrap gap-1.5">
              {c.categories.map((cat) => {
                const on = p.categories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update({ categories: on ? p.categories.filter((x) => x !== cat.id) : [...p.categories, cat.id] })}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      on ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
                    )}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {p.mode !== "always" && (
          <Row
            title="Let buyers add protection"
            description="When it isn't required, buyers can still choose to pay in the app, for the protection fee."
          >
            <Switch label="Let buyers add protection" checked={p.optional} onChange={(v) => update({ optional: v })} />
          </Row>
        )}
      </Group>

      <Group title="Releasing held money" description="Held money always goes to the seller when the buyer confirms collection.">
        <Row
          title="Release automatically"
          description="After the seller marks the item handed over, pay them once this time passes, unless the buyer reports a problem."
        >
          <Switch
            label="Release automatically"
            checked={p.autoReleaseHours > 0}
            onChange={(v) => update({ autoReleaseHours: v ? 24 : 0 })}
          />
        </Row>
        {p.autoReleaseHours > 0 && (
          <Field label="Release after" error={err("protection.autoReleaseHours")} className="sm:w-1/2">
            {(id) => (
              <NumberInput
                id={id}
                value={p.autoReleaseHours}
                onChange={(v) => update({ autoReleaseHours: v })}
                suffix="hours"
                min={1}
                max={336}
                step={1}
              />
            )}
          </Field>
        )}
      </Group>

      <Group
        title="Pre-order deposits"
        description="For made-to-order items like food. The deposit is held; the rest is paid to the seller at pickup."
      >
        <Row title="Take a deposit on pre-orders" description="When off, pre-orders follow the rules above.">
          <Switch
            label="Take a deposit on pre-orders"
            checked={p.deposit.enabled}
            onChange={(v) => update({ deposit: { ...p.deposit, enabled: v } })}
          />
        </Row>
        {p.deposit.enabled && (
          <Field label="Deposit" error={err("protection.deposit.rate")} className="sm:w-1/2">
            {(id) => (
              <NumberInput
                id={id}
                value={pct(p.deposit.rate)}
                onChange={(v) => update({ deposit: { ...p.deposit, rate: fromPct(v) } })}
                suffix="% of the order"
                min={5}
                max={100}
                step={5}
              />
            )}
          </Field>
        )}
      </Group>

      <Group title="How it plays out" description="With these settings, before the buyer makes any choice.">
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {examples.map((e) => {
            const plan = paymentPlan(c, e);
            const text =
              plan.kind === "deposit"
                ? `${formatCedi(plan.payNow)} deposit now, ${formatCedi(plan.atPickup)} at pickup`
                : plan.kind === "protected"
                  ? `${formatCedi(plan.payNow)} paid in the app and held`
                  : `Paid at pickup${plan.optional ? ", protection optional" : ""}`;
            return (
              <li key={e.label} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <span className="text-ink-900">
                  {e.label} <span className="text-ink-500">· {formatCedi(e.total)}</span>
                </span>
                <span className="text-right text-ink-700">{text}</span>
              </li>
            );
          })}
        </ul>
      </Group>
    </>
  );
}

const signals = [
  { key: "freshness", label: "Freshness", help: "Newer listings rank higher, fading over the expiry window." },
  { key: "photos", label: "Photos", help: "Listings with more photos (up to four)." },
  { key: "popularity", label: "Popularity", help: "Saves and views." },
  { key: "sellerRating", label: "Seller rating", help: "Sellers with better reviews." },
  { key: "promoted", label: "Paid promotion", help: "Listings sellers paid to boost." },
  { key: "featured", label: "Featured by the team", help: "Listings you pick below." },
] as const;

function Ranking({ value: c, set, err }: SectionProps) {
  const w = c.ranking;
  const f = c.featured;
  const [query, setQuery] = useState("");
  const { listings: live, users } = useAdmin();
  const [now] = useState(() => Date.now());
  // Live listings in the shape the marketplace ranks.
  const catalogListings = useMemo(
    () =>
      live
        .filter((l) => l.state === "live")
        .map((l): Listing => ({
          id: l.id,
          title: l.title,
          price: l.price,
          category: l.category,
          images: l.image ? [l.image] : [],
          description: "",
          sellerId: l.sellerId,
          pickup: "",
          postedDaysAgo: Math.floor((now - l.postedAt) / 86_400_000),
          promoted: l.promoted,
          saves: l.saves,
          views: l.views,
        })),
    [live, now],
  );
  const ratingOf = (id: string) => users.find((u) => u.id === id)?.rating ?? undefined;
  const byId = (id: string) => catalogListings.find((l) => l.id === id) ?? live.find((l) => l.id === id);
  const top = [...catalogListings].sort((a, b) => rankScore(b, c, ratingOf) - rankScore(a, c, ratingOf)).slice(0, 6);
  const matches = query.trim()
    ? catalogListings.filter((l) => !f.listingIds.includes(l.id) && l.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <>
      <Group
        title="Best match weights"
        description="When a search doesn't decide the order (or there is no search), these signals do. 0 ignores a signal."
      >
        <ul className="space-y-4">
          {signals.map((sig) => (
            <li key={sig.key} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[180px_1fr_40px]">
              <div>
                <p className="text-[13.5px] font-medium text-ink-950">{sig.label}</p>
                <p className="text-xs text-ink-500">{sig.help}</p>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={w[sig.key]}
                aria-label={sig.label}
                onChange={(e) => set({ ranking: { ...w, [sig.key]: Number(e.target.value) } })}
                className="w-full accent-[var(--maroon-700)]"
              />
              <span className="text-right text-sm font-semibold text-ink-950 tabular">{w[sig.key]}</span>
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-2 text-xs font-medium text-ink-500">Top of Best match with these weights</p>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {top.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-4 text-ink-400 tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink-900">{l.title}</span>
                {f.listingIds.includes(l.id) && <span className="text-[11px] font-medium text-maroon-700">Featured</span>}
                {l.promoted && <span className="text-[11px] text-ink-500">Promoted</span>}
              </li>
            ))}
          </ol>
        </div>
      </Group>

      <Group
        title="Featured listings"
        description="Shown in their own row on the home page, in this order. You can also feature from the Listings page."
      >
        <Field label="Row title" error={err("featured.title")} className="sm:w-1/2">
          {(id) => (
            <TextInput id={id} value={f.title} maxLength={40} onChange={(e) => set({ featured: { ...f, title: e.target.value } })} />
          )}
        </Field>
        <ul className="space-y-1.5">
          {f.listingIds.map((id, i) => (
            <li key={id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-[13px]">
              <span className="w-4 text-ink-400 tabular">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink-900">{byId(id)?.title ?? `${id} (not found)`}</span>
              <button
                type="button"
                onClick={() => set({ featured: { ...f, listingIds: swapAt(f.listingIds, i, i - 1) } })}
                disabled={i === 0}
                className="rounded-md px-1.5 text-xs text-ink-500 hover:text-ink-950 disabled:opacity-30"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => set({ featured: { ...f, listingIds: f.listingIds.filter((x) => x !== id) } })}
                aria-label={`Remove ${byId(id)?.title ?? id}`}
                className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-maroon-50 hover:text-maroon-700"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="relative">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search listings to feature"
            aria-label="Search listings to feature"
          />
          {matches.length > 0 && (
            <ul className="mt-1.5 divide-y divide-line overflow-hidden rounded-xl border border-line">
              {matches.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => {
                      set({ featured: { ...f, listingIds: [...f.listingIds, l.id] } });
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] text-ink-900 hover:bg-surface"
                  >
                    {l.title}
                    <span className="text-xs text-ink-500">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Group>
    </>
  );
}

const swapAt = <T,>(list: T[], i: number, j: number) => {
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
