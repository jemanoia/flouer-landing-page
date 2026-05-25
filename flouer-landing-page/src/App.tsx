import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  buildInvoice,
  buildOrderEmailHtml,
  INVOICE_STORAGE_KEY,
  InvoicePage,
  readStoredInvoice,
  type CheckoutCustomerInfo,
  type InvoiceData,
} from "@/modules/invoice"
import { BrowsePage, products, type Product } from "@/modules/browse"
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react"

type CartItem = Product & {
  quantity: number
  lineTotal: number
}

type ViewMode = "storefront" | "browse" | "invoice"
type CheckoutStep = "notice" | "location" | "details"

const ORDER_EMAIL = "skwakadood@gmail.com"
const MOBILE_BREAKPOINT = "(max-width: 767px)"
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/
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
const PICKUP_LOCATION_LABEL =
  "Villar's Residence, Phase 3 Cluster, Legarda St., Mabuhay City Subdivision, Brgy. Mamatid, Cabuyao, Laguna"
const PICKUP_LOCATION_QUERY = encodeURIComponent(PICKUP_LOCATION_LABEL)
const PICKUP_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${PICKUP_LOCATION_QUERY}`
const PICKUP_MAP_EMBED_URL = `https://www.google.com/maps?q=${PICKUP_LOCATION_QUERY}&z=16&output=embed`

const emptyCustomerInfo: CheckoutCustomerInfo = {
  firstName: "",
  middleName: "",
  lastName: "",
  address: "",
  email: "",
  phoneNumber: "",
}

