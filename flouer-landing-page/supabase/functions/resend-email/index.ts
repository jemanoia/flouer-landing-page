// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ORDER_FROM_EMAIL = Deno.env.get("ORDER_FROM_EMAIL") ?? "orders@flouer.app";
const ORDER_TO_EMAIL = Deno.env.get("ORDER_TO_EMAIL") ?? "skwakadood@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

type SaleItemPayload = {
  id: string;
  flavor: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

type CustomerPayload = {
  firstName: string;
  middleName: string;
  lastName: string;
  address: string;
  email: string;
  phoneNumber: string;
};

type SalePayload = {
  invoiceNumber: string;
  createdAt: string;
  subtotal: number;
  items: SaleItemPayload[];
  customer: CustomerPayload;
};

const isValidLineItem = (value: unknown): value is SaleItemPayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.flavor === "string" &&
    candidate.flavor.trim().length > 0 &&
    typeof candidate.price === "number" &&
    Number.isFinite(candidate.price) &&
    candidate.price >= 0 &&
    typeof candidate.quantity === "number" &&
    Number.isInteger(candidate.quantity) &&
    candidate.quantity > 0 &&
    typeof candidate.lineTotal === "number" &&
    Number.isFinite(candidate.lineTotal) &&
    candidate.lineTotal >= 0
  );
};

const parseSalePayload = (value: unknown): SalePayload | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.invoiceNumber !== "string" || raw.invoiceNumber.trim().length === 0) return null;
  if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) return null;
  if (typeof raw.subtotal !== "number" || !Number.isFinite(raw.subtotal) || raw.subtotal < 0) return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0) return null;
  if (!raw.items.every(isValidLineItem)) return null;
  if (!raw.customer || typeof raw.customer !== "object") return null;

  const customer = raw.customer as Record<string, unknown>;
  const firstName = typeof customer.firstName === "string" ? customer.firstName.trim() : "";
  const middleName = typeof customer.middleName === "string" ? customer.middleName.trim() : "";
  const lastName = typeof customer.lastName === "string" ? customer.lastName.trim() : "";
  const address = typeof customer.address === "string" ? customer.address.trim() : "";
  const email = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
  const phoneNumber = typeof customer.phoneNumber === "string" ? customer.phoneNumber.trim() : "";

  if (!firstName || !lastName || !address || !email || !phoneNumber) return null;

  return {
    invoiceNumber: raw.invoiceNumber.trim().slice(0, 64),
    createdAt: new Date(raw.createdAt).toISOString(),
    subtotal: Number(raw.subtotal.toFixed(2)),
    items: raw.items,
    customer: {
      firstName: firstName.slice(0, 120),
      middleName: middleName.slice(0, 120),
      lastName: lastName.slice(0, 120),
      address: address.slice(0, 500),
      email: email.slice(0, 320),
      phoneNumber: phoneNumber.slice(0, 32),
    },
  };
};

const parsePayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as { subject?: unknown; html?: unknown; sale?: unknown };

  if (typeof raw.subject !== "string" || raw.subject.trim().length === 0) return null;
  if (typeof raw.html !== "string" || raw.html.trim().length === 0) return null;
  const sale = parseSalePayload(raw.sale);
  if (!sale) return null;

  return {
    subject: raw.subject.trim().slice(0, 200),
    html: raw.html.slice(0, 20000),
    sale,
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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Function is missing Supabase service-role configuration." }, 500);
    }

    const payload = parsePayload(await req.json().catch(() => null));
    if (!payload) {
      return jsonResponse({ error: "Invalid payload. Expected { subject, html, sale }." }, 400);
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { error: insertError } = await supabase.rpc("record_sale_and_adjust_inventory", {
      p_invoice_number: payload.sale.invoiceNumber,
      p_invoice_created_at: payload.sale.createdAt,
      p_checkout_subtotal: payload.sale.subtotal,
      p_line_items: payload.sale.items,
      p_customer_first_name: payload.sale.customer.firstName,
      p_customer_middle_name: payload.sale.customer.middleName || null,
      p_customer_last_name: payload.sale.customer.lastName,
      p_customer_address: payload.sale.customer.address,
      p_customer_email: payload.sale.customer.email,
      p_customer_phone: payload.sale.customer.phoneNumber,
    });

    if (insertError) {
      return jsonResponse(
        {
          error: "Checkout email sent, but saving sales record failed.",
          details: { message: insertError.message },
        },
        500,
      );
    }

    return jsonResponse(data);
  },
};
