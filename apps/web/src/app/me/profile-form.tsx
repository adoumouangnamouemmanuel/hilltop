"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { majors } from "@/lib/majors";
import { problem } from "@/lib/mine";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { buttonClass, cn } from "@/components/ui";

type Profile = {
  name: string;
  shop_name: string;
  specialty: string;
  class_of: string;
  major: string;
  response_time: string;
};

const empty: Profile = { name: "", shop_name: "", specialty: "", class_of: "", major: "", response_time: "" };
const years = Array.from({ length: 8 }, (_, i) => String(2024 + i));
const replyTimes = ["within 10 min", "within 30 min", "within an hour", "within a few hours", "within a day"];

const field =
  "h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-[15px] text-ink-950 outline-none focus:border-ink-950 md:text-sm";

/** What buyers see about the student: their name, shop and what they sell. */
export function ProfileForm() {
  const { user, refreshMine } = useStore();
  const [values, setValues] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const profileId = user?.profileId;

  useEffect(() => {
    if (!profileId) return;
    let live = true;
    supabase()
      ?.from("profiles")
      .select("name, shop_name, specialty, class_of, major, response_time")
      .eq("id", profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (!live || !data) return;
        setValues({
          name: data.name,
          shop_name: data.shop_name ?? "",
          specialty: data.specialty ?? "",
          class_of: data.class_of ? String(data.class_of) : "",
          major: data.major ?? "",
          response_time: data.response_time ?? "",
        });
      });
    return () => {
      live = false;
    };
  }, [profileId]);

  if (!profileId) return null;
  const v = values ?? empty;
  const set = (key: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues({ ...v, [key]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const client = supabase();
    if (!client || !values) return;
    if (!values.name.trim()) return toast("Add your name.");
    setSaving(true);
    const { data, error } = await client
      .from("profiles")
      .update({
        name: values.name.trim(),
        shop_name: values.shop_name.trim() || null,
        specialty: values.specialty.trim() || null,
        class_of: values.class_of ? Number(values.class_of) : null,
        major: values.major || null,
        response_time: values.response_time || null,
      })
      .eq("id", profileId!)
      .select("id");
    // The name in the session (shown in the header) follows the profile.
    if (!error) await client.auth.updateUser({ data: { full_name: values.name.trim() } });
    setSaving(false);
    if (error || !data?.length)
      return toast(problem(error, "Couldn't save your profile. Try again.") ?? "Couldn't save your profile. Try again.");
    toast("Profile saved", { tone: "success" });
    refreshMine();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-ink-500">
        Buyers see this on your listings and{" "}
        {user?.handle ? (
          <Link href={`/seller/${user.handle}`} className="font-medium text-ink-950 underline underline-offset-4">
            your seller page
          </Link>
        ) : (
          "your seller page"
        )}
        .
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-950">Name</span>
        <input value={v.name} onChange={set("name")} maxLength={80} autoComplete="name" className={field} disabled={!values} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-950">
          Shop name <span className="font-normal text-ink-500">(optional)</span>
        </span>
        <input
          value={v.shop_name}
          onChange={set("shop_name")}
          maxLength={40}
          placeholder="e.g. Eyecon"
          className={field}
          disabled={!values}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-950">What you sell</span>
        <input
          value={v.specialty}
          onChange={set("specialty")}
          maxLength={120}
          placeholder="e.g. Calculators, chargers and watches"
          className={field}
          disabled={!values}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-950">Class of</span>
          <select value={v.class_of} onChange={set("class_of")} className={cn(field, "appearance-none")} disabled={!values}>
            <option value="">Not shown</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-950">Usually replies</span>
          <select value={v.response_time} onChange={set("response_time")} className={cn(field, "appearance-none")} disabled={!values}>
            <option value="">Not shown</option>
            {replyTimes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-950">Major</span>
        <select value={v.major} onChange={set("major")} className={cn(field, "appearance-none")} disabled={!values}>
          <option value="">Not shown</option>
          {majors.map((group) => (
            <optgroup key={group.level} label={group.level}>
              {group.options.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </optgroup>
          ))}
          <option>Other</option>
        </select>
      </label>
      <button type="submit" disabled={saving || !values} className={buttonClass("dark", "md")}>
        {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Save profile
      </button>
    </form>
  );
}
