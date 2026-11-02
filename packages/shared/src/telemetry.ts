/*
 * Error reports leave out personal data. Sentry's own default already skips IP
 * addresses and cookies; this also removes sign-in headers, query strings (which
 * can carry conversation and order ids or sign-in codes), and email addresses or
 * tokens that end up in error messages and logged Supabase errors. Used as
 * `beforeSend` and `beforeBreadcrumb` by both apps, in the browser and the Worker.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN = /\b(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_(secret|publishable)_[\w-]+)\b/g;
const SECRET_HEADERS = /^(authorization|cookie|set-cookie|apikey|x-hilltop-webhook|cf-access-jwt-assertion)$/i;

export const scrubText = (text: string) => text.replace(EMAIL, "[email]").replace(TOKEN, "[token]");

/** A URL without its query string or fragment. */
export function scrubUrl(url: string) {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

type Loose = Record<string, unknown>;

function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth > 6 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  const out: Loose = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_HEADERS.test(k) ? "[removed]" : scrubDeep(v, depth + 1);
  return out;
}

export function scrubEvent<T>(event: T): T {
  const e = event as Loose & {
    request?: Loose & { url?: string; query_string?: unknown; cookies?: unknown; headers?: Loose; data?: unknown };
    user?: Loose;
    breadcrumbs?: (Loose & { data?: Loose })[];
  };
  if (e.request) {
    if (typeof e.request.url === "string") e.request.url = scrubUrl(e.request.url);
    delete e.request.query_string;
    delete e.request.cookies;
    delete e.request.data;
    if (e.request.headers) e.request.headers = scrubDeep(e.request.headers) as Loose;
  }
  if (e.user) e.user = e.user.id ? { id: e.user.id } : {};
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map((b) => scrubBreadcrumb(b));
  for (const key of ["message", "exception", "extra", "contexts", "tags"] as const) {
    if (e[key] !== undefined) e[key] = scrubDeep(e[key]);
  }
  return event;
}

export function scrubBreadcrumb<T>(crumb: T): T {
  const b = crumb as Loose & { message?: string; data?: Loose };
  if (typeof b.message === "string") b.message = scrubText(b.message);
  if (b.data) {
    const data = scrubDeep(b.data) as Loose;
    for (const key of ["url", "to", "from"]) if (typeof data[key] === "string") data[key] = scrubUrl(data[key] as string);
    b.data = data;
  }
  return crumb;
}
