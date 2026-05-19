export type InvoiceLineItem = {
  id: string
  flavor: string
  price: number
  quantity: number
  lineTotal: number
}

export type CheckoutCustomerInfo = {
  firstName: string
  middleName: string
  lastName: string
  address: string
  email: string
  phoneNumber: string
}

export type InvoiceData = {
  invoiceNumber: string
  createdAt: string
  items: InvoiceLineItem[]
  subtotal: number
  paymentQrPayload: string
}
