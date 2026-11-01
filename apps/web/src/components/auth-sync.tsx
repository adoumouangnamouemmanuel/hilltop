"use client";

import { useEffect } from "react";
import { toUser } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

/** Keeps the app's signed-in user in step with the Supabase session, across tabs too. */
export function AuthSync() {
  const { setUser } = useStore();

  useEffect(() => {
    const client = supabase();
    if (!client) return;
    client.auth.getSession().then(({ data }) => setUser(toUser(data.session?.user)));
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }, [setUser]);

  return null;
}
