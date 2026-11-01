import { currentConfig } from "@/lib/config-store";

/*
 * The live platform config, read by the marketplace (NEXT_PUBLIC_CONFIG_URL).
 * Public and read-only: it holds no secrets, only what shoppers already see.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function GET() {
  const config = await currentConfig();
  return Response.json(config, {
    headers: { ...cors, "Cache-Control": "public, max-age=30, stale-while-revalidate=300" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
