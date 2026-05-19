// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ORDER_FROM_EMAIL = Deno.env.get("ORDER_FROM_EMAIL") ?? "orders@flouer.app";
const ORDER_TO_EMAIL = Deno.env.get("ORDER_TO_EMAIL") ?? "skwakadood@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
};

const parsePayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as { subject?: unknown; html?: unknown };

  if (typeof raw.subject !== "string" || raw.subject.trim().length === 0) return null;
  if (typeof raw.html !== "string" || raw.html.trim().length === 0) return null;

  return {
    subject: raw.subject.trim().slice(0, 200),
    html: raw.html.slice(0, 20000),
  };
};

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Function is missing RESEND_API_KEY secret." }, 500);
    }

    const payload = parsePayload(await req.json().catch(() => null));
    if (!payload) {
      return jsonResponse({ error: "Invalid payload. Expected { subject, html }." }, 400);
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: ORDER_FROM_EMAIL,
        to: ORDER_TO_EMAIL,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    const data = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      return jsonResponse({ error: "Resend rejected the request.", details: data }, resendResponse.status);
    }

    return jsonResponse(data);
  },
};
