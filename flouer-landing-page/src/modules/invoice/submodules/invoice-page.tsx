import { Button } from "@/components/ui/button"
import bpiQrImg from "@/assets/payment/bpi.png"
import gcashQrImg from "@/assets/payment/gcash.png"
import pnbQrImg from "@/assets/payment/pnb.png"
import type { InvoiceData } from "@/modules/invoice/types"
import { useEffect, useMemo, useState, type ChangeEvent } from "react"

type InvoicePageProps = {
  invoiceData: InvoiceData | null
  onReturnToStore: () => void
  supabaseUrl: string
  supabaseAnonKey: string
}

type PaymentMethodId = "gcash-qr" | "pnb-qr" | "bpi-qr" | "gcash-manual"

type PaymentMethod = {
  id: PaymentMethodId
  label: string
  description: string
  instructions: string
  qrImage?: string
  qrAlt?: string
  manualNumber?: string
}

const paymentMethods: PaymentMethod[] = [
  {
    id: "gcash-qr",
    label: "GCash QR",
    description: "Scan with GCash app",
    instructions: "Open the GCash app, scan this QR, then proceed with payment.",
    qrImage: gcashQrImg,
    qrAlt: "GCash QR code",
  },
  {
    id: "pnb-qr",
    label: "PNB QR",
    description: "Philippine National Bank",
    instructions: "Use your PNB app to scan this QR and complete the transfer.",
    qrImage: pnbQrImg,
    qrAlt: "PNB QR code",
  },
  {
    id: "bpi-qr",
    label: "BPI QR",
    description: "Bank of the Philippine Islands",
    instructions: "Use your BPI app to scan this QR and send your payment.",
    qrImage: bpiQrImg,
    qrAlt: "BPI QR code",
  },
  {
    id: "gcash-manual",
    label: "GCash Number",
    description: "Pay without QR",
    instructions: "Send directly to this GCash number if you cannot scan QR.",
    manualNumber: "09650750735",
  },
]

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MAX_RECEIPT_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const
const PAYMENT_RECEIPTS_BUCKET = "payment-receipts"
const RECEIPT_UPLOAD_SUCCESS_MESSAGE = "Receipt uploaded. We will verify your payment shortly."

const sanitizePathPart = (value: string) => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return normalized.length > 0 ? normalized : "receipt"
}

const buildReceiptObjectPath = (invoiceNumber: string, fileName: string) => {
  const invoiceSegment = sanitizePathPart(invoiceNumber)
  const extensionMatch = fileName.toLowerCase().match(/\.([a-z0-9]{1,12})$/)
  const extension = extensionMatch ? `.${extensionMatch[1]}` : ""
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const randomSuffix = Math.random().toString(36).slice(2, 10)
  return `${invoiceSegment}/${timestamp}-${randomSuffix}${extension}`
}

