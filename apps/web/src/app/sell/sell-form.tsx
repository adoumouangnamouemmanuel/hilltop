"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { enabledBoostPlans } from "@hilltop/shared/config";
import { useMarket } from "@/lib/use-market";
import { useConfig } from "@/lib/config";
import { formatCedi } from "@/lib/format";
import { isActive } from "@/lib/model";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useCatalog } from "@/lib/use-catalog";
import { buildListingSchema, draftProblem, emptyListingForm, fromListing, toListing, type ListingFormValues } from "@/lib/validation";
import { Checkbox } from "@/components/controls";
import { buttonClass, cn } from "@/components/ui";
import { AttributeFields } from "./attribute-fields";
import { CategoryPicker } from "./category-picker";
import { borderFor, fieldClass, LabeledInput, Pill, Section } from "./form-bits";
import { PhotoPicker } from "./photo-picker";
import { Preview } from "./preview";

import { listingIdFor } from "@/lib/mine";

export function SellForm() {
  const router = useRouter();
  const editId = useSearchParams().get("edit");
  const { user, myListings, saveListing } = useStore();
  const catalog = useCatalog();
  const config = useConfig();
  const { maxPhotos, titleMax, descriptionMax } = config.listings;
  // Promotion is paid, so it waits for paying in the app.
  const boostPlans = config.payments.inApp ? enabledBoostPlans(config) : [];
  const editing = editId ? myListings.find((l) => l.id === editId) : undefined;
  const [status, setStatus] = useState<"idle" | "publishing" | "done">("idle");

  // The schema follows whichever category is picked, so its fields are validated too.
  const resolver: Resolver<ListingFormValues> = (values, ctx, opts) =>
    // The schema's input type marks optional fields differently from the form type; the shapes match.
    zodResolver(buildListingSchema(values.category ? catalog.get(values.category) : null, config))(
      values as never,
      ctx,
      opts as never,
    ) as ReturnType<Resolver<ListingFormValues>>;

  const form = useForm<ListingFormValues>({ defaultValues: emptyListingForm(config), resolver, mode: "onTouched" });
  const { control, handleSubmit, formState, setValue, getValues, reset, setError } = form;
  const errors = formState.errors;
  const values = useWatch({ control }) as ListingFormValues;
  const category = values.category ? catalog.get(values.category) : null;

  // Load the listing being edited once it's available.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (editing && loadedId !== editing.id) setLoadedId(editing.id);
  useEffect(() => {
    if (editing && loadedId === editing.id) reset(fromListing(editing, config));
    // Only when switching to a different listing, not on every edit of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId, reset]);

  const market = useMarket();
  const guide = useMemo(() => {
    if (!values.category) return null;
    const prices = market.listings
      .filter((l) => l.category === values.category)
      .map((l) => l.price)
      .sort((a, b) => a - b);
    if (prices.length < 3) return null;
    return { low: prices[Math.floor(prices.length * 0.25)], high: prices[Math.floor(prices.length * 0.75)] };
  }, [values.category, market.listings]);

  if (!user) {
    return (
      <div className="mt-8 max-w-lg rounded-2xl border border-line p-8">
        <h1 className="text-lg font-semibold text-ink-950">Log in to start selling</h1>
        <p className="mt-1.5 text-sm leading-6 text-ink-500">
          Only verified Ashesi students can list items. It&rsquo;s what makes buyers trust you.
        </p>
        <Link href="/sign-in?next=/sell" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with Ashesi email
        </Link>
      </div>
    );
  }

  const isDraft = editing?.status === "draft";
  const publishLabel = editing && !isDraft ? "Save changes" : "Publish listing";
  const plan = boostPlans.find((p) => p.id === values.boost);

  // Editing a listing that's already live doesn't count against the cap.
  const activeCount = myListings.filter((l) => isActive(l) && l.id !== editing?.id).length;
  const cap = config.listings.maxActive;
  const atCap = cap > 0 && activeCount >= cap && !(editing && isActive(editing));

  const publish = handleSubmit(
    async (v) => {
      if (atCap) {
        toast(`You can have ${cap} active listings at a time. Mark one as sold, or save this as a draft.`);
        return;
      }
      setStatus("publishing");
      const listing = toListing(
        v,
        { id: editing?.id ?? listingIdFor(v.title), status: "active", previous: editing },
        category?.noCondition,
      );
      const result = await saveListing(listing);
      if ("error" in result) {
        setStatus("idle");
        toast(result.error);
        return;
      }
      setStatus("done");
      toast(editing && !isDraft ? "Changes saved" : "Your listing is live", { tone: "success" });
      setTimeout(() => router.push(`/listing/${listing.id}`), 600);
    },
    () => {
      toast("Some details need fixing before you can publish");
      requestAnimationFrame(() =>
        document.querySelector('[data-invalid="true"], [aria-invalid="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    },
  );

  async function saveDraft() {
    const v = getValues();
    const problem = draftProblem(v);
    if (problem) {
      setError("title", { message: problem });
      return;
    }
    const listing = toListing(v, { id: editing?.id ?? listingIdFor(v.title), status: "draft", previous: editing }, category?.noCondition);
    setStatus("publishing");
    const result = await saveListing(listing);
    setStatus("idle");
    if ("error" in result) {
      toast(result.error);
      return;
    }
    toast("Draft saved", { tone: "success", action: { label: "View drafts", href: "/me?tab=selling" } });
    if (!editing) router.replace(`/sell?edit=${listing.id}`, { scroll: false });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">
        {editing ? (isDraft ? "Finish your draft" : "Edit listing") : "List an item"}
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">Free to list. You&rsquo;re paid as soon as the buyer confirms collection.</p>

      <form onSubmit={publish} noValidate className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <div className="divide-y divide-line">
          <Section
            title="Photos"
            hint={`${values.photos.length}/${maxPhotos}. Tap a photo to make it the cover.`}
            error={errors.photos?.message}
          >
            <Controller
              control={control}
              name="photos"
              render={({ field }) => <PhotoPicker value={field.value} onChange={field.onChange} />}
            />
          </Section>

          <Section title="Category" error={errors.category?.message}>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <CategoryPicker
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    // Values from another category's schema don't apply.
                    if (id !== field.value) setValue("attributes", {});
                  }}
                />
              )}
            />
          </Section>

          <Section title="Title" error={errors.title?.message}>
            <div className="relative">
              <Controller
                control={control}
                name="title"
                render={({ field }) => (
                  <input
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.slice(0, titleMax))}
                    placeholder={values.category === "food" ? "e.g. Jollof with chicken, serves 1" : "e.g. iPhone 12, 128GB, unlocked"}
                    aria-label="Title"
                    aria-invalid={!!errors.title}
                    className={cn(fieldClass, borderFor(errors.title), "h-12 pr-16")}
                  />
                )}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-ink-500 tabular">
                {values.title.length}/{titleMax}
              </span>
            </div>
          </Section>

          <AnimatePresence mode="wait" initial={false}>
            {category && (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <Section title={`${category.label} details`} hint="Buyers filter by these, so fill in what you can">
                  <AttributeFields category={category} control={control} errors={errors} />
                </Section>
              </motion.div>
            )}
          </AnimatePresence>

          {category && !category.noCondition && (
            <Section title="Condition" error={errors.condition?.message}>
              <Controller
                control={control}
                name="condition"
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Condition" aria-invalid={!!errors.condition}>
                    {config.conditions.map(({ value: c, help }) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={field.value === c}
                        onClick={() => field.onChange(c)}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                          field.value === c ? "border-ink-950 bg-surface" : "border-line-strong hover:border-ink-400",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2",
                            field.value === c ? "border-ink-950" : "border-line-strong",
                          )}
                        >
                          {field.value === c && <motion.span layoutId="cond-dot" className="size-2 rounded-full bg-ink-950" />}
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-ink-950">{c}</span>
                          <span className="text-xs text-ink-500">{help}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              />
            </Section>
          )}

          {values.category === "food" && <FoodFields form={form} />}

          <Section title="Price">
            <div className="grid gap-3 sm:grid-cols-3">
              <Controller
                control={control}
                name="price"
                render={({ field }) => (
                  <LabeledInput
                    {...field}
                    label={category?.noCondition ? "Price each" : "Your price"}
                    prefix="GH₵"
                    placeholder="0"
                    error={errors.price?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="originalPrice"
                render={({ field }) => (
                  <LabeledInput
                    {...field}
                    label="Original price"
                    prefix="GH₵"
                    placeholder="Optional"
                    error={errors.originalPrice?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="stock"
                render={({ field }) => (
                  <LabeledInput {...field} label="Quantity" placeholder="1" inputMode="numeric" error={errors.stock?.message} />
                )}
              />
            </div>
            {guide && (
              <p className="mt-3 text-xs text-ink-500">
                Similar items sell for{" "}
                <span className="font-medium text-ink-950">
                  {formatCedi(guide.low)} to {formatCedi(guide.high)}
                </span>
                .
              </p>
            )}
          </Section>

          <Section title="Description" hint="Optional" error={errors.description?.message}>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <textarea
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.slice(0, descriptionMax))}
                  placeholder={
                    values.category === "food"
                      ? "Ingredients, how it's packed, when it's ready"
                      : "How old is it? Any marks or missing parts? What's included?"
                  }
                  rows={5}
                  aria-label="Description"
                  className={cn(fieldClass, borderFor(errors.description), "resize-none py-3 leading-6")}
                />
              )}
            />
            <p className="mt-1.5 text-right text-xs text-ink-500 tabular">
              {values.description.length}/{descriptionMax}
            </p>
          </Section>

          <Section title="Pickup spot" hint="Where buyers meet you">
            <Controller
              control={control}
              name="pickup"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {config.pickupSpots.map((p) => (
                    <Pill key={p} active={field.value === p} onClick={() => field.onChange(p)}>
                      {p}
                    </Pill>
                  ))}
                </div>
              )}
            />
          </Section>

          {boostPlans.length > 0 && (
            <Section title="Promote" hint="Optional" id="promote">
              <Controller
                control={control}
                name="boost"
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[{ id: "none" as const, label: "No promotion", price: 0, reach: "Standard placement" }, ...boostPlans].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => field.onChange(p.id)}
                        aria-pressed={field.value === p.id}
                        className={cn(
                          "rounded-xl border p-3.5 text-left transition-colors",
                          field.value === p.id ? "border-ink-950 bg-surface" : "border-line-strong hover:border-ink-400",
                        )}
                      >
                        <span className="flex items-center justify-between text-sm font-medium text-ink-950">
                          {p.label}
                          <span className="tabular">{p.price ? formatCedi(p.price) : "Free"}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">{p.reach}</span>
                      </button>
                    ))}
                  </div>
                )}
              />
              {config.events.moveOut.enabled && (
                <Controller
                  control={control}
                  name="moveOut"
                  render={({ field }) => (
                    <Checkbox checked={field.value} onChange={field.onChange} className="mt-4 rounded-xl border border-line-strong p-4">
                      <span className="block font-medium text-ink-950">Add to the {config.events.moveOut.name}</span>
                      <span className="text-xs text-ink-500">Featured to everyone shopping the end-of-semester sale.</span>
                    </Checkbox>
                  )}
                />
              )}
            </Section>
          )}
        </div>

        <aside className="lg:sticky lg:top-[132px] lg:self-start">
          <Preview values={values} category={category} />
          {atCap && (
            <p className="mt-5 rounded-xl bg-warning-bg px-3.5 py-3 text-[13px] leading-5 text-warning">
              You have {activeCount} active listings, the most allowed at once. Mark one as sold to publish this, or save it as a draft for
              later.
            </p>
          )}
          <button type="submit" disabled={status !== "idle"} className={buttonClass("primary", "lg", "mt-5 w-full disabled:bg-maroon-700")}>
            {status === "publishing" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Publishing
              </>
            ) : status === "done" ? (
              <>
                <Check className="size-4" aria-hidden /> Done
              </>
            ) : plan && !editing ? (
              `Publish and pay ${formatCedi(plan.price)}`
            ) : (
              publishLabel
            )}
          </button>
          {(!editing || isDraft) && (
            <button type="button" onClick={saveDraft} disabled={status !== "idle"} className={buttonClass("ghost", "md", "mt-2 w-full")}>
              Save as draft
            </button>
          )}
        </aside>
      </form>
    </>
  );
}

