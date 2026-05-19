export type InvoiceLineItem = {
  id: string
  flavor: string
  price: number
  quantity: number
  lineTotal: number
}

export type InvoiceData = {
  invoiceNumber: string
  createdAt: string
  items: InvoiceLineItem[]
  subtotal: number
  paymentQrPayload: string
}
