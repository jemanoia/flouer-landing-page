import { Button } from "@/components/ui/button"
import {
  buildInvoice,
  buildOrderEmailHtml,
  INVOICE_STORAGE_KEY,
  InvoicePage,
  readStoredInvoice,
  type InvoiceData,
} from "@/modules/invoice"
import product01Img from "@/assets/product-01.png"
import product02Img from "@/assets/product-02.png"
import product03Img from "@/assets/product-03.png"
import product04Img from "@/assets/product-04.png"
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react"

type Product = {
  id: string
  flavor: string
  description: string
  image: string
  price: number
}

type CartItem = Product & {
  quantity: number
  lineTotal: number
}

type ViewMode = "storefront" | "invoice"

const products: Product[] = [
  {
    id: "product-01",
    flavor: "Matcha Cheesecake",
    description:
      "An earthy and vibrant premium grean tea matcha cookie perfectly balanced by a rich, tangy and sweet cream cheese core.",
    image: product01Img,
    price: 55,
  },
  {
    id: "product-02",
    flavor: "Biscoff",
    description:
      "A rich, buttery cookie base infused with Lotus Biscoff spread, white chocolate, and crushed biscuit, filled with a Lotus Biscoff spread, and topped with an authentic Lotus Biscoff biscuit for a perfect caramelized crunch.",
    image: product02Img,
    price: 55,
  },
  {
    id: "product-03",
    flavor: "Red Velvet Cheesecake",
    description:
      "A striking, vibrant red velvet cookie with a soft, cocoa-flavored crumb, featuring a decadent, creamy cheesecake filling hidden inside.",
    image: product03Img,
    price: 55,
  },
  {
    id: "product-04",
    flavor: "Chocolate Chip",
    description:
      "The classic favorite soft and chewy on the inside, golden crisp on the outside, and loaded with premium dark chocolate chips.",
    image: product04Img,
    price: 55,
  },
]