/** Cut-off time and pickup windows for made-to-order food. */
function FoodFields({ form }: { form: ReturnType<typeof useForm<ListingFormValues>> }) {
  const { control, formState, setValue } = form;
  const slots = useWatch({ control, name: "foodSlots" });
  const errors = formState.errors;
  return (
    <Section
      title="Ordering"
      hint="Buyers pick a pickup window at checkout"
      error={errors.foodSlots?.message ?? errors.foodCutoff?.message}
    >
      <Controller
        control={control}
        name="foodCutoff"
        render={({ field }) => (
          <div className="max-w-xs">
            <label htmlFor="cutoff" className="mb-1.5 block text-xs text-ink-500">
              Same-day orders close at
            </label>
            <input id="cutoff" type="time" {...field} className={cn(fieldClass, borderFor(errors.foodCutoff), "h-12")} />
            <p className="mt-1.5 text-xs text-ink-500">Later orders become pre-orders for the next day.</p>
          </div>
        )}
      />
      <p className="mt-5 mb-1.5 text-xs text-ink-500">Pickup windows</p>
      <div className="space-y-2">
        {slots.map((s, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={s}
              onChange={(e) =>
                setValue(
                  "foodSlots",
                  slots.map((x, j) => (j === i ? e.target.value : x)),
                  { shouldValidate: true },
                )
              }
              placeholder="e.g. 12:00 to 13:00"
              aria-label={`Pickup window ${i + 1}`}
              className={cn(fieldClass, borderFor(), "h-11 text-sm")}
            />
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setValue(
                    "foodSlots",
                    slots.filter((_, j) => j !== i),
                    { shouldValidate: true },
                  )
                }
                className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-500 hover:bg-surface hover:text-ink-950"
                aria-label="Remove window"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {slots.length < 4 && (
        <button
          type="button"
          onClick={() => setValue("foodSlots", [...slots, ""])}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-950 underline underline-offset-4"
        >
          <Plus className="size-3.5" aria-hidden /> Add a window
        </button>
      )}
    </Section>
  );
}
