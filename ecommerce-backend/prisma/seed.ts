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
import { templateLook } from '../dist/theme/template-look';

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
  /**
   * The catalogue a new store picks from, and that an existing store can switch
   * to from Appearance.
   *
   * `sections` differs per template on purpose. A template whose only variation
   * is three hex codes is a colour scheme, not a template - a grocery store
   * wants categories above the fold and no editorial hero, while a jeweller
   * wants the opposite. `description` is shown in both pickers, so it says what
   * the layout does rather than restating the name.
   */
  /**
   * `background` and `logoSize` are part of a template's look, not an
   * afterthought: a jeweller on Midnight and a grocer on Wash are recognisably
   * different shops before a single product is added. A store provisioned from
   * a template inherits both, so nobody has to open Appearance to stop their
   * storefront looking like a blank page.
   */
  const templateSpecs = [
    {
      name: 'Fashion', slug: 'fashion', category: 'apparel',
      description: 'Editorial hero, large imagery and a serif display face. For lookbook-led catalogues.',
      theme: { primaryColor: '#141414', secondaryColor: '#8A8A8A', accentColor: '#141414', headingFont: 'Playfair Display', bodyFont: 'Inter', background: 'paper', logoSize: 'lg' },
      sections: ['hero', 'featured', 'newArrivals', 'categories', 'newsletter'],
    },
    {
      name: 'Electronics', slug: 'electronics', category: 'electronics',
      description: 'Specification-first layout with a dense product grid. Categories lead, so shoppers can filter fast.',
      theme: { primaryColor: '#0B4F9E', secondaryColor: '#0EA5E9', accentColor: '#0B4F9E', headingFont: 'Inter', bodyFont: 'Inter', background: 'dots', logoSize: 'md' },
      sections: ['hero', 'categories', 'featured', 'newArrivals'],
    },
    {
      name: 'Grocery', slug: 'grocery', category: 'grocery',
      description: 'Categories above the fold and no editorial hero. Built for repeat baskets, not browsing.',
      theme: { primaryColor: '#1F7A3D', secondaryColor: '#84CC16', accentColor: '#1F7A3D', headingFont: 'Inter', bodyFont: 'Inter', background: 'wash', logoSize: 'md' },
      sections: ['categories', 'featured', 'newArrivals'],
    },
    {
      name: 'Furniture', slug: 'furniture', category: 'home',
      description: 'Room-scale photography with generous spacing. Slow, considered browsing.',
      theme: { primaryColor: '#166534', secondaryColor: '#F5A524', accentColor: '#166534', headingFont: 'Fraunces', bodyFont: 'Inter', background: 'paper', logoSize: 'lg' },
      sections: ['hero', 'categories', 'featured', 'newsletter'],
    },
    {
      name: 'Cosmetics', slug: 'cosmetics', category: 'beauty',
      description: 'Soft palette, new arrivals first. For ranges that turn over quickly.',
      theme: { primaryColor: '#B4327A', secondaryColor: '#F4C2D7', accentColor: '#B4327A', headingFont: 'Cormorant', bodyFont: 'Inter', background: 'aurora', logoSize: 'md' },
      sections: ['hero', 'newArrivals', 'featured', 'categories', 'newsletter'],
    },
    {
      name: 'Jewellery', slug: 'jewellery', category: 'luxury',
      description: 'Quiet, dark-neutral layout with one hero piece. Few products, shown large.',
      theme: { primaryColor: '#8B7355', secondaryColor: '#D4AF37', accentColor: '#A8894F', headingFont: 'Cormorant', bodyFont: 'Inter', background: 'midnight', logoSize: 'lg' },
      sections: ['hero', 'featured', 'newsletter'],
    },
    {
      name: 'Bakery', slug: 'bakery', category: 'food',
      description: 'Warm and short. One hero, a selection for today, and a mailing list.',
      theme: { primaryColor: '#8C4A1E', secondaryColor: '#E8B84B', accentColor: '#8C4A1E', headingFont: 'Fraunces', bodyFont: 'Inter', background: 'paper', logoSize: 'md' },
      sections: ['hero', 'featured', 'newsletter'],
    },
    {
      name: 'Sports', slug: 'sports', category: 'sports',
      description: 'High-contrast, motion-led hero with categories by discipline.',
      theme: { primaryColor: '#0F172A', secondaryColor: '#F97316', accentColor: '#F97316', headingFont: 'Space Grotesk', bodyFont: 'DM Sans', background: 'lines', logoSize: 'md' },
      sections: ['hero', 'categories', 'newArrivals', 'featured'],
    },
    {
      name: 'Books', slug: 'books', category: 'media',
      description: 'Text-forward and calm, organised by section rather than by image.',
      theme: { primaryColor: '#3B2F2F', secondaryColor: '#8A7A6D', accentColor: '#7C4A2D', headingFont: 'Lora', bodyFont: 'Work Sans', background: 'paper', logoSize: 'md' },
      sections: ['categories', 'newArrivals', 'featured', 'newsletter'],
    },
    {
      name: 'Pharmacy', slug: 'pharmacy', category: 'health',
      description: 'Clinical and plain. Categories first, no promotional hero.',
      theme: { primaryColor: '#0E7490', secondaryColor: '#67E8F9', accentColor: '#0E7490', headingFont: 'Inter', bodyFont: 'Inter', background: 'plain', logoSize: 'md' },
      sections: ['categories', 'featured'],
    },
    {
      name: 'Handmade', slug: 'handmade', category: 'craft',
      description: 'Maker-led, with new arrivals leading and a story-length hero.',
      theme: { primaryColor: '#7C5C3E', secondaryColor: '#C4A484', accentColor: '#9C6644', headingFont: 'Fraunces', bodyFont: 'Work Sans', background: 'paper', logoSize: 'md' },
      sections: ['hero', 'newArrivals', 'categories', 'featured', 'newsletter'],
    },
    {
      name: 'Toys', slug: 'toys', category: 'kids',
      description: 'Bright and playful, with categories grouped by age.',
      theme: { primaryColor: '#DB2777', secondaryColor: '#FBBF24', accentColor: '#2563EB', headingFont: 'Poppins', bodyFont: 'Poppins', background: 'aurora', logoSize: 'lg' },
      sections: ['hero', 'categories', 'featured', 'newArrivals'],
    },
    {
      name: 'Minimal', slug: 'minimal', category: 'general',
      description: 'Almost nothing: one grid of products, no hero, no newsletter. A blank slate.',
      theme: { primaryColor: '#111827', secondaryColor: '#6B7280', accentColor: '#111827', headingFont: 'Inter', bodyFont: 'Inter', background: 'plain', logoSize: 'sm' },
      sections: ['featured'],
    },
    {
      name: 'General Store', slug: 'general-store', category: 'general',
      description: 'Every section switched on. The default for a store that has not decided yet.',
      theme: { primaryColor: '#111827', secondaryColor: '#6B7280', accentColor: '#111827', headingFont: 'Inter', bodyFont: 'Inter', background: 'wash', logoSize: 'md' },
      sections: ['hero', 'featured', 'categories', 'newArrivals', 'newsletter'],
    },
  ];

  for (const t of templateSpecs) {
    // `update` carries the copy and the layout too, so re-running the seed
    // brings an existing database up to date instead of only touching new rows.
    const values = {
      name: t.name,
      category: t.category,
      description: t.description,
      defaultTheme: t.theme,
      layoutConfig: { sections: t.sections },
    };

    await prisma.template.upsert({
      where: { slug: t.slug },
      update: values,
      create: { slug: t.slug, ...values },
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
    addressLine1: '14 Residency Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560025',
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
    addressLine1: '9 Linking Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
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
  Payments      Cash on delivery enabled  connect a gateway in Admin > Payments
  Demo banner   Announcement strip        text only; colour and font are set in Admin > Banners
  Invoicing     Store address only        add a GSTIN in Admin > Settings to split tax as CGST/SGST
`);
}

interface TenantSpec {
  slug: string;
  businessName: string;
  storeName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
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

        /**
         * A trading address, because an invoice prints one.
         *
         * Seeded on the store rather than in the invoicing fields on purpose:
         * that is the fallback path, so a fresh install downloads a complete
         * invoice without anyone opening Settings, and filling the invoicing
         * form in then visibly overrides it.
         */
        addressLine1: spec.addressLine1,
        city: spec.city,
        state: spec.state,
        postalCode: spec.postalCode,

        /**
         * The note every product page shows under its own description. Seeded
         * because the field is invisible until it has something in it, and a
         * shopkeeper is unlikely to find a setting whose effect they have never
         * seen.
         */
        productDescription:
          'Delivered in 3-5 working days. Returns accepted within 7 days, unused and in ' +
          'the original packaging. Questions? Reply to your order email.',
      },
    });

    // Same reader the API provisions through, so a seeded store and one created
    // from the console cannot end up with different interpretations of the same
    // template row.
    await tx.theme.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        ...templateLook(template.defaultTheme, template.layoutConfig),
      },
    });

    /**
     * Cash on delivery, switched on.
     *
     * Payment methods are per store and off by default, so without this a
     * seeded store would have a checkout that cannot complete — which reads as
     * a broken build rather than as an unconfigured shop. COD is the one method
     * that needs no credentials, so it is the honest default for demo data.
     *
     * Razorpay is deliberately *not* seeded: it would need a real merchant
     * account, and a fake one that fails at the gateway is worse than an
     * obvious "connect this" in the admin.
     */
    await tx.paymentGateway.create({
      data: {
        tenantId: tenant.id,
        provider: 'COD',
        isEnabled: true,
        label: 'Cash collected on delivery',
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

        /**
         * Deliberately *not* styled.
         *
         * Null on all four means the strip takes the store's brand colour and
         * body font, which is what makes the two seeded shops look different
         * from each other here. Seeding a fixed hex would paint both the same
         * and hide the very thing this demo data exists to show — and the
         * controls in Admin > Banners are then a visible change rather than an
         * adjustment to something already overridden.
         */
      },
    });
  });

  console.log(`  seeded ${spec.slug}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
