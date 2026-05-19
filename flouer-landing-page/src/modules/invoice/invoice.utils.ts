import type { InvoiceData, InvoiceLineItem } from "@/modules/invoice/types"

export const INVOICE_STORAGE_KEY = "flouer:last-invoice"
export const PAYMENT_RECEIVER = "Flouer GCash 0917-123-4567"

const invoicePriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

export const buildOrderEmailHtml = (
  items: InvoiceLineItem[],
  subtotal: number,
  invoiceNumber: string,
) => {
  const placedAt = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date())
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0)

  const lineItemsHtml = items
    .map((item) => {
      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1e6dc; color: #2c2420; font-size: 14px;">${escapeHtml(item.flavor)}</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1e6dc; text-align: center; color: #6a5a50; font-size: 14px;">${item.quantity}</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1e6dc; text-align: right; color: #6a5a50; font-size: 14px;">${invoicePriceFormatter.format(item.price)}</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1e6dc; text-align: right; color: #2c2420; font-size: 14px; font-weight: 600;">${invoicePriceFormatter.format(item.lineTotal)}</td>
        </tr>
      `
    })
    .join("")

  return `
<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 0; background: #f8f2ed; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8f2ed; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 680px; background: #ffffff; border-radius: 18px; overflow: hidden; border: 1px solid #f0e4da;">
            <tr>
              <td style="padding: 24px 28px; background: linear-gradient(120deg, #2d1f16, #5a3c2a); color: #fff8f3;">
                <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.88;">Flouer New Order</p>
                <h1 style="margin: 8px 0 0; font-size: 28px; line-height: 1.2; letter-spacing: 0.01em;">Order ${escapeHtml(invoiceNumber)}</h1>
                <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Placed on ${escapeHtml(placedAt)}</p>
              </td>
            </tr>

            <tr>
              <td style="padding: 24px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding-bottom: 14px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7f6d61;">Flavor</td>
                    <td style="padding-bottom: 14px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7f6d61; text-align: center;">Qty</td>
                    <td style="padding-bottom: 14px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7f6d61; text-align: right;">Unit</td>
                    <td style="padding-bottom: 14px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7f6d61; text-align: right;">Amount</td>
                  </tr>
                  ${lineItemsHtml}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 12px 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #6a5a50; font-size: 14px;">Total Items</td>
                    <td style="padding: 6px 0; color: #2c2420; font-size: 14px; text-align: right;">${totalUnits}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0 0; color: #2c2420; font-size: 16px; font-weight: 700;">Subtotal</td>
                    <td style="padding: 10px 0 0; color: #2c2420; font-size: 22px; font-weight: 800; text-align: right;">${invoicePriceFormatter.format(subtotal)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 18px 28px 24px; border-top: 1px solid #f1e6dc; background: #fffaf6;">
                <p style="margin: 0 0 8px; color: #2c2420; font-size: 14px; font-weight: 600;">Next step</p>
                <p style="margin: 0; color: #6a5a50; font-size: 14px; line-height: 1.5;">
                  Confirm availability, then reply to the customer with payment instructions and expected delivery schedule.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim()
}

export const buildInvoice = (items: InvoiceLineItem[], subtotal: number): InvoiceData => {
  const now = new Date()
  const timestamp = now.getTime().toString().slice(-8)
  const invoiceNumber = `FLR-${timestamp}`
  const paymentQrPayload = [
    "FLOUER PAYMENT",
    `Invoice: ${invoiceNumber}`,
    `Amount: ${subtotal.toFixed(2)} PHP`,
    `Pay To: ${PAYMENT_RECEIVER}`,
  ].join("\n")

  return {
    invoiceNumber,
    createdAt: now.toISOString(),
    items,
    subtotal,
    paymentQrPayload,
  }
}

export const readStoredInvoice = (): InvoiceData | null => {
  const raw = sessionStorage.getItem(INVOICE_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as InvoiceData
  } catch {
    sessionStorage.removeItem(INVOICE_STORAGE_KEY)
    return null
  }
}
