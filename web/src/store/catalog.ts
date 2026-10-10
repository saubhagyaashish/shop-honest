export type StoreId = 'a' | 'b'

export type ProductKind = 'earbuds' | 'watch' | 'powerbank' | 'neckband'

export interface Colour {
  id: string
  name: string
  hex: string
}

export interface PricePoint {
  daysAgo: number
  price: number
  mrp: number
}

export interface Product {
  slug: string
  name: string
  brand: string
  kind: ProductKind
  tagline: string
  highlights: string[]
  rating: number
  ratingCount: number
  colours: Colour[]
  pricing: Record<StoreId, { price: number; mrp: number }>
  /** Weekly price observations. Seeds the Price Historian's BigQuery table later. */
  priceHistory?: Record<StoreId, PricePoint[]>
}

export const HERO_SLUG = 'sonicbuds-pro'

export const PROTECTION_PLAN = {
  id: 'protect-1y',
  name: '1-Year Accidental Damage Protection',
  price: 199,
}

export const PLUS_MEMBERSHIP = { name: 'BazaarNest Plus', monthly: 99 }

export const EXPRESS_DELIVERY_PRICE = 79

function weekly(pointFor: (daysAgo: number) => { price: number; mrp: number }): PricePoint[] {
  const points: PricePoint[] = []
  for (let daysAgo = 91; daysAgo >= 0; daysAgo -= 7) points.push({ daysAgo, ...pointFor(daysAgo) })
  return points
}

export const PRODUCTS: Product[] = [
  {
    slug: HERO_SLUG,
    name: 'SonicBuds Pro ANC Wireless Earbuds',
    brand: 'Sonique',
    kind: 'earbuds',
    tagline: 'Active noise cancellation · 40 hr playback · Fast charge',
    highlights: [
      'Hybrid active noise cancellation up to 32 dB',
      '40 hours total playback with the charging case',
      '10 min charge gives 2 hours of music',
      'IPX5 sweat and splash resistant',
      'Bluetooth 5.3 with low-latency game mode',
    ],
    rating: 4.2,
    ratingCount: 18342,
    colours: [
      { id: 'midnight', name: 'Midnight Black', hex: '#1f2937' },
      { id: 'pearl', name: 'Pearl White', hex: '#e7e5e4' },
      { id: 'ocean', name: 'Ocean Blue', hex: '#2563eb' },
    ],
    pricing: {
      a: { price: 1499, mrp: 3999 },
      b: { price: 1499, mrp: 1999 },
    },
    priceHistory: {
      // Sold at ₹1,499–1,599 all quarter; MRP raised from ₹1,999 to ₹3,999 a week ago.
      a: weekly((d) => ({ price: d > 0 && d % 14 === 0 ? 1599 : 1499, mrp: d > 7 ? 1999 : 3999 })),
      // Sold at MRP all quarter; festive sale price started 10 days ago.
      b: weekly((d) => ({ price: d > 10 ? 1999 : 1499, mrp: 1999 })),
    },
  },
  {
    slug: 'pulsefit-2',
    name: 'PulseFit 2 Smartwatch, 1.8" AMOLED',
    brand: 'Pulse',
    kind: 'watch',
    tagline: 'Bluetooth calling · SpO2 · 7-day battery',
    highlights: ['1.8" AMOLED always-on display', 'Bluetooth calling', '100+ sports modes', '7-day battery'],
    rating: 4.0,
    ratingCount: 9210,
    colours: [
      { id: 'graphite', name: 'Graphite', hex: '#374151' },
      { id: 'rose', name: 'Rose Pink', hex: '#f9a8d4' },
    ],
    pricing: { a: { price: 2299, mrp: 5999 }, b: { price: 2299, mrp: 2799 } },
  },
  {
    slug: 'chargecube-10k',
    name: 'ChargeCube 10000 mAh Power Bank, 22.5W',
    brand: 'Voltra',
    kind: 'powerbank',
    tagline: 'Fast charging · Dual output · Pocket size',
    highlights: ['22.5W fast charging', 'USB-C in/out', 'Charges 2 devices at once'],
    rating: 4.3,
    ratingCount: 25110,
    colours: [
      { id: 'slate', name: 'Slate Grey', hex: '#64748b' },
      { id: 'mint', name: 'Mint', hex: '#6ee7b7' },
    ],
    pricing: { a: { price: 899, mrp: 2499 }, b: { price: 899, mrp: 1199 } },
  },
  {
    slug: 'bassloop-neckband',
    name: 'BassLoop Wireless Neckband',
    brand: 'Sonique',
    kind: 'neckband',
    tagline: 'Deep bass · 30 hr playback · Magnetic buds',
    highlights: ['12 mm bass drivers', '30 hours playback', 'Magnetic earbuds'],
    rating: 4.1,
    ratingCount: 14402,
    colours: [
      { id: 'ink', name: 'Ink Black', hex: '#111827' },
      { id: 'teal', name: 'Teal', hex: '#0d9488' },
    ],
    pricing: { a: { price: 799, mrp: 2999 }, b: { price: 799, mrp: 999 } },
  },
]

export function findProduct(slug: string | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug)
}

export function discountPercent(price: number, mrp: number): number {
  return Math.floor((1 - price / mrp) * 100)
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}
