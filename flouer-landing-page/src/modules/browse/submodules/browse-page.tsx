import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { Product } from "@/modules/browse/types"

type BrowsePageProps = {
  products: Product[]
  cartQuantities: Record<string, number>
  onAddToCart: (productId: string) => void
  onOpenCart: () => void
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function BrowsePage({ products, cartQuantities, onAddToCart, onOpenCart }: BrowsePageProps) {
  return (
    <section className="h-[100dvh] overflow-y-auto px-4 pb-10 pt-24 sm:px-8 sm:pt-32 lg:px-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Flouer Collection</p>
            <h1 className="mt-2 font-heading text-3xl tracking-tight sm:text-4xl">Browse Cookies</h1>
          </div>
          <Button variant="outline" onClick={onOpenCart}>
            Open Cart
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const quantity = cartQuantities[product.id] ?? 0
            return (
              <Card key={product.id} className="overflow-hidden border border-black/10 bg-white">
                <img
                  src={product.image}
                  alt={product.flavor}
                  loading="lazy"
                  decoding="async"
                  className="h-52 w-full object-cover"
                />
                <CardHeader>
                  <CardTitle>{product.flavor}</CardTitle>
                  <CardDescription className="line-clamp-3">{product.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-semibold tracking-wide">{priceFormatter.format(product.price)}</p>
                </CardContent>
                <CardFooter className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">In cart: {quantity}</span>
                  <Button
                    size="sm"
                    onClick={() => onAddToCart(product.id)}
                  >
                    Add To Cart
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
