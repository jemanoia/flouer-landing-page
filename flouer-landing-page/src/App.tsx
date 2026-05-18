import product01Img from "@/assets/product-01.png"
import product02Img from "@/assets/product-02.png"
import product03Img from "@/assets/product-03.png"
import product04Img from "@/assets/product-04.png"
import { useCallback, useMemo, useRef, useState, type WheelEvent } from "react"

const products = [
  {
    id: "product-01",
    flavor: "Matcha Cheesecake",
    description:
      "An earthy and vibrant premium grean tea matcha cookie perfectly balanced by a rich, tangy and sweet cream cheese core.",
    image: product01Img,
  },
  {
    id: "product-02",
    flavor: "Biscoff",
    description:
      "A rich, buttery cookie base infused with Lotus Biscoff spread, white chocolate, and crushed biscuit, filled with a Lotus Biscoff spread, and topped with an authentic Lotus Biscoff biscuit for a perfect caramelized crunch.",
    image: product02Img,
  },
  {
    id: "product-03",
    flavor: "Matcha White Chip",
    description:
      "Earthy matcha-infused dough with creamy white chips and roasted nut notes for a smooth, layered flavor profile.",
    image: product03Img,
  },
  {
    id: "product-04",
    flavor: "Red Velvet Cream Chip",
    description:
      "Bold cocoa-red velvet cookie with white chips for a soft, velvety crumb and a creamy finish.",
    image: product04Img,
  },
]

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bannerHidden, setBannerHidden] = useState(false)

  const hideBanner = useCallback(() => {
    setBannerHidden(true)
  }, [])

  const animateTo = useCallback((targetTop: number) => {
    const container = containerRef.current
    if (!container) return

    const startTop = container.scrollTop
    const delta = targetTop - startTop
    const durationMs = 620
    const startTime = performance.now()

    const tick = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      container.scrollTop = startTop + delta * eased
      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  }, [])

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current
    if (!container) return

    const count = products.length
    const normalized = ((index % count) + count) % count
    animateTo(normalized * container.clientHeight)
  }, [animateTo])

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

  const slides = useMemo(
    () =>
      products.map((product, index) => {
        const imageOnLeft = index % 2 === 1
        return (
        <section
          key={product.id}
          className="grid h-screen snap-start items-center gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_0.95fr] lg:gap-10 lg:px-14"
          onClick={() => {
            if (!bannerHidden) {
              hideBanner()
              return
            }
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
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-xl">
              {product.description}
            </p>
            <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
              {index === 0 && !bannerHidden
                ? "First scroll hides the banner"
                : "Scroll down for next product"}
            </p>
          </div>

          <div
            className={`order-1 flex h-full items-center justify-center ${
              imageOnLeft ? "lg:order-1" : "lg:order-2"
            }`}
          >
            <img
              src={product.image}
              alt={product.flavor}
              className="max-h-[66vh] w-full max-w-[760px] object-contain"
            />
          </div>
        </section>
        )
      }),
    [bannerHidden, hideBanner, scrollToIndex],
  )

  return (
    <main className="relative h-screen overflow-hidden bg-background text-foreground">
      <header
        className={`pointer-events-none absolute top-0 left-0 z-20 flex w-full justify-center px-4 pt-6 transition-all duration-700 ease-in-out sm:px-8 sm:pt-8 lg:px-14 lg:pt-10 ${
          bannerHidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="relative w-full max-w-5xl text-black">
          <p className="absolute top-0 left-0 text-xs tracking-[0.25em] uppercase sm:text-sm">
            EST. 2023
          </p>
          <h1 className="font-maharlika text-center text-6xl leading-none tracking-[0.08em] sm:text-7xl lg:text-8xl">
            FLOUER
          </h1>
          <p className="absolute right-0 bottom-0 text-xs tracking-[0.2em] uppercase sm:text-sm">
            BY: JASMINE ROSE
          </p>
        </div>
      </header>

      <div
        ref={containerRef}
        className={`h-screen snap-y snap-mandatory ${
          bannerHidden ? "overflow-y-auto" : "overflow-y-hidden"
        }`}
        onWheelCapture={handleWheelCapture}
      >
        {slides}
      </div>
    </main>
  )
}

export default App
