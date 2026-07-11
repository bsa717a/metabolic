/**
 * Seeds the store catalog with real products from FlavCity (supplements/protein)
 * and Core Home Fitness (equipment). Prices/images captured 2026-07-11 from the
 * live storefronts. Dry-run by default; pass --apply to write.
 *
 * Run: cd server && npx tsx --env-file=.env scripts/seed-store-products.ts [--apply]
 */
import { PrismaClient, StoreProductCategory } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

type SeedProduct = {
  name: string;
  description: string;
  category: StoreProductCategory;
  priceCents: number;
  imageUrl: string | null;
  sortOrder: number;
};

const PRODUCTS: SeedProduct[] = [
  // --- FlavCity protein ---
  {
    name: 'FlavCity Chocolate Peanut Butter Protein Smoothie',
    description: 'Grass-fed whey protein smoothie mix with real chocolate and peanut butter flavor, 20 servings per bag.',
    category: 'PROTEIN',
    priceCents: 5999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/PDP_Hero_Chocolate-PB_Smoothie.jpg',
    sortOrder: 10
  },
  {
    name: 'FlavCity Cookies & Cream Protein Smoothie',
    description: 'Dessert-inspired grass-fed protein smoothie powder with cookies-and-cream flavor and no refined sugar.',
    category: 'PROTEIN',
    priceCents: 5999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/PDP_Hero_Cookies-Cream_Smoothie.jpg',
    sortOrder: 20
  },
  // --- FlavCity supplements ---
  {
    name: 'FlavCity Strawberry Limeade Electrolyte Mix',
    description: 'Sugar-free strawberry limeade electrolyte drink mix for daily hydration with sodium, potassium, and magnesium.',
    category: 'SUPPLEMENT',
    priceCents: 4499,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/flavcity-strawberry-limeade-electrolyte-mix-1202904595.webp',
    sortOrder: 10
  },
  {
    name: 'FlavCity Fruit Punch Electrolyte Mix',
    description: 'Fruit punch flavored electrolyte hydration mix with clean ingredients and zero added sugar.',
    category: 'SUPPLEMENT',
    priceCents: 4799,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/Electrolyte_Fruit_Punch_FRONT_mockup.png',
    sortOrder: 20
  },
  {
    name: 'FlavCity Lights Out Sleep Support Gummy',
    description: 'Nightly gummy with sleep-supporting ingredients to help you fall asleep and stay asleep.',
    category: 'SUPPLEMENT',
    priceCents: 3999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/Sleep_Gummy_mocap_01_new.png',
    sortOrder: 30
  },
  {
    name: 'FlavCity Triple Threat Supplement (K2 + D3)',
    description: 'Vitamin K2 and D3 combo supplement supporting bone, heart, and immune health.',
    category: 'SUPPLEMENT',
    priceCents: 2999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/flavcity-triple-threat-supplement-1202904581.png',
    sortOrder: 40
  },
  {
    name: 'FlavCity C-Ya Later! Vitamin C',
    description: 'Whole-food vitamin C supplement for daily immune support.',
    category: 'SUPPLEMENT',
    priceCents: 2999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0482/4062/3777/files/flavcity-c-ya-later-vitamin-c-1202904582.png',
    sortOrder: 50
  },
  // --- Core Home Fitness equipment ---
  {
    name: 'Core Home Fitness Adjustable Dumbbell Set',
    description: 'Twist-handle adjustable dumbbell pair going 5-50 lbs in 5 lb increments, replacing 20 dumbbells in one compact set.',
    category: 'EQUIPMENT',
    priceCents: 39999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/products/Dumbells-setoftwo-red-860974.png',
    sortOrder: 10
  },
  {
    name: 'Core Home Fitness Adjustable Dumbbell Stand',
    description: 'Dedicated storage stand that keeps adjustable dumbbells at lifting height for easy access.',
    category: 'EQUIPMENT',
    priceCents: 12999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/files/Web-Corehome-WebsiteImages-1080x920-2_3.jpg',
    sortOrder: 20
  },
  {
    name: 'Core Home Fitness Foldable Adjustable Workout Bench',
    description: 'Space-saving foldable bench with 7-position adjustable backrest and removable leg bar.',
    category: 'EQUIPMENT',
    priceCents: 13999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/products/foldablebench_1.jpg',
    sortOrder: 30
  },
  {
    name: 'Core Home Fitness Multi-Adjustable Bench UB200',
    description: 'Six-position multi-adjustable weight bench with removable leg bar for versatile strength training.',
    category: 'EQUIPMENT',
    priceCents: 19999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/files/Web-Corehome-WebsiteImages-1080x920-7.jpg',
    sortOrder: 40
  },
  {
    name: 'Core Home Fitness MB 1000 All-In-One Home Gym',
    description: 'Compact all-in-one home gym offering 20+ strength exercises with up to 300 lbs of band resistance.',
    category: 'EQUIPMENT',
    priceCents: 25999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/products/CHF_Stills_MB1000-9-222931.jpg',
    sortOrder: 50
  },
  {
    name: 'FightMaster by BoxMaster Boxing Punching Bag System',
    description: 'Free-standing boxing training system with 11 striking pads and reactive rod technology.',
    category: 'EQUIPMENT',
    priceCents: 84999,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/files/FightmasterFrontredoutline.jpg',
    sortOrder: 60
  },
  {
    name: 'Core Home Fitness Knux Premium Hand Weights',
    description: 'Ergonomic hand weights designed to boost punching speed, power, and cardio performance.',
    category: 'EQUIPMENT',
    priceCents: 2499,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0420/9999/8873/files/Web-Corehome-WebsiteImages-1080x920-22.jpg',
    sortOrder: 70
  }
];

async function main() {
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — ${PRODUCTS.length} products`);

  for (const product of PRODUCTS) {
    const existing = await prisma.storeProduct.findFirst({ where: { name: product.name } });
    const action = existing ? 'update' : 'create';
    console.log(`${action}: [${product.category}] ${product.name} — $${(product.priceCents / 100).toFixed(2)}`);
    if (!apply) continue;

    if (existing) {
      await prisma.storeProduct.update({ where: { id: existing.id }, data: { ...product, active: true } });
    } else {
      await prisma.storeProduct.create({ data: product });
    }
  }

  if (!apply) console.log('\nDry run only. Re-run with --apply to write.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