export function InvoicePage({ invoiceData, onReturnToStore, supabaseUrl, supabaseAnonKey }: InvoicePageProps) {
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<PaymentMethodId>("gcash-qr")
  const [copyFeedback, setCopyFeedback] = useState("")
  const [downloadFeedback, setDownloadFeedback] = useState("")
  const [selectedReceiptFile, setSelectedReceiptFile] = useState<File | null>(null)
  const [receiptUploadFeedback, setReceiptUploadFeedback] = useState("")
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptInputResetKey, setReceiptInputResetKey] = useState(0)

  const createdAtLabel = useMemo(() => {
    if (!invoiceData) return ""
    const createdAt = new Date(invoiceData.createdAt)
    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(createdAt)
  }, [invoiceData])

  const selectedPaymentMethod = useMemo(() => {
    return paymentMethods.find((method) => method.id === selectedPaymentMethodId) ?? paymentMethods[0]
  }, [selectedPaymentMethodId])

  const gcashNumber = useMemo(() => {
    return paymentMethods.find((method) => method.id === "gcash-manual")?.manualNumber ?? ""
  }, [])

  const handleCopyGcashNumber = async () => {
    if (!gcashNumber) {
      setCopyFeedback("GCash number is unavailable.")
      return
    }

    try {
      await navigator.clipboard.writeText(gcashNumber)
      setCopyFeedback("GCash number copied.")
    } catch {
      setCopyFeedback("Unable to copy automatically. Please copy it manually.")
    }
  }

  const handleDownloadQr = async () => {
    if (!selectedPaymentMethod.qrImage) {
      setDownloadFeedback("No QR code available for this payment method.")
      return
    }

    const filename = `${selectedPaymentMethod.id}.png`

    try {
      const response = await fetch(selectedPaymentMethod.qrImage)
      if (!response.ok) throw new Error("Failed to fetch QR image.")
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)

      setDownloadFeedback("QR code download started.")
    } catch {
      window.open(selectedPaymentMethod.qrImage, "_blank", "noopener,noreferrer")
      setDownloadFeedback("Opened QR in a new tab. Save it from there if download is blocked.")
    }
  }

  const handleReceiptFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null

    if (!nextFile) {
      setSelectedReceiptFile(null)
      setReceiptUploadFeedback("")
      return
    }

    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(nextFile.type as (typeof ALLOWED_RECEIPT_MIME_TYPES)[number])) {
      setSelectedReceiptFile(null)
      setReceiptUploadFeedback("Unsupported file type. Please upload JPG, PNG, WEBP, or PDF.")
      return
    }

    if (nextFile.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
      setSelectedReceiptFile(null)
      setReceiptUploadFeedback("File is too large. Maximum allowed size is 10MB.")
      return
    }

    setSelectedReceiptFile(nextFile)
    setReceiptUploadFeedback("")
  }

  const handleUploadReceipt = async () => {
    if (!invoiceData) {
      setReceiptUploadFeedback("Invoice is unavailable. Please return to store and checkout again.")
      return
    }

    if (!selectedReceiptFile) {
      setReceiptUploadFeedback("Please choose a receipt file first.")
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setReceiptUploadFeedback("Upload is unavailable. Missing Supabase configuration.")
      return
    }

    const objectPath = buildReceiptObjectPath(invoiceData.invoiceNumber, selectedReceiptFile.name)
    const normalizedContentType =
      selectedReceiptFile.type && selectedReceiptFile.type.trim().length > 0
        ? selectedReceiptFile.type
        : "application/octet-stream"

    setReceiptUploading(true)
    setReceiptUploadFeedback("")
    let uploadCompleted = false

    try {
      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/${PAYMENT_RECEIPTS_BUCKET}/${objectPath}`,
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": normalizedContentType,
          },
          body: selectedReceiptFile,
        },
      )

      if (!uploadResponse.ok) {
        const uploadError = (await uploadResponse.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null

        const message =
          uploadError?.message ??
          uploadError?.error ??
          `Receipt upload failed with status ${uploadResponse.status}.`

        throw new Error(message)
      }
      uploadCompleted = true

      const verifyResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_sale_payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          p_invoice_number: invoiceData.invoiceNumber,
          p_receipt_file_path: objectPath,
          p_receipt_content_type: normalizedContentType,
          p_receipt_uploaded_by: "user",
        }),
      })

      if (!verifyResponse.ok) {
        const verifyError = (await verifyResponse.json().catch(() => null)) as
          | { message?: string; error?: string; details?: string }
          | null

        const message =
          verifyError?.message ??
          verifyError?.error ??
          verifyError?.details ??
          `Saving receipt metadata failed with status ${verifyResponse.status}.`

        throw new Error(message)
      }

      setSelectedReceiptFile(null)
      setReceiptInputResetKey((previous) => previous + 1)
      setReceiptUploadFeedback(RECEIPT_UPLOAD_SUCCESS_MESSAGE)
    } catch (error) {
      if (uploadCompleted) {
        await fetch(`${supabaseUrl}/storage/v1/object/${PAYMENT_RECEIPTS_BUCKET}/${objectPath}`, {
          method: "DELETE",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        }).catch(() => null)
      }

      if (error instanceof Error && error.message.trim().length > 0) {
        setReceiptUploadFeedback(error.message)
      } else {
        setReceiptUploadFeedback("Unable to upload receipt right now. Please try again.")
      }
    } finally {
      setReceiptUploading(false)
    }
  }

  useEffect(() => {
    setCopyFeedback("")
    setDownloadFeedback("")
  }, [selectedPaymentMethodId])

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8 lg:px-14">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-black/10 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-5">
          <div>
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">Flouer by Jasmine Rose</p>
            <h1 className="mt-2 font-heading text-3xl tracking-tight sm:text-4xl">Invoice</h1>
          </div>
          <Button variant="outline" onClick={onReturnToStore}>
            Back To Store
          </Button>
        </div>

        {!invoiceData ? (
          <div className="py-10">
            <p className="text-sm text-muted-foreground">
              We could not find an active invoice. Please go back to the store and checkout again.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
              <section className="space-y-4 lg:col-span-5">
                <div className="grid gap-2 rounded-2xl border border-black/10 p-4 text-sm sm:grid-cols-2">
                  <p>
                    <span className="block text-xs text-muted-foreground uppercase">Invoice Number</span>
                    <span className="font-semibold">{invoiceData.invoiceNumber}</span>
                  </p>
                  <p>
                    <span className="block text-xs text-muted-foreground uppercase">Created</span>
                    <span className="font-semibold">{createdAtLabel}</span>
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <h2 className="text-sm font-semibold tracking-wide uppercase">Order Items</h2>
                  <div className="mt-3 space-y-3">
                    {invoiceData.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-4 border-b border-black/10 pb-3">
                        <div>
                          <p className="text-sm font-semibold">{item.flavor}</p>
                          <p className="text-xs text-muted-foreground">
                            {priceFormatter.format(item.price)} x {item.quantity}
                          </p>
                        </div>
                        <p className="text-sm font-semibold">{priceFormatter.format(item.lineTotal)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3">
                    <p className="text-sm tracking-wide uppercase">Subtotal</p>
                    <p className="text-base font-semibold">{priceFormatter.format(invoiceData.subtotal)}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-4 lg:col-span-7">
                <div className="rounded-2xl border border-black/10 p-4">
                  <h2 className="text-sm font-semibold tracking-wide uppercase">Choose Payment Method</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Select where you want to send payment: GCash, PNB, BPI, or direct GCash number.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedPaymentMethodId(method.id)}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          selectedPaymentMethod.id === method.id
                            ? "border-black bg-black text-white"
                            : "border-black/10 bg-white hover:border-black/25"
                        }`}
                        aria-pressed={selectedPaymentMethod.id === method.id}
                      >
                        <p className="text-xs font-semibold uppercase">{method.label}</p>
                        <p
                          className={`text-[11px] ${
                            selectedPaymentMethod.id === method.id ? "text-white/80" : "text-muted-foreground"
                          }`}
                        >
                          {method.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  {selectedPaymentMethod.qrImage ? (
                    <div className="space-y-3">
                      <div className="flex justify-center">
                        <img
                          src={selectedPaymentMethod.qrImage}
                          alt={selectedPaymentMethod.qrAlt ?? "Payment QR code"}
                          className="w-full max-w-[320px] rounded-lg border border-black/10 object-contain"
                        />
                      </div>
                      <Button onClick={handleDownloadQr} size="sm" className="w-full sm:w-auto">
                        Download QR Code
                      </Button>
                      {downloadFeedback ? (
                        <p className="text-xs text-muted-foreground">{downloadFeedback}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-black/10 bg-slate-50 p-4">
                      <p className="text-xs text-muted-foreground uppercase">GCash Mobile Number</p>
                      <p className="mt-2 text-2xl font-semibold tracking-wide">{selectedPaymentMethod.manualNumber}</p>
                      <Button onClick={handleCopyGcashNumber} size="sm" className="mt-3 w-full sm:w-auto">
                        Copy GCash Number
                      </Button>
                      {copyFeedback ? (
                        <p className="mt-2 text-xs text-muted-foreground">{copyFeedback}</p>
                      ) : null}
                    </div>
                  )}

                  <p className="mt-4 text-xs text-muted-foreground">{selectedPaymentMethod.instructions}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    After payment, upload your payment receipt below together with your invoice number.
                  </p>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-black/10 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase">Upload Payment Receipt</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Accepted formats: JPG, PNG, WEBP, PDF (max 10MB).
              </p>
              <input
                key={receiptInputResetKey}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleReceiptFileChange}
                className="mt-3 block w-full cursor-pointer rounded-lg border border-black/10 bg-white p-2 text-xs"
              />
              {selectedReceiptFile ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Selected file: <span className="font-medium text-foreground">{selectedReceiptFile.name}</span>
                </p>
              ) : null}
              <Button
                onClick={handleUploadReceipt}
                size="sm"
                className="mt-3 w-full sm:w-auto"
                disabled={receiptUploading || !invoiceData}
              >
                {receiptUploading ? "Uploading..." : "Upload Receipt"}
              </Button>
              {receiptUploadFeedback ? (
                receiptUploadFeedback === RECEIPT_UPLOAD_SUCCESS_MESSAGE ? (
                  <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                    <p className="text-sm font-semibold text-emerald-900">{receiptUploadFeedback}</p>
                    <p className="mt-1 text-xs text-emerald-800">
                      Once payment is confirmed, a confirmation email will be sent to the email address you submitted.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-red-600">{receiptUploadFeedback}</p>
                )
              ) : null}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
