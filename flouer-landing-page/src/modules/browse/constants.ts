import product01Img from "@/assets/product-01.png"
import product02Img from "@/assets/product-02.png"
import product03Img from "@/assets/product-03.png"
import product04Img from "@/assets/product-04.png"
import type { Product } from "@/modules/browse/types"

export const products: Product[] = [
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
