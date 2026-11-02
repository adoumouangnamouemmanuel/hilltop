"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, type Control, type FieldErrors } from "react-hook-form";
import type { AttributeDef, CategoryDef } from "@/lib/catalog";
import type { AttrValue } from "@/lib/data";
import type { ListingFormValues } from "@/lib/validation";
import { Switch } from "@/components/controls";
import { cn } from "@/components/ui";
import { borderFor, fieldClass } from "./form-bits";

/** Every field the category's schema declares, plus free-form extra details. */
export function AttributeFields({
  category,
  control,
  errors,
}: {
  category: CategoryDef;
  control: Control<ListingFormValues>;
  errors: FieldErrors<ListingFormValues>;
}) {
  const attrErrors = (errors.attributes ?? {}) as Record<string, { message?: string } | undefined>;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {category.attributes.map((a) => (
          <Controller
            key={a.key}
            control={control}
            name={`attributes.${a.key}`}
            render={({ field }) => (
              <AttributeField def={a} value={field.value} onChange={field.onChange} error={attrErrors[a.key]?.message} />
            )}
          />
        ))}
      </div>
      <ExtraDetails control={control} />
    </>
  );
}

function AttributeField({
  def,
  value,
  onChange,
  error,
}: {
  def: AttributeDef;
  value: AttrValue | "" | undefined;
  onChange: (v: AttrValue | "") => void;
  error?: string;
}) {
  const id = `attr-${def.key}`;
  if (def.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line-strong px-4 py-3">
        <span className="text-sm text-ink-950">{def.label}</span>
        <Switch checked={value === true} onChange={onChange} label={def.label} />
      </div>
    );
  }
  if (def.type === "select" && def.options) {
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 block text-xs text-ink-500">{def.label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(value === o ? "" : o)}
              aria-pressed={value === o}
              className={cn(
                "h-9 rounded-lg border px-3 text-[13px] transition-colors",
                value === o ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
              )}
            >
              {o}
            </button>
          ))}
        </div>
        {error && <p className="mt-1.5 text-xs text-maroon-700">{error}</p>}
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs text-ink-500">
        {def.label}
      </label>
      <span className="relative block">
        <input
          id={id}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (def.type !== "number") return onChange(raw);
            const digits = raw.replace(/\D/g, "");
            onChange(digits === "" ? "" : Number(digits));
          }}
          inputMode={def.type === "number" ? "numeric" : undefined}
          placeholder={def.placeholder}
          aria-invalid={!!error}
          className={cn(fieldClass, borderFor(error), "h-11", def.unit && "pr-10")}
        />
        {def.unit && <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-ink-500">{def.unit}</span>}
      </span>
      {error && <p className="mt-1.5 text-xs text-maroon-700">{error}</p>}
    </div>
  );
}

function ExtraDetails({ control }: { control: Control<ListingFormValues> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "extra" });
  return (
    <div className="mt-5">
      <AnimatePresence initial={false}>
        {fields.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2">
              <Controller
                control={control}
                name={`extra.${i}.label`}
                render={({ field }) => (
                  <input
                    {...field}
                    placeholder="Detail, e.g. Warranty"
                    className={cn(fieldClass, borderFor(), "h-11 text-sm")}
                    aria-label="Detail name"
                  />
                )}
              />
              <Controller
                control={control}
                name={`extra.${i}.value`}
                render={({ field }) => (
                  <input
                    {...field}
                    placeholder="e.g. 6 months left"
                    className={cn(fieldClass, borderFor(), "h-11 text-sm")}
                    aria-label="Detail value"
                  />
                )}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="grid size-11 place-items-center rounded-xl text-ink-500 hover:bg-surface hover:text-ink-950"
                aria-label="Remove detail"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {fields.length < 10 && (
        <button
          type="button"
          onClick={() => append({ label: "", value: "" })}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-950 underline underline-offset-4"
        >
          <Plus className="size-3.5" aria-hidden /> Add your own detail
        </button>
      )}
    </div>
  );
}