const ORDER_EMAIL = "skwakadood@gmail.com"
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  ""
const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bannerHidden, setBannerHidden] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false)
  const [cartVerified, setCartVerified] = useState(false)
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    window.location.hash === "#invoice" ? "invoice" : "storefront",
  )
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)

  const hideBanner = useCallback(() => {
    setBannerHidden(true)
  }, [])

  const showBanner = useCallback(() => {
    setBannerHidden(false)
    setActiveIndex(0)
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = containerRef.current
      if (!container) return

      const maxIndex = products.length - 1
      const clamped = Math.max(0, Math.min(index, maxIndex))
      if (clamped === activeIndex) return

      container.scrollTo({
        top: clamped * container.clientHeight,
        behavior: "smooth",
      })
      setActiveIndex(clamped)
    },
    [activeIndex],
  )

  const addToCart = useCallback((productId: string) => {
    setCart((previous) => ({
      ...previous,
      [productId]: (previous[productId] ?? 0) + 1,
    }))
  }, [])

  const decreaseItem = useCallback((productId: string) => {
    setCart((previous) => {
      const currentQuantity = previous[productId] ?? 0
      if (currentQuantity <= 1) {
        const updated = { ...previous }
        delete updated[productId]
        return updated
      }
      return {
        ...previous,
        [productId]: currentQuantity - 1,
      }
    })
  }, [])

  const handleWheelCapture = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (bannerHidden) return
      if (Math.abs(event.deltaY) < 2) return
      event.preventDefault()
      hideBanner()
      const container = containerRef.current
      if (container) {
        container.scrollTop = 0
      }
    },
    [bannerHidden, hideBanner],
  )

  const handleScroll = useCallback(() => {
    if (!bannerHidden) return
    const container = containerRef.current
    if (!container) return
    const raw = container.scrollTop / container.clientHeight
    const maxIndex = products.length - 1
    const clamped = Math.max(0, Math.min(Math.round(raw), maxIndex))
    if (clamped !== activeIndex) {
      setActiveIndex(clamped)
    }
  }, [activeIndex, bannerHidden])

  const cartItems = useMemo<CartItem[]>(() => {
    return products
      .map((product) => {
        const quantity = cart[product.id] ?? 0
        return {
          ...product,
          quantity,
          lineTotal: product.price * quantity,
        }
      })
      .filter((item) => item.quantity > 0)
  }, [cart])

  const cartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0)
  }, [cartItems])

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.lineTotal, 0)
  }, [cartItems])

  useEffect(() => {
    const handleHashChange = () => {
      setViewMode(window.location.hash === "#invoice" ? "invoice" : "storefront")
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => {
      window.removeEventListener("hashchange", handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (viewMode !== "invoice") return
    setInvoiceData(readStoredInvoice())
  }, [viewMode])

  useEffect(() => {
    setCartVerified(false)
  }, [cart])

  const openCheckoutConfirmation = useCallback(() => {
    if (cartItems.length === 0) return
    setCheckoutError("")
    setCheckoutConfirmOpen(true)
  }, [cartItems.length])

  const proceedToCheckout = useCallback(async () => {
    if (!cartVerified || cartItems.length === 0 || checkoutSubmitting) return
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setCheckoutError("Checkout is unavailable. Missing Supabase client configuration.")
      return
    }

    const nextInvoice = buildInvoice(cartItems, subtotal)
    const subject = `Flouer Cookie Order ${nextInvoice.invoiceNumber}`
    const html = buildOrderEmailHtml(cartItems, subtotal, nextInvoice.invoiceNumber)

    setCheckoutSubmitting(true)
    setCheckoutError("")

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/resend-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          subject,
          html,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: { message?: string } }
          | null

        const message =
          payload?.details?.message ??
          payload?.error ??
          `Checkout request failed with status ${response.status}.`

        throw new Error(message)
      }

      sessionStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(nextInvoice))
      setInvoiceData(nextInvoice)
      window.location.hash = "#invoice"

      setCart({})
      setCartOpen(false)
      setCheckoutConfirmOpen(false)
    } catch (error) {
      console.error("Failed to invoke resend-email function", error)
      if (error instanceof Error && error.message.trim().length > 0) {
        setCheckoutError(error.message)
      } else {
        setCheckoutError("Unable to submit your order right now. Please try again.")
      }
    } finally {
      setCheckoutSubmitting(false)
    }
  }, [cartItems, cartVerified, checkoutSubmitting, subtotal])

  const continueEditingCart = useCallback(() => {
    setCheckoutConfirmOpen(false)
  }, [])

  const returnToStore = useCallback(() => {
    window.location.hash = ""
    setViewMode("storefront")
  }, [])

  const slides = useMemo(
    () =>
      products.map((product, index) => {
        const imageOnLeft = index % 2 === 1
        return (
          <section
            key={product.id}
            className="grid h-screen snap-start items-center gap-6 px-4 pb-6 pt-30 sm:px-8 lg:grid-cols-[1fr_0.95fr] lg:gap-10 lg:px-14"
            onClick={() => {
              if (!bannerHidden) {
                hideBanner()
                return
              }
              if (index >= products.length - 1) return
              scrollToIndex(index + 1)
            }}
          >
            <div
              className={`order-2 flex flex-col justify-center gap-5 ${
                imageOnLeft ? "lg:order-2" : "lg:order-1"
              }`}
            >
              <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
                Product {index + 1} / {products.length}
              </p>
              <h1 className="font-heading text-4xl leading-tight tracking-tight md:text-6xl">
                {product.flavor}
              </h1>
              <p className="text-lg font-semibold tracking-wide">{priceFormatter.format(product.price)}</p>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-xl">
                {product.description}
              </p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={(event) => {
                    event.stopPropagation()
                    addToCart(product.id)
                    setCartOpen(true)
                  }}
                  size="lg"
                >
                  Add To Cart
                </Button>
              </div>
            </div>

            <div
              className={`order-1 flex h-full items-center justify-center ${
                imageOnLeft ? "lg:order-1" : "lg:order-2"
              }`}
            >
              <img
                src={product.image}
                alt={product.flavor}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="max-h-[62vh] w-full max-w-[760px] object-contain"
              />
            </div>
          </section>
        )
      }),
    [addToCart, bannerHidden, hideBanner, scrollToIndex],
  )

  if (viewMode === "invoice") {
    return (
      <InvoicePage
        invoiceData={invoiceData}
        onReturnToStore={returnToStore}
      />
    )
  }

  return (
    <main className="relative h-screen overflow-hidden bg-background text-foreground">
      <nav className="absolute top-0 left-0 z-30 w-full px-4 pt-8 sm:px-8 sm:pt-10 lg:px-14 lg:pt-12">
        <div className="relative mx-auto flex w-full max-w-6xl items-center rounded-full border border-black/10 bg-white/85 px-4 py-3 backdrop-blur sm:px-5 sm:py-3.5">
          <div className="flex flex-1 items-center justify-start">
            <Button variant="ghost" onClick={showBanner}>
              Home
            </Button>
          </div>

          <div className="flex items-center justify-center">
            <button
              type="button"
              className="flex items-center gap-3"
              onClick={showBanner}
            >
              <span className="text-[10px] tracking-[0.2em] uppercase sm:text-xs">EST. 2023</span>
              <span className="font-maharlika text-xl tracking-[0.08em]">FLOUER</span>
              <span className="text-[10px] tracking-[0.2em] uppercase sm:text-xs">
                BY: JASMINE ROSE
              </span>
            </button>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <Button onClick={() => setCartOpen(true)}>Buy ({cartCount})</Button>
          </div>
        </div>
      </nav>

      <div
        ref={containerRef}
        className={`h-screen snap-y snap-mandatory ${
          bannerHidden ? "overflow-y-auto" : "overflow-y-hidden"
        } scroll-smooth`}
        onWheelCapture={handleWheelCapture}
        onScroll={handleScroll}
      >
        {slides}
      </div>

      {cartOpen ? (
        <button
          type="button"
          aria-label="Close cart overlay"
          className="absolute inset-0 z-40 bg-black/25"
          onClick={() => setCartOpen(false)}
        />
      ) : null}

      <aside
        className={`absolute top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-black/15 bg-white p-5 shadow-2xl transition-transform duration-300 ${
          cartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-wide uppercase">Your Cart</h2>
          <Button variant="ghost" onClick={() => setCartOpen(false)}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {cartItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items in cart yet. Add flavors from the menu.</p>
          ) : (
            cartItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-black/10 p-3">
                <p className="text-sm font-semibold">{item.flavor}</p>
                <p className="text-sm text-muted-foreground">{priceFormatter.format(item.price)} each</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => decreaseItem(item.id)}
                    >
                      -
                    </Button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => addToCart(item.id)}
                    >
                      +
                    </Button>
                  </div>
                  <p className="text-sm font-semibold">{priceFormatter.format(item.lineTotal)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-black/10 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-wide">Subtotal</p>
            <p className="text-base font-semibold">{priceFormatter.format(subtotal)}</p>
          </div>

          <button
            type="button"
            onClick={openCheckoutConfirmation}
            className={`inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              cartItems.length > 0
                ? "bg-black text-white hover:bg-black/85"
                : "pointer-events-none bg-black/20 text-black/50"
            }`}
          >
            Checkout
          </button>
          <p className="text-xs text-muted-foreground">
            Checkout sends your order details to {ORDER_EMAIL} using Supabase Edge Functions.
          </p>
        </div>
      </aside>

      {checkoutConfirmOpen ? (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Confirm Your Cart</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Please review your cart items before checkout. If you still need changes, continue editing to add,
              remove, or update quantities.
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={cartVerified}
                onChange={(event) => setCartVerified(event.target.checked)}
              />
              <span className="text-sm">I have verified all items and quantities in my cart.</span>
            </label>
            {checkoutError ? <p className="mt-3 text-sm text-red-600">{checkoutError}</p> : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={continueEditingCart} disabled={checkoutSubmitting}>
                Continue Editing Cart
              </Button>
              <Button
                onClick={proceedToCheckout}
                disabled={!cartVerified || checkoutSubmitting}
              >
                {checkoutSubmitting ? "Submitting..." : "Proceed To Checkout"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
