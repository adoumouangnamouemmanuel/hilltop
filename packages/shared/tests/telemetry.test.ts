import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubUrl } from "../src/telemetry";

describe("telemetry scrubbing", () => {
  it("removes emails, tokens, headers and query strings from events", () => {
    const event = scrubEvent({
      message: "No account for kofi.mensah@ashesi.edu.gh",
      request: {
        url: "https://hilltop.lumavok.com/inbox?c=3f2a",
        query_string: "c=3f2a",
        cookies: { "sb-auth": "x" },
        headers: { authorization: "Bearer eyJabc.def.ghi", "user-agent": "Phone" },
      },
      user: { id: "u1", email: "kofi.mensah@ashesi.edu.gh", ip_address: "1.2.3.4" },
      exception: { values: [{ value: "JWT eyJhbGci.eyJzdWIi.c2ln expired" }] },
    });
    expect(event.message).toBe("No account for [email]");
    expect(event.request.url).toBe("https://hilltop.lumavok.com/inbox");
    expect(event.request).not.toHaveProperty("query_string");
    expect(event.request).not.toHaveProperty("cookies");
    expect(event.request.headers).toEqual({ authorization: "[removed]", "user-agent": "Phone" });
    expect(event.user).toEqual({ id: "u1" });
    expect(event.exception.values[0].value).toBe("JWT [token] expired");
  });

  it("strips query strings from navigation and request breadcrumbs", () => {
    expect(scrubBreadcrumb({ data: { url: "/auth/callback?code=123", to: "/me?tab=selling" } })).toEqual({
      data: { url: "/auth/callback", to: "/me" },
    });
    expect(scrubUrl("https://x.test/a#frag")).toBe("https://x.test/a");
  });
});
