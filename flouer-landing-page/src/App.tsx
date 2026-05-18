import { Button } from "@/components/ui/button"
import product01Img from "@/assets/product-01.png"
import product02Img from "@/assets/product-02.png"
import product03Img from "@/assets/product-03.png"
import product04Img from "@/assets/product-04.png"
import { useCallback, useMemo, useRef, useState, type WheelEvent } from "react"

type Product = {
  id: string
  flavor: string
  description: string
  image: string
  price: number
}

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

const ORDER_EMAIL = "orders@flouer.com"
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

  const browseMenu = useCallback(() => {
    if (!bannerHidden) {
      hideBanner()
      const container = containerRef.current
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" })
      }
      return
    }
    scrollToIndex(0)
  }, [bannerHidden, hideBanner, scrollToIndex])

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

  const cartItems = useMemo(() => {
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

  const checkoutHref = useMemo(() => {
    if (cartItems.length === 0) return ""

    const orderLines = cartItems.map(
      (item) => `- ${item.flavor} x${item.quantity} (${priceFormatter.format(item.lineTotal)})`,
    )

    const mailBody = [
      "Hi Flouer team,",
      "",
      "I would like to place an order:",
      ...orderLines,
      "",
      `Subtotal: ${priceFormatter.format(subtotal)}`,
      "",
      "Please confirm availability and payment instructions.",
    ].join("\n")

    return `mailto:${ORDER_EMAIL}?subject=${encodeURIComponent("Flouer Cookie Order")}&body=${encodeURIComponent(mailBody)}`
  }, [cartItems, subtotal])

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

  return (
    <main className="relative h-screen overflow-hidden bg-background text-foreground">
      <nav className="absolute top-0 left-0 z-30 w-full px-4 pt-8 sm:px-8 sm:pt-10 lg:px-14 lg:pt-12">
        <div className="relative mx-auto flex w-full max-w-6xl items-center rounded-full border border-black/10 bg-white/85 px-4 py-3 backdrop-blur sm:px-5 sm:py-3.5">
          <div className="flex flex-1 items-center">
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

          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex">
            <Button variant="ghost" onClick={showBanner}>
              Home
            </Button>
            <Button variant="ghost" onClick={browseMenu}>
              Menu
            </Button>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <Button variant="outline" onClick={browseMenu}>
              Browse
            </Button>
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

          <a
            href={checkoutHref || undefined}
            className={`inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              cartItems.length > 0
                ? "bg-black text-white hover:bg-black/85"
                : "pointer-events-none bg-black/20 text-black/50"
            }`}
          >
            Checkout
          </a>
          <p className="text-xs text-muted-foreground">
            Checkout sends your order details to {ORDER_EMAIL}.
          </p>
        </div>
      </aside>
    </main>
  )
}

export default App
