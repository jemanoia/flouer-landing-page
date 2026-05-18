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
    flavor: "Red Velvet Cheesecake",
    description:
      "A striking, vibrant red velvet cookie with a soft, cocoa-flavored crumb, featuring a decadent, creamy cheesecake filling hidden inside.",
    image: product03Img,
  },
  {
    id: "product-04",
    flavor: "Chocolate Chip",
    description:
      "The classic favorite soft and chewy on the inside, golden crisp on the outside, and loaded with premium dark chocolate chips.",
    image: product04Img,
  },
]

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bannerHidden, setBannerHidden] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const hideBanner = useCallback(() => {
    setBannerHidden(true)
  }, [])

  const scrollToIndex = useCallback((index: number) => {
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
  }, [activeIndex])

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
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-xl">
              {product.description}
            </p>
            <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
              {index === 0 && !bannerHidden
                ? "First scroll hides the banner"
                : ""}
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
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
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
        } scroll-smooth`}
        onWheelCapture={handleWheelCapture}
        onScroll={handleScroll}
      >
        {slides}
      </div>
    </main>
  )
}

export default App
