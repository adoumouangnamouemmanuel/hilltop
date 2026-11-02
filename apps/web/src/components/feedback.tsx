"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, MessageSquareWarning } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { Sheet } from "./sheet";
import { buttonClass, cn } from "./ui";

/*
 * "Report a problem or share an idea", from any page. Goes to the feedback table,
 * which the team reads in the admin portal. The page and device are attached so
 * bugs can be reproduced; nothing else about the visitor is collected.
 */

type Kind = "bug" | "idea" | "other";

const kinds: { id: Kind; label: string; prompt: string }[] = [
  { id: "bug", label: "Something's broken", prompt: "What happened, and what did you expect?" },
  { id: "idea", label: "An idea", prompt: "What would make Hilltop better for you?" },
  { id: "other", label: "Something else", prompt: "Tell us what's on your mind." },
];

/** Opens the feedback sheet from anywhere (a footer link, the help page). */
export const openFeedback = () => window.dispatchEvent(new Event("hilltop:feedback"));

// Pages whose own controls sit at the bottom of the screen (the composer, the publish
// button) don't show it; the footer link still opens feedback there.
const busyPages = ["/inbox", "/sell"];

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("hilltop:feedback", show);
    return () => window.removeEventListener("hilltop:feedback", show);
  }, []);

  const tucked = busyPages.some((p) => pathname.startsWith(p));
  // Phones: bottom right, above the tab bar (or a listing's buy bar, about the same height).
  // Larger screens: bottom left, clear of sticky buy and publish buttons on the right.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a problem or share feedback"
        title="Report a problem or share feedback"
        className={cn(
          "fixed right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 flex size-10 items-center justify-center gap-2 rounded-full border border-line bg-elevated/90 text-ink-700 shadow-card backdrop-blur transition-colors hover:text-ink-950 md:right-auto md:bottom-6 md:left-6 md:h-10 md:w-auto md:px-4 md:text-sm md:font-medium",
          tucked && "hidden",
        )}
      >
        <MessageSquareWarning className="size-[18px] shrink-0" aria-hidden />
        <span className="hidden md:inline">Feedback</span>
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const current = kinds.find((k) => k.id === kind)!;

  async function send() {
    const client = supabase();
    if (!client || message.trim().length < 3) return;
    setSending(true);
    const device = `${navigator.userAgent.slice(0, 200)} · ${window.innerWidth}x${window.innerHeight}`;
    const { error } = await client.from("feedback").insert({ kind, message: message.trim(), page: pathname.slice(0, 300), device });
    setSending(false);
    if (error) {
      toast(error.code === "23514" ? error.message : "Couldn't send that. Check your connection and try again.");
      return;
    }
    toast("Thanks! The Hilltop team reads every message.", { tone: "success" });
    setMessage("");
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Report a problem or share an idea"
      footer={
        <button
          type="button"
          disabled={sending || message.trim().length < 3}
          onClick={send}
          className={buttonClass("dark", "lg", "w-full")}
        >
          {sending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Send
        </button>
      }
    >
      <fieldset>
        <legend className="sr-only">What is it about?</legend>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <label
              key={k.id}
              className={cn(
                "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-maroon-600",
                kind === k.id ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-400",
              )}
            >
              <input type="radio" name="feedback-kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-5 block">
        <span className="text-sm font-semibold text-ink-950">{current.prompt}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          rows={5}
          className="mt-2 w-full resize-none rounded-xl border border-line-strong bg-elevated p-3 text-[15px] outline-none focus:border-ink-950 md:text-sm"
        />
      </label>
      <p className="mt-2 text-xs leading-5 text-ink-500">
        We include the page you&rsquo;re on and your browser, to help us fix bugs. For a problem with an order, use &ldquo;Report a
        problem&rdquo; on the order instead.
      </p>
    </Sheet>
  );
}
