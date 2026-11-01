"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, KeyRound, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { LogoMark } from "@hilltop/ui/logo";
import { ThemeToggle } from "@hilltop/ui/theme-toggle";
import { Avatar, buttonClass, cn } from "@hilltop/ui/ui";
import { startSession } from "@/app/actions";
import engineeringBuilding from "@/assets/campus/engineering-building.jpg";
import { Badge, Field, TextInput } from "@/components/kit";
import { signIn, useAdmin, useHydrated, usePublished } from "@/lib/store";

export function SignIn() {
  const router = useRouter();
  const s = useAdmin();
  const { accessKeyRequired } = usePublished();
  const mounted = useHydrated();
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e?: React.FormEvent, as?: string) {
    e?.preventDefault();
    const address = (as ?? email).trim().toLowerCase();
    const member = s.team.find((m) => m.email === address);
    if (!member) {
      setError("That email isn't on the admin team. Ask an owner to invite you.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await startSession(key);
      if (!result.ok) {
        setError(result.error ?? "Couldn't sign you in.");
        return;
      }
      signIn(member.id);
      router.replace("/");
    });
  }

  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-ink-950">hilltop</span>
            <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              Admin
            </span>
          </div>
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-maroon-50 text-maroon-700">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.035em] text-ink-950">Sign in to the admin portal</h1>
          <p className="mt-2 text-sm text-ink-500">Run the marketplace: moderation, payments, disputes and every platform setting.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Work email" error={error || undefined}>
              {(id) => (
                <TextInput
                  id={id}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ashesi.edu.gh"
                  aria-invalid={!!error}
                  className="h-12"
                />
              )}
            </Field>
            {accessKeyRequired && (
              <Field label="Access key" hint="Shared by the platform owner. Needed to publish changes.">
                {(id) => (
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
                    <TextInput
                      id={id}
                      type="password"
                      autoComplete="current-password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      className="h-12 pl-10"
                    />
                  </div>
                )}
              </Field>
            )}
            <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Continue
              {!pending && <ArrowRight className="size-4" aria-hidden />}
            </button>
          </form>

          {mounted && (
            <div className="mt-10">
              <p className="text-xs font-semibold tracking-wider text-ink-400 uppercase">Demo team</p>
              <p className="mt-1 text-[13px] text-ink-500">Sign in as anyone to see what their role can do.</p>
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {s.team.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setEmail(m.email);
                        submit(undefined, m.email);
                      }}
                      className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface"
                    >
                      <Avatar name={m.name} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink-950">{m.name}</span>
                        <span className="block truncate text-xs text-ink-500">{m.email}</span>
                      </span>
                      <Badge tone={m.roleId === "owner" ? "maroon" : "neutral"}>{roleName(m.roleId)}</Badge>
                      <ArrowRight
                        className={cn("size-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-700")}
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
        <p className="text-center text-xs text-ink-400">Every action in the portal is recorded in the audit log.</p>
      </div>

      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <Image
          src={engineeringBuilding}
          alt="King Engineering Building, Ashesi University"
          fill
          priority
          placeholder="blur"
          sizes="55vw"
          quality={90}
          className="animate-ken-burns object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2a0a0f]/95 via-[#2a0a0f]/25 to-black/10" />
        <p className="absolute top-8 left-8 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
          <MapPin className="size-3.5" aria-hidden />
          King Engineering Building, Ashesi University
        </p>
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="max-w-md text-[30px] leading-tight font-semibold tracking-[-0.035em]">
            Everything the marketplace does, configured from one place.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-6 border-t border-white/15 pt-6">
            {[
              ["Fees", "and payments"],
              ["Roles", "with fine permissions"],
              ["Releases", "with rollback"],
            ].map(([a, b]) => (
              <div key={a}>
                <p className="text-[15px] font-semibold">{a}</p>
                <p className="mt-0.5 text-[13px] text-white/65">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
