/**
 * Development seed. Creates a super admin, two tenants with deliberately
 * different branding (to prove nothing is hard-coded), catalogue data and a
 * demo customer.
 *
 * Credentials are printed at the end and documented in README.md. They are
 * development-only and the script refuses to run against production.
 */
import { PrismaClient, ProductStatus, SystemRole, TenantStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? 'platform.localhost';

const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  console.log('Seeding…');

  // --- Plans -----------------------------------------------------------------
  const [starter, growth] = await Promise.all([
    prisma.plan.upsert({
      where: { slug: 'starter' },
      update: {},
      create: {
        name: 'Starter', slug: 'starter',
        priceMonthly: 999, priceYearly: 9990,
        maxProducts: 100, maxStaff: 2, customDomain: false,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'growth' },
      update: {},
      create: {
        name: 'Growth', slug: 'growth',
        priceMonthly: 2999, priceYearly: 29990,
        maxProducts: 5000, maxStaff: 10, customDomain: true,
      },
    }),
  ]);

  // --- Templates -------------------------------------------------------------
  const templateSpecs = [
    { name: 'Fashion', slug: 'fashion', category: 'apparel',
      theme: { primaryColor: '#141414', secondaryColor: '#8A8A8A', headingFont: 'Playfair Display', bodyFont: 'Inter' } },
    { name: 'Electronics', slug: 'electronics', category: 'electronics',
      theme: { primaryColor: '#0B4F9E', secondaryColor: '#0EA5E9', headingFont: 'Inter', bodyFont: 'Inter' } },
    { name: 'Grocery', slug: 'grocery', category: 'grocery',
      theme: { primaryColor: '#1F7A3D', secondaryColor: '#84CC16', headingFont: 'Inter', bodyFont: 'Inter' } },
    { name: 'Furniture', slug: 'furniture', category: 'home',
      theme: { primaryColor: '#6B4423', secondaryColor: '#C9A227', headingFont: 'Fraunces', bodyFont: 'Inter' } },
    { name: 'Cosmetics', slug: 'cosmetics', category: 'beauty',
      theme: { primaryColor: '#B4327A', secondaryColor: '#F4C2D7', headingFont: 'Cormorant', bodyFont: 'Inter' } },
    { name: 'Jewellery', slug: 'jewellery', category: 'luxury',
      theme: { primaryColor: '#8B7355', secondaryColor: '#D4AF37', headingFont: 'Cormorant', bodyFont: 'Inter' } },
    { name: 'Bakery', slug: 'bakery', category: 'food',
      theme: { primaryColor: '#8C4A1E', secondaryColor: '#E8B84B', headingFont: 'Fraunces', bodyFont: 'Inter' } },
    { name: 'General Store', slug: 'general-store', category: 'general',
      theme: { primaryColor: '#111827', secondaryColor: '#6B7280', headingFont: 'Inter', bodyFont: 'Inter' } },
  ];

  for (const t of templateSpecs) {
    await prisma.template.upsert({
      where: { slug: t.slug },
      update: { defaultTheme: t.theme },
      create: {
        name: t.name, slug: t.slug, category: t.category,
        description: `${t.name} storefront layout`,
        defaultTheme: t.theme,
        layoutConfig: { sections: ['hero', 'featured', 'categories', 'newArrivals', 'newsletter'] },
      },
    });
  }

  // --- Super admin -----------------------------------------------------------
  await prisma.user.upsert({
    where: { email: 'admin@platform.localhost' },
    update: {},
    create: {
      email: 'admin@platform.localhost',
      passwordHash: await hash('SuperAdmin123!'),
      firstName: 'Platform',
      lastName: 'Admin',
      systemRole: SystemRole.SUPER_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  // --- Two tenants with visibly different branding ---------------------------
  await seedTenant({
    slug: 'northwind',
    businessName: 'Northwind Apparel',
    storeName: 'Northwind',
    templateSlug: 'fashion',
    planId: growth.id,
    ownerEmail: 'owner@northwind.localhost',
    products: [
      { name: 'Merino Crew Sweater', sku: 'NW-SWT-001', price: 4800, stock: 40, featured: true },
      { name: 'Selvedge Denim Jacket', sku: 'NW-JKT-002', price: 8900, stock: 18, featured: true },
      { name: 'Oxford Shirt', sku: 'NW-SHT-003', price: 3200, stock: 65 },
      { name: 'Wool Scarf', sku: 'NW-ACC-004', price: 1900, stock: 120 },
    ],
    categories: ['Knitwear', 'Outerwear', 'Shirts', 'Accessories'],
  });

  await seedTenant({
    slug: 'voltway',
    businessName: 'Voltway Electronics',
    storeName: 'Voltway',
    templateSlug: 'electronics',
    planId: starter.id,
    ownerEmail: 'owner@voltway.localhost',
    products: [
      { name: 'Mechanical Keyboard TKL', sku: 'VW-KBD-001', price: 7200, stock: 30, featured: true },
      { name: 'USB-C Dock 11-in-1', sku: 'VW-DCK-002', price: 5400, stock: 55, featured: true },
      { name: '4K Monitor 27"', sku: 'VW-MON-003', price: 24900, stock: 12 },
      { name: 'Noise Cancelling Earbuds', sku: 'VW-AUD-004', price: 6900, stock: 80 },
    ],
    categories: ['Peripherals', 'Displays', 'Audio', 'Accessories'],
  });

  console.log(`
Seed complete.

  Super admin   admin@platform.localhost / SuperAdmin123!
  Northwind     owner@northwind.localhost / OwnerPass123!   http://northwind.${PLATFORM_DOMAIN}:5173
  Voltway       owner@voltway.localhost   / OwnerPass123!   http://voltway.${PLATFORM_DOMAIN}:5173
  Demo customer shopper@example.com       / Shopper123!     (exists separately in each store)
  Demo coupon   WELCOME10                 10% off over 1000, capped at 700
  Demo banner   Announcement strip        text only; add a hero image from Admin > Banners
`);
}

interface TenantSpec {
  slug: string;
  businessName: string;
  storeName: string;
  templateSlug: string;
  planId: string;
  ownerEmail: string;
  categories: string[];
  products: { name: string; sku: string; price: number; stock: number; featured?: boolean }[];
}

async function seedTenant(spec: TenantSpec): Promise<void> {
  const existing = await prisma.tenant.findUnique({ where: { slug: spec.slug } });
  if (existing) {
    console.log(`  ${spec.slug} already seeded, skipping`);
    return;
  }

  const template = await prisma.template.findUniqueOrThrow({ where: { slug: spec.templateSlug } });

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        businessName: spec.businessName,
        slug: spec.slug,
        contactEmail: spec.ownerEmail,
        status: TenantStatus.ACTIVE,
        businessCategory: template.category,
      },
    });

    const store = await tx.store.create({
      data: {
        tenantId: tenant.id,
        templateId: template.id,
        name: spec.storeName,
        slug: spec.slug,
        email: spec.ownerEmail,
        description: `${spec.businessName} — official store`,
        isPublished: true,
        metaTitle: spec.storeName,
        metaDescription: `Shop ${spec.businessName} online.`,
      },
    });

    await tx.theme.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        ...(template.defaultTheme as Record<string, unknown>),
        homepageLayout: (template.layoutConfig as any)?.sections ?? [],
      },
    });

    await tx.domain.create({
      data: {
        tenantId: tenant.id,
        hostname: `${spec.slug}.${PLATFORM_DOMAIN}`,
        isPlatform: true, isPrimary: true,
        status: 'ACTIVE', verifiedAt: new Date(),
      },
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: spec.planId,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const owner = await tx.user.create({
      data: {
        email: spec.ownerEmail,
        passwordHash: await hash('OwnerPass123!'),
        firstName: spec.storeName,
        lastName: 'Owner',
        systemRole: SystemRole.TENANT_OWNER,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.tenantUser.create({
      data: { tenantId: tenant.id, userId: owner.id, role: SystemRole.TENANT_OWNER },
    });

    const categories = await Promise.all(
      spec.categories.map((name, position) =>
        tx.category.create({
          data: {
            tenantId: tenant.id,
            name,
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            position,
          },
        }),
      ),
    );

    for (const [index, p] of spec.products.entries()) {
      await tx.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: categories[index % categories.length].id,
          name: p.name,
          slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          sku: p.sku,
          price: p.price,
          compareAtPrice: Math.round(p.price * 1.25),
          stock: p.stock,
          status: ProductStatus.ACTIVE,
          isFeatured: p.featured ?? false,
          shortDescription: `${p.name} from ${spec.businessName}.`,
          description: `${p.name}. Seeded demo product for ${spec.businessName}.`,
          taxRate: 18,
        },
      });
    }

    // Same email in both stores, on purpose — proves customers are scoped.
    await tx.customer.create({
      data: {
        tenantId: tenant.id,
        email: 'shopper@example.com',
        passwordHash: await hash('Shopper123!'),
        firstName: 'Demo',
        lastName: 'Shopper',
      },
    });

    // Without a delivery zone the storefront has nothing to offer at checkout,
    // so a freshly seeded store would look broken rather than empty.
    const domestic = await tx.shippingZone.create({
      data: { tenantId: tenant.id, name: 'India', countries: ['IN'] },
    });

    await tx.shippingMethod.createMany({
      data: [
        {
          tenantId: tenant.id,
          zoneId: domestic.id,
          name: 'Standard',
          baseRate: 60,
          freeAboveAmount: 5000,
          codAvailable: true,
          codFee: 25,
          minDeliveryDays: 3,
          maxDeliveryDays: 6,
        },
        {
          tenantId: tenant.id,
          zoneId: domestic.id,
          name: 'Express',
          baseRate: 180,
          codAvailable: false,
          minDeliveryDays: 1,
          maxDeliveryDays: 2,
        },
      ],
    });

    await tx.coupon.create({
      data: {
        tenantId: tenant.id,
        code: 'WELCOME10',
        description: '10% off your first order',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 1000,
        maxDiscountAmount: 700,
        usageLimit: 100,
      },
    });

    /**
     * A text-only announcement, and no hero image.
     *
     * The strip needs no artwork, so it demonstrates the feature without this
     * script inventing an image URL — a seeded hero pointing at a stock photo
     * on someone else's CDN is a broken image the first time that link rots,
     * and rule 5 says demo data does not get hard-coded into the product.
     */
    await tx.banner.create({
      data: {
        tenantId: tenant.id,
        placement: 'SITE_ANNOUNCEMENT',
        title: 'Free delivery on orders over ₹1,000',
        subtitle: 'Use WELCOME10 for 10% off your first order',
        linkUrl: '/shop',
        position: 0,
      },
    });
  });

  console.log(`  seeded ${spec.slug}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