const resolveViewModeFromHash = (): ViewMode => {
  if (window.location.hash === "#invoice") return "invoice"
  if (window.location.hash === "#browse") return "browse"
  return "storefront"
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_BREAKPOINT).matches)
  const [mobileCarouselApi, setMobileCarouselApi] = useState<CarouselApi>()
  const [bannerHidden, setBannerHidden] = useState(() => window.matchMedia(MOBILE_BREAKPOINT).matches)
  const [activeIndex, setActiveIndex] = useState(0)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("notice")
  const [cartVerified, setCartVerified] = useState(false)
  const [checkoutCustomerInfo, setCheckoutCustomerInfo] =
    useState<CheckoutCustomerInfo>(emptyCustomerInfo)
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>(() => resolveViewModeFromHash())
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)

  const hideBanner = useCallback(() => {
    setBannerHidden(true)
  }, [])

  const showBanner = useCallback(() => {
    if (viewMode !== "storefront") {
      window.location.hash = ""
      setViewMode("storefront")
    }
    if (isMobile) {
      mobileCarouselApi?.scrollTo(0)
    } else {
      setBannerHidden(false)
    }
    setActiveIndex(0)
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: 0, behavior: "smooth" })
  }, [isMobile, mobileCarouselApi, viewMode])

  const openBrowse = useCallback(() => {
    window.location.hash = "#browse"
    setViewMode("browse")
  }, [])

  const scrollToIndex = useCallback(
    (index: number) => {
      if (isMobile) {
        mobileCarouselApi?.scrollTo(index)
        setActiveIndex(index)
        return
      }

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
    [activeIndex, isMobile, mobileCarouselApi],
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
      if (isMobile) return
      if (bannerHidden) return
      if (Math.abs(event.deltaY) < 2) return
      event.preventDefault()
      hideBanner()
      const container = containerRef.current
      if (container) {
        container.scrollTop = 0
      }
    },
    [bannerHidden, hideBanner, isMobile],
  )

  const handleScroll = useCallback(() => {
    if (isMobile) return
    if (!bannerHidden) return
    const container = containerRef.current
    if (!container) return
    const raw = container.scrollTop / container.clientHeight
    const maxIndex = products.length - 1
    const clamped = Math.max(0, Math.min(Math.round(raw), maxIndex))
    if (clamped !== activeIndex) {
      setActiveIndex(clamped)
    }
  }, [activeIndex, bannerHidden, isMobile])

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
      setViewMode(resolveViewModeFromHash())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => {
      window.removeEventListener("hashchange", handleHashChange)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)
    const syncViewportMode = () => {
      const mobile = mediaQuery.matches
      setIsMobile(mobile)
      setBannerHidden(mobile)
      setActiveIndex(0)
      const container = containerRef.current
      if (container) {
        container.scrollTo({ top: 0 })
      }
    }

    syncViewportMode()
    mediaQuery.addEventListener("change", syncViewportMode)
    return () => {
      mediaQuery.removeEventListener("change", syncViewportMode)
    }
  }, [])

  useEffect(() => {
    if (!isMobile || !mobileCarouselApi) return

    const syncActiveSlide = () => {
      setActiveIndex(mobileCarouselApi.selectedScrollSnap())
    }

    syncActiveSlide()
    mobileCarouselApi.on("select", syncActiveSlide)
    mobileCarouselApi.on("reInit", syncActiveSlide)

    return () => {
      mobileCarouselApi.off("select", syncActiveSlide)
      mobileCarouselApi.off("reInit", syncActiveSlide)
    }
  }, [isMobile, mobileCarouselApi])

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
    setCheckoutStep("notice")
    setCheckoutConfirmOpen(true)
  }, [cartItems.length])

  const handleCheckoutConfirmOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (checkoutSubmitting && !nextOpen) return
      if (!nextOpen) {
        setCheckoutError("")
        setCheckoutStep("notice")
      }
      setCheckoutConfirmOpen(nextOpen)
    },
    [checkoutSubmitting],
  )

  const updateCheckoutCustomerInfo = useCallback(
    (key: keyof CheckoutCustomerInfo, value: string) => {
      setCheckoutError("")
      setCheckoutCustomerInfo((previous) => ({
        ...previous,
        [key]: value,
      }))
    },
    [],
  )

  const buildValidatedCustomerInfo = useCallback(() => {
    const normalized: CheckoutCustomerInfo = {
      firstName: checkoutCustomerInfo.firstName.trim(),
      middleName: checkoutCustomerInfo.middleName.trim(),
      lastName: checkoutCustomerInfo.lastName.trim(),
      address: checkoutCustomerInfo.address.trim(),
      email: checkoutCustomerInfo.email.trim().toLowerCase(),
      phoneNumber: checkoutCustomerInfo.phoneNumber.trim(),
    }

    if (!normalized.firstName) {
      throw new Error("First name is required.")
    }

    if (!normalized.lastName) {
      throw new Error("Last name is required.")
    }

    if (!normalized.address) {
      throw new Error("Address is required.")
    }

    if (!normalized.email) {
      throw new Error("Email address is required.")
    }

    if (!EMAIL_REGEX.test(normalized.email)) {
      throw new Error("Please provide a valid email address.")
    }

    if (!normalized.phoneNumber) {
      throw new Error("Mobile number is required.")
    }

    if (!PHONE_REGEX.test(normalized.phoneNumber)) {
      throw new Error("Please provide a valid mobile number.")
    }

    return normalized
  }, [checkoutCustomerInfo])

  const proceedToCheckout = useCallback(async () => {
    if (!cartVerified || cartItems.length === 0 || checkoutSubmitting) return
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setCheckoutError("Checkout is unavailable. Missing Supabase client configuration.")
      return
    }

    let validatedCustomerInfo: CheckoutCustomerInfo
    try {
      validatedCustomerInfo = buildValidatedCustomerInfo()
    } catch (error) {
      if (error instanceof Error && error.message.trim().length > 0) {
        setCheckoutError(error.message)
      } else {
        setCheckoutError("Please complete your contact details before checkout.")
      }
      return
    }

    const nextInvoice = buildInvoice(cartItems, subtotal)
    const salePayload = {
      invoiceNumber: nextInvoice.invoiceNumber,
      createdAt: nextInvoice.createdAt,
      subtotal: nextInvoice.subtotal,
      items: nextInvoice.items,
      customer: validatedCustomerInfo,
    }
    const subject = `Flouer Cookie Order ${nextInvoice.invoiceNumber}`
    const html = buildOrderEmailHtml(
      cartItems,
      subtotal,
      nextInvoice.invoiceNumber,
      validatedCustomerInfo,
    )

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
          sale: salePayload,
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

      // Temporary safety net: directly persist the sales record while remote Edge Function
      // deployment may still be on an older email-only version.
      const persistResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_sale_and_adjust_inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_invoice_number: salePayload.invoiceNumber,
          p_invoice_created_at: salePayload.createdAt,
          p_checkout_subtotal: salePayload.subtotal,
          p_line_items: salePayload.items,
          p_customer_first_name: salePayload.customer.firstName,
          p_customer_middle_name: salePayload.customer.middleName || null,
          p_customer_last_name: salePayload.customer.lastName,
          p_customer_address: salePayload.customer.address,
          p_customer_email: salePayload.customer.email,
          p_customer_phone: salePayload.customer.phoneNumber,
        }),
      })

      if (!persistResponse.ok) {
        const payload = (await persistResponse.json().catch(() => null)) as
          | { message?: string; error?: string; details?: string }
          | null

        const message =
          payload?.message ??
          payload?.error ??
          payload?.details ??
          `Saving sales record failed with status ${persistResponse.status}.`

        throw new Error(message)
      }

      sessionStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(nextInvoice))
      setInvoiceData(nextInvoice)
      window.location.hash = "#invoice"

      setCart({})
      setCartOpen(false)
      setCheckoutConfirmOpen(false)
      setCheckoutCustomerInfo(emptyCustomerInfo)
      setCartVerified(false)
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
  }, [buildValidatedCustomerInfo, cartItems, cartVerified, checkoutSubmitting, subtotal])

  const continueEditingCart = useCallback(() => {
    handleCheckoutConfirmOpenChange(false)
  }, [handleCheckoutConfirmOpenChange])

  const continueToPickupLocation = useCallback(() => {
    setCheckoutError("")
    setCheckoutStep("location")
  }, [])

  const continueToCheckoutDetails = useCallback(() => {
    setCheckoutError("")
    setCheckoutStep("details")
  }, [])

  const returnToCheckoutNotice = useCallback(() => {
    setCheckoutError("")
    setCheckoutStep("notice")
  }, [])

  const returnToPickupLocation = useCallback(() => {
    setCheckoutError("")
    setCheckoutStep("location")
  }, [])

  const returnToStore = useCallback(() => {
    window.location.hash = ""
    setViewMode("storefront")
  }, [])

  const desktopSlides = useMemo(
    () =>
      products.map((product, index) => {
        const imageOnLeft = index % 2 === 1
        return (
          <section
            key={product.id}
            className="grid h-[100dvh] snap-start items-center gap-5 px-4 pb-6 pt-28 sm:px-8 sm:pt-30 md:grid-cols-[1fr_0.95fr] md:gap-6 md:pb-8 md:pt-28 lg:gap-10 lg:px-14"
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
                imageOnLeft ? "md:order-2" : "md:order-1"
              }`}
            >
              <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
                Product {index + 1} / {products.length}
              </p>
              <h1 className="font-heading text-3xl leading-tight tracking-tight sm:text-4xl md:text-4xl lg:text-6xl">
                {product.flavor}
              </h1>
              <p className="text-base font-semibold tracking-wide sm:text-lg">
                {priceFormatter.format(product.price)}
              </p>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base md:text-base lg:text-xl">
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
                imageOnLeft ? "md:order-1" : "md:order-2"
              }`}
            >
              <img
                src={product.image}
                alt={product.flavor}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="max-h-[34vh] w-full max-w-[760px] object-contain sm:max-h-[42vh] md:max-h-[46vh] lg:max-h-[62vh]"
              />
            </div>
          </section>
        )
      }),
    [addToCart, bannerHidden, hideBanner, scrollToIndex],
  )

  const mobileSlides = useMemo(
    () =>
      products.map((product, index) => (
        <CarouselItem
          key={product.id}
          className="pt-0"
        >
          <section className="grid h-[100dvh] items-center gap-4 px-4 pb-6 pt-28">
            <div className="order-1 flex h-full items-center justify-center">
              <img
                src={product.image}
                alt={product.flavor}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="max-h-[34vh] w-full max-w-[760px] object-contain"
              />
            </div>

            <div className="order-2 flex flex-col justify-center gap-4">
              <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
                Product {index + 1} / {products.length}
              </p>
              <h1 className="font-heading text-3xl leading-tight tracking-tight">{product.flavor}</h1>
              <p className="text-base font-semibold tracking-wide">{priceFormatter.format(product.price)}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    addToCart(product.id)
                    setCartOpen(true)
                  }}
                  size="lg"
                  className="w-full"
                >
                  Add To Cart
                </Button>
              </div>
            </div>
          </section>
        </CarouselItem>
      )),
    [addToCart],
  )

  if (viewMode === "invoice") {
    return (
      <InvoicePage
        invoiceData={invoiceData}
        onReturnToStore={returnToStore}
        supabaseUrl={SUPABASE_URL}
        supabaseAnonKey={SUPABASE_ANON_KEY}
      />
    )
  }

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-background text-foreground">
      <nav className="absolute top-0 left-0 z-30 w-full px-3 pt-3 sm:px-8 sm:pt-10 lg:px-14 lg:pt-12">
        {isMobile ? (
          <div className="relative mx-auto w-full max-w-6xl rounded-2xl border border-black/10 bg-white/90 px-3 py-2 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={showBanner}
                className="h-8 px-3 text-xs"
              >
                Home
              </Button>
              <Button
                variant={viewMode === "browse" ? "default" : "ghost"}
                onClick={openBrowse}
                className="h-8 px-3 text-xs"
              >
                Browse
              </Button>
              <Button
                onClick={() => setCartOpen(true)}
                className="h-8 px-3 text-xs"
              >
                Buy ({cartCount})
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-center">
              <button
                type="button"
                className="font-maharlika text-base tracking-[0.08em]"
                onClick={showBanner}
              >
                FLOUER
              </button>
            </div>
          </div>
        ) : (
          <div className="relative mx-auto flex w-full max-w-6xl items-center rounded-full border border-black/10 bg-white/85 px-5 py-3.5 backdrop-blur">
            <div className="flex flex-1 items-center justify-start gap-2">
              <Button variant="ghost" onClick={showBanner}>
                Home
              </Button>
              <Button variant={viewMode === "browse" ? "default" : "ghost"} onClick={openBrowse}>
                Browse
              </Button>
            </div>

            <div className="flex items-center justify-center">
              <button
                type="button"
                className="flex items-center gap-3"
                onClick={showBanner}
              >
                <span className="hidden text-xs tracking-[0.2em] uppercase lg:inline">EST. 2023</span>
                <span className="font-maharlika text-xl tracking-[0.08em]">FLOUER</span>
                <span className="hidden text-xs tracking-[0.2em] uppercase lg:inline">BY: JASMINE ROSE</span>
              </button>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <Button onClick={() => setCartOpen(true)}>Buy ({cartCount})</Button>
            </div>
          </div>
        )}
      </nav>

      {viewMode === "browse" ? (
        <BrowsePage
          products={products}
          cartQuantities={cart}
          onAddToCart={addToCart}
          onOpenCart={() => setCartOpen(true)}
        />
      ) : isMobile ? (
        <Carousel
          orientation="vertical"
          opts={{ align: "start", loop: false }}
          setApi={setMobileCarouselApi}
          className="h-full [&_[data-slot=carousel-content]]:h-full"
        >
          <CarouselContent className="mt-0 h-full">
            {mobileSlides}
          </CarouselContent>
        </Carousel>
      ) : (
        <div
          ref={containerRef}
          className={`h-full snap-y snap-mandatory ${
            bannerHidden ? "overflow-y-auto" : "overflow-y-hidden"
          } scroll-smooth`}
          onWheelCapture={handleWheelCapture}
          onScroll={handleScroll}
        >
          {desktopSlides}
        </div>
      )}

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

      <Drawer open={checkoutConfirmOpen} onOpenChange={handleCheckoutConfirmOpenChange}>
        <DrawerContent className="z-[60] h-[92dvh] border-x border-t border-black/10 bg-white shadow-2xl data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
          <DrawerHeader className="border-b border-black/10 px-4 pb-4 pt-3 text-left sm:px-6">
            <div className="mx-auto w-full max-w-6xl">
              <DrawerTitle className="text-lg font-semibold">Confirm Your Cart</DrawerTitle>
              <DrawerDescription className="mt-2 max-w-3xl text-sm">
                {checkoutStep === "notice"
                  ? "Please read the ordering and delivery information first before continuing."
                  : checkoutStep === "location"
                    ? "Review the pickup location on Google Maps before proceeding to your order summary and customer details."
                    : "Review your order summary and provide your customer details before submitting checkout."}
              </DrawerDescription>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto">
            {checkoutStep === "notice" ? (
              <div className="mx-auto flex min-h-full w-full max-w-5xl items-start px-4 py-6 sm:px-6 lg:items-center lg:py-8">
                <section className="w-full rounded-[28px] border border-black/10 bg-white shadow-sm">
                  <div className="border-b border-black/10 px-5 py-5 sm:px-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      Step 1 of 3
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      Please Read Carefully Before Ordering
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                      Review these ordering and delivery rules first. Once you are done, continue to the next step
                      to view the pickup location on Google Maps.
                    </p>
                  </div>

                  <div className="grid gap-4 p-5 sm:p-8 lg:grid-cols-2">
                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                          Important Details
                        </span>
                      </div>
                      <ul className="mt-5 grid gap-3 text-sm leading-relaxed text-amber-950 sm:text-[15px]">
                        <li>
                          <span className="font-semibold">On-Hand Items:</span> Very limited stocks are available
                          and ready to ship immediately. No need to order 2 days in advance.
                        </li>
                        <li>
                          <span className="font-semibold">Made-to-Order:</span> Once on-hand stocks run out, your
                          orders will be baked completely fresh.
                        </li>
                        <li>
                          <span className="font-semibold">Lead Time:</span> For fresh batches, please place your
                          orders at least 2 days in advance of your preferred pickup or delivery date.
                        </li>
                        <li>
                          <span className="font-semibold">Freshness Guaranteed:</span> We strictly bake to order
                          to ensure you get the best quality product.
                        </li>
                        <li>
                          <span className="font-semibold">Pickup Time:</span> Every 11:00 AM PHT.
                        </li>
                      </ul>
                    </section>

                    <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                          Delivery Info
                        </span>
                      </div>
                      <ul className="mt-5 grid gap-3 text-sm leading-relaxed text-sky-950 sm:text-[15px]">
                        <li>
                          <span className="font-semibold">Free Delivery:</span> Exclusive for orders around
                          Mabuhay City Subdivision, specifically Phase 3, 5, and 6.
                        </li>
                        <li>
                          <span className="font-semibold">Outside Areas:</span> Buyers outside these phases may
                          book their own preferred courier such as Grab or Lalamove.
                        </li>
                        <li>
                          <span className="font-semibold">Pick-up Location:</span> Villar&apos;s Residence via
                          Google Maps, {PICKUP_LOCATION_LABEL.replace("Villar's Residence, ", "")}.
                        </li>
                      </ul>
                    </section>
                  </div>
                </section>
              </div>
            ) : checkoutStep === "location" ? (
              <div className="mx-auto flex min-h-full w-full max-w-6xl items-start px-4 py-6 sm:px-6 lg:items-center lg:py-8">
                <section className="w-full rounded-[28px] border border-black/10 bg-white shadow-sm">
                  <div className="border-b border-black/10 px-5 py-5 sm:px-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      Step 2 of 3
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      Pick-Up Location
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                      Check the exact pickup point before moving forward. You can open the location directly in
                      Google Maps if you want turn-by-turn directions.
                    </p>
                  </div>

                  <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
                    <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
                      <span className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                        Google Maps Location
                      </span>
                      <h4 className="mt-5 text-xl font-semibold text-sky-950">Villar&apos;s Residence</h4>
                      <p className="mt-3 text-sm leading-relaxed text-sky-950 sm:text-[15px]">
                        {PICKUP_LOCATION_LABEL}
                      </p>
                      <div className="mt-5 grid gap-3 text-sm leading-relaxed text-sky-950">
                        <p>
                          <span className="font-semibold">Pickup schedule:</span> Every 11:00 AM PHT.
                        </p>
                        <p>
                          <span className="font-semibold">Reminder:</span> Please use this location for self-pickup
                          and for arranging third-party couriers outside the free delivery zones.
                        </p>
                      </div>
                      <a
                        href={PICKUP_MAPS_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-medium text-white transition-colors hover:bg-sky-700"
                      >
                        Open In Google Maps
                      </a>
                    </section>

                    <section className="overflow-hidden rounded-3xl border border-black/10 bg-stone-50 shadow-inner">
                      <iframe
                        title="Pick-up location map"
                        src={PICKUP_MAP_EMBED_URL}
                        className="h-[360px] w-full border-0 sm:h-[420px] lg:h-full lg:min-h-[440px]"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </section>
                  </div>
                </section>
              </div>
            ) : (
              <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(320px,0.44fr)_minmax(0,0.56fr)] lg:items-start">
                <aside className="lg:sticky lg:top-0">
                  <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                          Step 3 of 3
                        </p>
                        <h3 className="mt-3 text-xl font-semibold text-slate-950">Order Summary</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          Double-check quantities and totals before submitting your order.
                        </p>
                      </div>
                      <p className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-slate-900">
                        {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-black/10 bg-stone-50 p-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{item.flavor}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.quantity} x {priceFormatter.format(item.price)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-900">
                            {priceFormatter.format(item.lineTotal)}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4">
                      <span className="text-sm uppercase tracking-[0.18em] text-slate-600">Subtotal</span>
                      <span className="text-lg font-semibold text-slate-950">{priceFormatter.format(subtotal)}</span>
                    </div>
                  </section>
                </aside>

                <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Customer Details
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      Provide your contact information so the order can be confirmed and coordinated correctly.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="text-xs font-medium uppercase">First Name *</span>
                        <input
                          type="text"
                          value={checkoutCustomerInfo.firstName}
                          onChange={(event) => updateCheckoutCustomerInfo("firstName", event.target.value)}
                          className="block h-11 w-full rounded-xl border border-black/15 px-3 text-sm"
                          autoComplete="given-name"
                        />
                      </label>
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="text-xs font-medium uppercase">Middle Name</span>
                        <input
                          type="text"
                          value={checkoutCustomerInfo.middleName}
                          onChange={(event) => updateCheckoutCustomerInfo("middleName", event.target.value)}
                          className="block h-11 w-full rounded-xl border border-black/15 px-3 text-sm"
                          autoComplete="additional-name"
                        />
                      </label>
                    </div>

                    <label className="grid min-w-0 gap-1.5 text-sm">
                      <span className="text-xs font-medium uppercase">Last Name *</span>
                      <input
                        type="text"
                        value={checkoutCustomerInfo.lastName}
                        onChange={(event) => updateCheckoutCustomerInfo("lastName", event.target.value)}
                        className="block h-11 w-full rounded-xl border border-black/15 px-3 text-sm"
                        autoComplete="family-name"
                      />
                    </label>

                    <label className="grid min-w-0 gap-1.5 text-sm">
                      <span className="text-xs font-medium uppercase">Address *</span>
                      <textarea
                        value={checkoutCustomerInfo.address}
                        onChange={(event) => updateCheckoutCustomerInfo("address", event.target.value)}
                        className="block min-h-32 w-full resize-none rounded-xl border border-black/15 px-3 py-3 text-sm"
                        autoComplete="street-address"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="text-xs font-medium uppercase">Email Address *</span>
                        <input
                          type="email"
                          value={checkoutCustomerInfo.email}
                          onChange={(event) => updateCheckoutCustomerInfo("email", event.target.value)}
                          className="block h-11 w-full rounded-xl border border-black/15 px-3 text-sm"
                          autoComplete="email"
                        />
                      </label>
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="text-xs font-medium uppercase">Mobile Number *</span>
                        <input
                          type="tel"
                          value={checkoutCustomerInfo.phoneNumber}
                          onChange={(event) => updateCheckoutCustomerInfo("phoneNumber", event.target.value)}
                          className="block h-11 w-full rounded-xl border border-black/15 px-3 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                    </div>
                  </div>

                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-black/10 bg-stone-50 p-4">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={cartVerified}
                      onChange={(event) => setCartVerified(event.target.checked)}
                    />
                    <span className="text-sm leading-relaxed">
                      I have verified all items, quantities, and customer details in my cart.
                    </span>
                  </label>

                  {checkoutError ? <p className="mt-4 text-sm text-red-600">{checkoutError}</p> : null}
                </section>
              </div>
            )}
          </div>

          <DrawerFooter className="border-t border-black/10 bg-white/95 px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6">
            {checkoutStep === "notice" ? (
              <>
                <Button
                  variant="outline"
                  onClick={continueEditingCart}
                  disabled={checkoutSubmitting}
                  className="w-full sm:w-auto"
                >
                  Continue Editing Cart
                </Button>
                <Button onClick={continueToPickupLocation} className="w-full sm:w-auto">
                  Next: Pickup Location
                </Button>
              </>
            ) : checkoutStep === "location" ? (
              <>
                <Button
                  variant="outline"
                  onClick={returnToCheckoutNotice}
                  disabled={checkoutSubmitting}
                  className="w-full sm:w-auto"
                >
                  Back To Order Info
                </Button>
                <Button onClick={continueToCheckoutDetails} className="w-full sm:w-auto">
                  Next: Order Summary
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={returnToPickupLocation}
                  disabled={checkoutSubmitting}
                  className="w-full sm:w-auto"
                >
                  Back To Pickup Location
                </Button>
                <Button
                  variant="outline"
                  onClick={continueEditingCart}
                  disabled={checkoutSubmitting}
                  className="w-full sm:w-auto"
                >
                  Continue Editing Cart
                </Button>
                <Button
                  onClick={proceedToCheckout}
                  disabled={!cartVerified || checkoutSubmitting}
                  className="w-full sm:w-auto"
                >
                  {checkoutSubmitting ? "Submitting..." : "Proceed To Checkout"}
                </Button>
              </>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  )
}

export default App
