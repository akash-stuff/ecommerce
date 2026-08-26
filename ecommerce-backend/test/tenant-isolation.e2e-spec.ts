import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TenantResolverService } from '../src/tenants/tenant-resolver.service';

/**
 * THE test suite for this platform. Everything else is a feature; this is the
 * promise. Two tenants are provisioned with deliberately colliding data
 * (same product slug, same SKU, same customer email) and every access path is
 * probed from the wrong side.
 *
 * Requires a running database. Run with: npm run test:e2e
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Distinct brand colours: branding is per-tenant data like any other, and a
  // storefront serving the wrong colour is serving the wrong tenant.
  const A = { slug: 'tenant-a', host: 'tenant-a.platform.test', color: '#AA0011' };
  const B = { slug: 'tenant-b', host: 'tenant-b.platform.test', color: '#0011BB' };

  const ids: Record<string, string> = {};
  let tokenA: string;
  let tokenB: string;
  /** A super admin, for the platform routes that no tenant may reach. */
  let superToken: string;
  /** A signed-in shopper at tenant A, for customer-only surfaces. */
  let customerTokenA: string;

  // Tenant-less by definition: the platform console manages every store, so its
  // hostname must resolve to no tenant at all.
  const PLATFORM_HOST = 'localhost';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .compile();

    app = moduleRef.createNestApplication();
    // The same configuration production uses, not a second copy of it.
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await seedTwoTenants();
  });

  /** Everything this suite creates, removable in any order. */
  async function clearFixtures() {
    await prisma.runUnscoped(async (db) => {
      // Audit rows outlive their tenant by design (SetNull on delete), so they
      // go first while the ids are still resolvable.
      await db.auditLog.deleteMany({
        where: { user: { email: 'platform-e2e@example.test' } },
      });
      // Templates the template test creates. It removes its own, but an
      // interrupted run leaves them behind and the unique slug then fails the
      // next run on setup rather than on anything it was testing.
      await db.store.updateMany({
        where: { template: { slug: { in: ['e2e-template', 'e2e-spare'] } } },
        data: { templateId: null },
      });
      await db.template.deleteMany({
        where: { slug: { in: ['e2e-template', 'e2e-spare'] } },
      });
      await db.tenant.deleteMany({
        where: {
          OR: [
            { slug: { in: [A.slug, B.slug] } },
            // Tenants the provisioning test creates. It deletes its own, but an
            // interrupted run leaves them behind and they accumulate.
            { slug: { startsWith: 'audit-created-' } },
          ],
        },
      });
      await db.user.deleteMany({
        where: {
          email: {
            in: [
              `owner@${A.slug}.test`,
              `owner@${B.slug}.test`,
              'platform-e2e@example.test',
            ],
          },
        },
      });
    });
  }

  afterAll(async () => {
    await clearFixtures();
    // The hostname->tenant cache outlives the data. Leaving it populated makes
    // the next run resolve these hosts to tenants that no longer exist.
    await app.get(TenantResolverService).invalidate([A.host, B.host]);
    await app.close();
  });

  async function seedTwoTenants() {
    // A run killed mid-flight never reaches afterAll, and its tenants keep the
    // hostnames this fixture needs — so the next run failed on a unique
    // constraint rather than on anything it was testing. Clearing first makes
    // the suite recoverable instead of requiring a manual database cleanup.
    await clearFixtures();

    await prisma.runUnscoped(async (db) => {
      for (const t of [A, B]) {
        const tenant = await db.tenant.create({
          data: {
            businessName: t.slug,
            slug: t.slug,
            contactEmail: `owner@${t.slug}.test`,
            status: 'ACTIVE',
          },
        });
        ids[`${t.slug}:tenant`] = tenant.id;

        await db.domain.create({
          data: { tenantId: tenant.id, hostname: t.host, status: 'ACTIVE', isPrimary: true },
        });

        // Same category slug in both tenants — legal, since the unique index is
        // on (tenantId, slug), and another good trap.
        const category = await db.category.create({
          data: { tenantId: tenant.id, name: 'Shared Category', slug: 'shared-category' },
        });
        ids[`${t.slug}:category`] = category.id;

        // Identical slug and SKU in both tenants — legal, and a good trap.
        const product = await db.product.create({
          data: {
            tenantId: tenant.id,
            name: 'Shared Name Widget',
            slug: 'shared-widget',
            sku: 'SKU-001',
            price: 100,
            stock: 10,
            status: 'ACTIVE',
            // Linked so facet counts have something to group by, as a real
            // catalogue would.
            categoryId: category.id,
          },
        });
        ids[`${t.slug}:product`] = product.id;

        // Same email registered at both stores — two unrelated accounts.
        const customer = await db.customer.create({
          data: {
            tenantId: tenant.id,
            email: 'shopper@example.com',
            firstName: 'Sam',
            // Hashed so the suite can sign in as a shopper once during setup;
            // registering per test burns the 3-per-minute throttle.
            passwordHash: await argon2.hash('TestPassword123', { type: argon2.argon2id }),
          },
        });
        ids[`${t.slug}:customer`] = customer.id;

        // Staff owner for this tenant. Without a real user every authenticated
        // assertion below degrades into a 401 and proves nothing.
        const owner = await db.user.create({
          data: {
            email: `owner@${t.slug}.test`,
            passwordHash: await argon2.hash('TestPassword123', { type: argon2.argon2id }),
            firstName: 'Owner',
            lastName: t.slug,
            systemRole: 'TENANT_OWNER',
          },
        });
        ids[`${t.slug}:owner`] = owner.id;

        await db.tenantUser.create({
          data: { tenantId: tenant.id, userId: owner.id, role: 'TENANT_OWNER', isActive: true },
        });

        // Published store + theme, so the storefront bootstrap call has
        // something to return and the two tenants are visibly different.
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: `${t.slug} store`,
            slug: `${t.slug}-store`,
            email: `owner@${t.slug}.test`,
            isPublished: true,
          },
        });
        ids[`${t.slug}:store`] = store.id;

        await db.theme.create({
          data: { tenantId: tenant.id, storeId: store.id, primaryColor: t.color },
        });

        // A live hero banner per tenant. Both carry the same title, so a leak
        // surfaces as the *other* tenant's id rather than as different copy.
        const banner = await db.banner.create({
          data: {
            tenantId: tenant.id,
            placement: 'HOME_HERO',
            title: 'Shared Banner Title',
            imageUrl: `https://cdn.example.test/${t.slug}.jpg`,
            linkUrl: '/shop',
          },
        });
        ids[`${t.slug}:banner`] = banner.id;

        // Two banners that must never reach a shopper: one whose window has
        // closed, one whose window has not opened. Scheduling is evaluated on
        // read rather than by a job, so these rows are what prove it.
        const expiredBanner = await db.banner.create({
          data: {
            tenantId: tenant.id,
            placement: 'SITE_ANNOUNCEMENT',
            title: 'Expired Announcement',
            startsAt: new Date('2020-01-01T00:00:00.000Z'),
            endsAt: new Date('2020-02-01T00:00:00.000Z'),
          },
        });
        ids[`${t.slug}:banner-expired`] = expiredBanner.id;

        const futureBanner = await db.banner.create({
          data: {
            tenantId: tenant.id,
            placement: 'SITE_ANNOUNCEMENT',
            title: 'Future Announcement',
            startsAt: new Date('2099-01-01T00:00:00.000Z'),
          },
        });
        ids[`${t.slug}:banner-future`] = futureBanner.id;
      }
    });

    // Deliberately only tenant A. Tenant B must not be able to redeem it.
    await prisma.runAsTenant(ids['tenant-a:tenant'], (db) =>
      db.coupon.create({
        data: {
          tenantId: ids['tenant-a:tenant'],
          code: 'ONLYA',
          discountType: 'PERCENTAGE',
          discountValue: 10,
        },
      }),
    );

    tokenA = await signIn(A.host);
    tokenB = await signIn(B.host);
    superToken = await seedSuperAdmin();
    customerTokenA = await signInCustomer(A.host);
  }

  /**
   * A super admin belongs to no tenant, so it is created outside the two-tenant
   * fixture and signs in on the platform host.
   */
  async function seedSuperAdmin(): Promise<string> {
    const email = 'platform-e2e@example.test';

    const passwordHash = await argon2.hash('TestPassword123', { type: argon2.argon2id });

    const user = await prisma.runUnscoped((db) =>
      db.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash,
          firstName: 'Platform',
          lastName: 'Tester',
          systemRole: 'SUPER_ADMIN',
          emailVerifiedAt: new Date(),
        },
      }),
    );
    ids['super:user'] = user.id;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', PLATFORM_HOST)
      .send({ email, password: 'TestPassword123' });

    return res.body?.data?.accessToken ?? '';
  }

  /** Adds the tenant's shared-slug product to a fresh guest cart. */
  async function guestCart(host: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', host)
      .send({ productId: ids[`${host.split('.')[0]}:product`], quantity: 1 })
      .expect(201);

    return res.body.data.cartToken;
  }

  const address = {
    fullName: 'Test Buyer',
    phone: '9876543210',
    line1: '1 Test Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'IN',
    postalCode: '400001',
  };

  /** One shopper sign-in for the whole suite; the auth routes are rate limited. */
  async function signInCustomer(host: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/customer/login')
      .set('Host', host)
      .send({ email: 'shopper@example.com', password: 'TestPassword123' });
    return res.body?.data?.accessToken ?? '';
  }

  async function signIn(host: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ email: `owner@${host.split('.')[0]}.test`, password: 'TestPassword123' });
    return res.body?.data?.accessToken ?? '';
  }

  // ---------------------------------------------------------------------------

  it('returns only the requesting tenant\'s products', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Host', A.host)
      .expect(200);

    const returnedIds = res.body.data.map((p: any) => p.id);
    expect(returnedIds).toContain(ids['tenant-a:product']);
    expect(returnedIds).not.toContain(ids['tenant-b:product']);
  });

  it('404s when tenant A requests tenant B\'s product by id', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${ids['tenant-b:product']}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('404s on a cross-tenant update instead of mutating the row', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/products/${ids['tenant-b:product']}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ price: 1 })
      .expect(404);

    const untouched = await prisma.runUnscoped((db) =>
      db.product.findUnique({ where: { id: ids['tenant-b:product'] } }),
    );
    expect(Number(untouched!.price)).toBe(100);
  });

  it('404s on a cross-tenant delete', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/products/${ids['tenant-b:product']}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    const alive = await prisma.runUnscoped((db) =>
      db.product.findUnique({ where: { id: ids['tenant-b:product'] } }),
    );
    expect(alive!.deletedAt).toBeNull();
  });

  it('rejects a tenantId injected into a create payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Injected',
        sku: 'INJ-1',
        price: 10,
        tenantId: ids['tenant-b:tenant'], // not in the DTO — must be refused
      })
      .expect(400);
  });

  it('stamps new records with the resolved tenant, not the requested one', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Legit', sku: 'LEG-1', price: 10 })
      .expect(201);

    const created = await prisma.runUnscoped((db) =>
      db.product.findUnique({ where: { id: res.body.data.id } }),
    );
    expect(created!.tenantId).toBe(ids['tenant-a:tenant']);
  });

  it('refuses a token minted for tenant A on tenant B\'s hostname', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products/' + ids['tenant-b:product'])
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);
  });

  it('resolves the same slug to different products per hostname', async () => {
    const a = await request(app.getHttpServer())
      .get('/api/v1/products/slug/shared-widget').set('Host', A.host).expect(200);
    const b = await request(app.getHttpServer())
      .get('/api/v1/products/slug/shared-widget').set('Host', B.host).expect(200);

    expect(a.body.data.id).toBe(ids['tenant-a:product']);
    expect(b.body.data.id).toBe(ids['tenant-b:product']);
    expect(a.body.data.id).not.toBe(b.body.data.id);
  });

  it('treats the same customer email as separate accounts per tenant', async () => {
    const a = await prisma.runAsTenant(ids['tenant-a:tenant'], (db) =>
      db.customer.findFirst({ where: { email: 'shopper@example.com' } }),
    );
    const b = await prisma.runAsTenant(ids['tenant-b:tenant'], (db) =>
      db.customer.findFirst({ where: { email: 'shopper@example.com' } }),
    );
    expect(a!.id).toBe(ids['tenant-a:customer']);
    expect(b!.id).toBe(ids['tenant-b:customer']);
  });

  it('resolves the same category slug to different rows per hostname', async () => {
    const a = await request(app.getHttpServer())
      .get('/api/v1/categories/slug/shared-category').set('Host', A.host).expect(200);
    const b = await request(app.getHttpServer())
      .get('/api/v1/categories/slug/shared-category').set('Host', B.host).expect(200);

    expect(a.body.data.id).toBe(ids['tenant-a:category']);
    expect(b.body.data.id).toBe(ids['tenant-b:category']);
  });

  it('refuses a parent category belonging to another tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Borrowed', parentId: ids['tenant-b:category'] })
      .expect(400);

    expect(res.body.code).toBe('CATEGORY_PARENT_NOT_FOUND');
  });

  it('keeps the category tree inside one tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/categories/tree').set('Host', A.host).expect(200);

    const ids_ = res.body.data.map((n: { id: string }) => n.id);
    expect(ids_).toContain(ids['tenant-a:category']);
    expect(ids_).not.toContain(ids['tenant-b:category']);
  });

  it('refuses a stock adjustment against another tenant\'s product', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: ids['tenant-b:product'], quantityDelta: -1, reason: 'SALE' })
      .expect(404);

    const untouched = await prisma.runUnscoped((db) =>
      db.product.findFirst({ where: { id: ids['tenant-b:product'] }, select: { stock: true } }),
    );
    expect(untouched!.stock).toBe(10);
  });

  it('never lets a decrement drive stock below zero', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: ids['tenant-a:product'], quantityDelta: -999, reason: 'SALE' })
      .expect(409);

    const stock = await prisma.runUnscoped((db) =>
      db.product.findFirst({ where: { id: ids['tenant-a:product'] }, select: { stock: true } }),
    );
    expect(stock!.stock).toBe(10);
  });

  it('writes a ledger row that only its own tenant can read', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjust')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: ids['tenant-a:product'], quantityDelta: -2, reason: 'SALE' })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/inventory/transactions')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/inventory/transactions')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].stockAfter).toBe(8);
    expect(theirs.body.data).toHaveLength(0);
  });

  it('does not let a cart token from one store open a cart at another', async () => {
    const tokenFromA = await guestCart(A.host);

    const atB = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', B.host)
      .set('x-cart-token', tokenFromA)
      .expect(200);

    expect(atB.body.data.itemCount).toBe(0);

    // Still intact on its own store, so this is isolation and not deletion.
    const atA = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', A.host)
      .set('x-cart-token', tokenFromA)
      .expect(200);

    expect(atA.body.data.itemCount).toBe(1);
  });

  it('refuses a coupon that belongs to another tenant', async () => {
    const cartAtB = await guestCart(B.host);

    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/coupon')
      .set('Host', B.host)
      .set('x-cart-token', cartAtB)
      .send({ code: 'ONLYA' })
      .expect(400);

    expect(res.body.code).toBe('COUPON_NOT_FOUND');

    // The same code works at the store that owns it.
    const cartAtA = await guestCart(A.host);
    await request(app.getHttpServer())
      .post('/api/v1/cart/coupon')
      .set('Host', A.host)
      .set('x-cart-token', cartAtA)
      .send({ code: 'ONLYA' })
      .expect(200);
  });

  it('computes the total from database prices, ignoring anything the client sends', async () => {
    const cartToken = await guestCart(A.host);

    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Host', A.host)
      .set('x-cart-token', cartToken)
      .send({
        email: 'buyer@example.com',
        shippingAddress: address,
        paymentMethod: 'COD',
        // None of these are fields the DTO accepts, so the validation pipe
        // rejects the request outright rather than quietly ignoring them.
        grandTotal: 1,
        subtotal: 1,
      })
      .expect(400);

    expect(res.body.details.join(' ')).toMatch(/grandTotal|subtotal/);
  });

  it('prices shipping on the server when the cart asks for a method', async () => {
    // A zone and method belonging to tenant A only.
    const zone = await prisma.runAsTenant(ids['tenant-a:tenant'], (db) =>
      db.shippingZone.create({
        data: { tenantId: ids['tenant-a:tenant'], name: 'Test zone', countries: ['IN'] },
      }),
    );
    const method = await prisma.runAsTenant(ids['tenant-a:tenant'], (db) =>
      db.shippingMethod.create({
        data: {
          tenantId: ids['tenant-a:tenant'],
          zoneId: zone.id,
          name: 'Test standard',
          baseRate: 40,
          codAvailable: true,
          codFee: 15,
        },
      }),
    );

    const cartToken = await guestCart(A.host);

    const plain = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', A.host)
      .set('x-cart-token', cartToken)
      .expect(200);

    expect(Number(plain.body.data.totals.shippingTotal)).toBe(0);
    expect(Number(plain.body.data.totals.grandTotal)).toBe(100);

    const shipped = await request(app.getHttpServer())
      .get(`/api/v1/cart?shippingMethodId=${method.id}&cod=true`)
      .set('Host', A.host)
      .set('x-cart-token', cartToken)
      .expect(200);

    // 40 carriage + 15 COD handling, added by the server rather than the client.
    expect(Number(shipped.body.data.totals.shippingTotal)).toBe(55);
    expect(Number(shipped.body.data.totals.grandTotal)).toBe(155);
    expect(shipped.body.data.shippingMethod.name).toBe('Test standard');

    // And that method must be invisible to the other tenant.
    await request(app.getHttpServer())
      .get(`/api/v1/cart?shippingMethodId=${method.id}`)
      .set('Host', B.host)
      .set('x-cart-token', await guestCart(B.host))
      .expect(404);
  });

  it('places an order priced from the catalogue and empties the cart', async () => {
    const cartToken = await guestCart(A.host);

    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Host', A.host)
      .set('x-cart-token', cartToken)
      .send({ email: 'buyer@example.com', shippingAddress: address, paymentMethod: 'COD' })
      .expect(201);

    ids['tenant-a:order'] = res.body.data.id;

    // Fixture product is priced at 100 with no tax, coupon or shipping.
    expect(Number(res.body.data.grandTotal)).toBe(100);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.items).toHaveLength(1);

    const cart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', A.host)
      .set('x-cart-token', cartToken)
      .expect(200);

    expect(cart.body.data.itemCount).toBe(0);
  });

  it('shows an order only to the tenant that took it', async () => {
    const mine = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(mine.body.data.map((o: { id: string }) => o.id)).toContain(ids['tenant-a:order']);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(theirs.body.data.map((o: { id: string }) => o.id)).not.toContain(
      ids['tenant-a:order'],
    );

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${ids['tenant-a:order']}`)
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('refuses to advance another tenant\'s order', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${ids['tenant-a:order']}/status`)
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'CONFIRMED' })
      .expect(404);

    const untouched = await prisma.runUnscoped((db) =>
      db.order.findFirst({
        where: { id: ids['tenant-a:order'] },
        select: { status: true },
      }),
    );
    expect(untouched!.status).toBe('PENDING');
  });

  /**
   * Registration writes a refresh token, and a customer id is not a user id.
   * Storing it in the wrong column fails the foreign key, which made storefront
   * accounts impossible to create at all — so this asserts the whole round trip.
   */
  it('registers a customer and refreshes their session', async () => {
    const email = `regression-${Date.now()}@example.com`;

    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/customer/register')
      .set('Host', A.host)
      .send({ email, password: 'ShopperPass123!', firstName: 'Reg' })
      .expect(201);

    expect(registered.body.data.accessToken).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
      .expect(200);

    expect(me.body.data.kind).toBe('customer');
    expect(me.body.data.email).toBe(email);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Host', A.host)
      .send({ refreshToken: registered.body.data.refreshToken })
      .expect(200);

    // The rotated token must still identify a customer, not fall back to staff.
    const after = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);

    expect(after.body.data.kind).toBe('customer');
  });

  it('treats the same customer credentials as unknown at another store', async () => {
    const email = `cross-${Date.now()}@example.com`;

    await request(app.getHttpServer())
      .post('/api/v1/auth/customer/register')
      .set('Host', A.host)
      .send({ email, password: 'ShopperPass123!', firstName: 'Cross' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/customer/login')
      .set('Host', B.host)
      .send({ email, password: 'ShopperPass123!' })
      .expect(401);
  });

  /**
   * Notifications sit outside automatic tenant scoping (tenantId is nullable for
   * platform-level notices), so the filter is written by hand in the service —
   * exactly the kind of place a leak hides.
   */
  it('shows each store only its own notification log', async () => {
    const forA = await prisma.runUnscoped((db) =>
      db.notification.create({
        data: {
          tenantId: ids['tenant-a:tenant'],
          channel: 'EMAIL',
          event: 'test.isolation',
          recipient: 'a-only@example.com',
          subject: 'For tenant A',
        },
      }),
    );

    const mine = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(mine.body.data.map((n: { id: string }) => n.id)).toContain(forA.id);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(theirs.body.data.map((n: { id: string }) => n.id)).not.toContain(forA.id);
    expect(JSON.stringify(theirs.body)).not.toContain('a-only@example.com');

    await prisma.runUnscoped((db) => db.notification.deleteMany({ where: { id: forA.id } }));
  });

  /**
   * Custom CSS lands in a <style> block on the storefront, so a breakout would
   * be script running on that store's own origin against its customers.
   */
  it('refuses custom CSS that could escape the style block', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/theme')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customCss: '.a{}</style><script>alert(1)</script>' })
      .expect(400);

    expect(res.body.code).toBe('UNSAFE_CUSTOM_CSS');
    expect(res.body.details.join(' ')).toMatch(/style/i);
  });

  it('accepts ordinary custom CSS and serves it to that store only', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/theme')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      // Writes the fixture's own colour back, so a later assertion about
      // per-tenant branding is not disturbed by this one.
      .send({ customCss: '.only-a { color: rebeccapurple; }', primaryColor: A.color })
      .expect(200);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', A.host).expect(200);
    expect(mine.body.data.theme.customCss).toContain('.only-a');
    expect(mine.body.data.theme.primaryColor).toBe(A.color);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', B.host).expect(200);
    expect(theirs.body.data.theme.customCss).toBeNull();
    expect(theirs.body.data.theme.primaryColor).toBe(B.color);
  });

  it('will not serve unsafe CSS even if it reached the database another way', async () => {
    // Simulates a row written by an older build or a direct database edit.
    await prisma.runAsTenant(ids['tenant-a:tenant'], (db) =>
      db.theme.update({
        where: { storeId: ids['tenant-a:store'] },
        data: { customCss: '.x{}</style><script>alert(1)</script>' },
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', A.host).expect(200);

    // Sanitised again on read, so the dangerous value never reaches a browser.
    expect(res.body.data.theme.customCss).toBeNull();
  });

  it('refuses a font that is not on the allowlist', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/theme')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ headingFont: 'Evil"); @import url(//evil' })
      .expect(400);
  });

  /**
   * Two numbers on one screen describing the same orders. They were computed
   * from separate queries once, and disagreed — the headline counted today's
   * orders and the chart's last bucket ended yesterday.
   */
  it('reports a revenue total that matches its own daily series', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/dashboard?days=30')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const { revenue, orders, dailyRevenue } = res.body.data;
    const charted = dailyRevenue.reduce(
      (sum: number, d: { revenue: string }) => sum + Number(d.revenue),
      0,
    );
    const chartedOrders = dailyRevenue.reduce(
      (sum: number, d: { orders: number }) => sum + d.orders,
      0,
    );

    expect(charted.toFixed(2)).toBe(Number(revenue.total).toFixed(2));
    expect(chartedOrders).toBe(orders.count);
    // The window must include today, or today's sales are invisible.
    expect(dailyRevenue[dailyRevenue.length - 1].date).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it('keeps each store\'s analytics to its own orders', async () => {
    const a = await request(app.getHttpServer())
      .get('/api/v1/analytics/dashboard')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const b = await request(app.getHttpServer())
      .get('/api/v1/analytics/dashboard')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Tenant A placed an order earlier in this suite; tenant B placed none.
    expect(a.body.data.orders.count).toBeGreaterThan(0);
    expect(b.body.data.orders.count).toBe(0);
    expect(Number(b.body.data.revenue.total)).toBe(0);
  });

  it('holds a review back until it is approved, and only for its own store', async () => {
    // A customer of tenant A with a delivered order would be verified; this one
    // has not bought, so the flag must come out false rather than be claimed.
    const email = `reviewer-${Date.now()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/customer/register')
      .set('Host', A.host)
      .send({ email, password: 'ShopperPass123!', firstName: 'Rev' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
      .send({ productId: ids['tenant-a:product'], rating: 5, comment: 'Great' })
      .expect(201);

    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.isVerifiedPurchase).toBe(false);

    const publicBefore = await request(app.getHttpServer())
      .get(`/api/v1/reviews/product/${ids['tenant-a:product']}`)
      .set('Host', A.host)
      .expect(200);
    expect(publicBefore.body.meta.total).toBe(0);

    // Tenant B must not be able to moderate it.
    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${created.body.data.id}`)
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'APPROVED' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${created.body.data.id}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    const publicAfter = await request(app.getHttpServer())
      .get(`/api/v1/reviews/product/${ids['tenant-a:product']}`)
      .set('Host', A.host)
      .expect(200);

    expect(publicAfter.body.meta.total).toBe(1);
    // The histogram must survive the response envelope, not be dropped.
    expect(publicAfter.body.breakdown['5']).toBe(1);

    const product = await prisma.runUnscoped((db) =>
      db.product.findFirst({
        where: { id: ids['tenant-a:product'] },
        select: { ratingAverage: true, ratingCount: true },
      }),
    );
    expect(Number(product!.ratingAverage)).toBe(5);
    expect(product!.ratingCount).toBe(1);
  });

  /**
   * The TLS gate is what stops the platform being made to request certificates
   * for hostnames it knows nothing about. It is unauthenticated by necessity —
   * the reverse proxy has no credentials — so its logic carries the whole weight.
   */
  describe('TLS authority', () => {
    const check = (domain?: string) =>
      request(app.getHttpServer()).get(
        `/api/v1/tls/check${domain === undefined ? '' : `?domain=${domain}`}`,
      );

    it('allows a hostname that resolves to an active tenant', async () => {
      await check(A.host).expect(200);
    });

    it('refuses a hostname belonging to nobody', async () => {
      await check('not-a-store.example.com').expect(404);
    });

    it('refuses an empty or missing hostname', async () => {
      await check().expect(404);
      await check('').expect(404);
    });

    it('refuses a custom domain that has not been verified', async () => {
      const added = await request(app.getHttpServer())
        .post('/api/v1/domains')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ hostname: 'pending.example.com' })
        .expect(201);

      // PENDING, so neither the resolver nor the TLS gate will serve it.
      await check('pending.example.com').expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/domains/${added.body.data.id}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);
    });

    it('refuses a verified domain once its tenant is suspended', async () => {
      const added = await request(app.getHttpServer())
        .post('/api/v1/domains')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ hostname: 'live.example.com' })
        .expect(201);

      await prisma.runUnscoped((db) =>
        db.domain.update({
          where: { id: added.body.data.id },
          data: { status: 'ACTIVE', verifiedAt: new Date() },
        }),
      );
      await check('live.example.com').expect(200);

      await prisma.runUnscoped((db) =>
        db.tenant.update({
          where: { id: ids['tenant-a:tenant'] },
          data: { status: 'SUSPENDED' },
        }),
      );
      await check('live.example.com').expect(404);

      await prisma.runUnscoped((db) =>
        db.tenant.update({
          where: { id: ids['tenant-a:tenant'] },
          data: { status: 'ACTIVE' },
        }),
      );
      await prisma.runUnscoped((db) =>
        db.domain.deleteMany({ where: { id: added.body.data.id } }),
      );
    });
  });

  it('will not let two tenants claim the same custom domain', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/domains')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ hostname: 'contested.example.com' })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/domains')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ hostname: 'contested.example.com' })
      .expect(409);

    expect(conflict.body.code).toBe('DOMAIN_TAKEN');

    // And B must not see A's domain in its own list.
    const theirs = await request(app.getHttpServer())
      .get('/api/v1/domains')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(JSON.stringify(theirs.body)).not.toContain('contested.example.com');

    await request(app.getHttpServer())
      .delete(`/api/v1/domains/${added.body.data.id}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });

  it('refuses a platform subdomain as a custom domain', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/domains')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ hostname: `stolen.${process.env.PLATFORM_DOMAIN ?? 'platform.test'}` })
      .expect(400);

    expect(res.body.code).toBe('DOMAIN_RESERVED');
  });

  it('lists only its own customers, even when an email is shared', async () => {
    /**
     * Created directly rather than through `/auth/customer/register`, which is
     * capped at 3 per minute. This test is about list scoping, not registration;
     * borrowing that endpoint's quota would make it fail based on how many other
     * tests ran first. Registration itself is covered separately above.
     */
    const email = `shared-shopper-${Date.now()}@example.com`;
    for (const tenantKey of ['tenant-a', 'tenant-b']) {
      await prisma.runUnscoped((db) =>
        db.customer.create({
          data: {
            tenantId: ids[`${tenantKey}:tenant`],
            email,
            firstName: 'Shared',
            passwordHash: 'not-a-real-hash',
          },
        }),
      );
    }

    const mine = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Host', B.host)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const idsA = mine.body.data.map((c: { id: string }) => c.id);
    const idsB = theirs.body.data.map((c: { id: string }) => c.id);

    // Both stores see a customer with that email, and they are different rows.
    expect(mine.body.data.some((c: { email: string }) => c.email === email)).toBe(true);
    expect(theirs.body.data.some((c: { email: string }) => c.email === email)).toBe(true);
    expect(idsA.filter((id: string) => idsB.includes(id))).toHaveLength(0);

    // And one store cannot read the other's row directly.
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${idsB[0]}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  /**
   * `Customer.lastOrderAt` and `totalSpent` are denormalised columns nothing
   * currently writes, so the list showed "1 order, last ordered never". Both are
   * derived from orders instead; this asserts the two never contradict.
   */
  it('reports a last-order date whenever a customer has orders', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    for (const c of res.body.data as { orderCount: number; lastOrderAt: string | null }[]) {
      expect(Boolean(c.lastOrderAt)).toBe(c.orderCount > 0);
    }
  });

  it('refuses to change a customer\'s email address', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // Editing an email would move an order history to an unconfirmed address,
    // so the field is not in the DTO and unknown keys are rejected.
    await request(app.getHttpServer())
      .patch(`/api/v1/customers/${list.body.data[0].id}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'hijacked@example.com' })
      .expect(400);
  });

  describe('sitemap and robots', () => {
    it('builds a sitemap from the requesting store\'s own catalogue', async () => {
      const a = await request(app.getHttpServer())
        .get('/sitemap.xml').set('Host', A.host).expect(200);

      expect(a.headers['content-type']).toContain('application/xml');
      // Unwrapped: a crawler must get XML, not a JSON envelope containing XML.
      expect(a.text.startsWith('<?xml')).toBe(true);
      // No scheme asserted: it is taken from the request, which is plain http
      // under supertest and https behind the real proxy.
      expect(a.text).toContain(`${A.host}/product/shared-widget`);

      const b = await request(app.getHttpServer())
        .get('/sitemap.xml').set('Host', B.host).expect(200);

      // Same slug, different tenant — each sitemap advertises its own hostname.
      expect(b.text).toContain(`${B.host}/product/shared-widget`);
      expect(b.text).not.toContain(A.host);
    });

    it('keeps draft and archived products out of the sitemap', async () => {
      const draft = await prisma.runAsTenant(ids['tenant-a:tenant'], (db) =>
        db.product.create({
          data: {
            tenantId: ids['tenant-a:tenant'],
            name: 'Not ready',
            slug: 'not-ready-yet',
            sku: 'DRAFT-1',
            price: 10,
            status: 'DRAFT',
          } as never,
        }),
      );

      const res = await request(app.getHttpServer())
        .get('/sitemap.xml').set('Host', A.host).expect(200);

      expect(res.text).not.toContain('not-ready-yet');

      await prisma.runUnscoped((db) => db.product.delete({ where: { id: draft.id } }));
    });

    it('disallows everything while a store is unpublished', async () => {
      await prisma.runUnscoped((db) =>
        db.store.updateMany({
          where: { id: ids['tenant-a:store'] },
          data: { isPublished: false },
        }),
      );

      const robots = await request(app.getHttpServer())
        .get('/robots.txt').set('Host', A.host).expect(200);

      expect(robots.text).toContain('Disallow: /');
      expect(robots.text).not.toContain('Allow: /');

      await prisma.runUnscoped((db) =>
        db.store.updateMany({
          where: { id: ids['tenant-a:store'] },
          data: { isPublished: true },
        }),
      );
    });

    it('keeps per-visitor pages out of the index', async () => {
      const robots = await request(app.getHttpServer())
        .get('/robots.txt').set('Host', A.host).expect(200);

      for (const path of ['/cart', '/checkout', '/account', '/api/']) {
        expect(robots.text).toContain(`Disallow: ${path}`);
      }
      expect(robots.text).toContain(`${A.host}/sitemap.xml`);
    });
  });

  describe('audit trail', () => {
    it('records a suspension against the right tenant and actor', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${ids['tenant-b:tenant']}/suspend`)
        .set('Host', PLATFORM_HOST)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ reason: 'audit e2e' })
        .expect(200);

      const trail = await request(app.getHttpServer())
        .get('/api/v1/platform/audit?action=tenant.suspended')
        .set('Host', PLATFORM_HOST)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const entry = trail.body.data.find(
        (a: { entityId: string }) => a.entityId === ids['tenant-b:tenant'],
      );
      expect(entry).toBeDefined();
      expect(entry.changes.reason).toBe('audit e2e');

      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${ids['tenant-b:tenant']}/activate`)
        .set('Host', PLATFORM_HOST)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);
    });

    /**
     * The audit service writes on its own connection, so an entry created inside
     * the provisioning transaction referenced a tenant row it could not see yet.
     * Audit failures are logged rather than thrown, so the entry vanished
     * silently — exactly the kind of gap an audit log must not have.
     */
    it('records tenant creation, which happens inside a transaction', async () => {
      const slug = `audit-created-${Date.now().toString(36)}`;

      const created = await request(app.getHttpServer())
        .post('/api/v1/platform/tenants')
        .set('Host', PLATFORM_HOST)
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          businessName: 'Audit Created Co',
          storeName: 'Audit Created',
          slug,
          email: `hello@${slug}.test`,
          ownerEmail: `owner@${slug}.test`,
          ownerPassword: 'ProvisionPass123!',
          ownerFirstName: 'Audit',
        })
        .expect(201);

      const trail = await request(app.getHttpServer())
        .get('/api/v1/platform/audit?action=tenant.created')
        .set('Host', PLATFORM_HOST)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(
        trail.body.data.some((a: { entityId: string }) => a.entityId === created.body.data.id),
      ).toBe(true);

      await prisma.runUnscoped((db) =>
        db.tenant.delete({ where: { id: created.body.data.id } }),
      );
    });

    it('keeps a store\'s audit trail to its own actions', async () => {
      const mine = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const foreign = mine.body.data.filter(
        (a: { tenantId: string | null }) =>
          a.tenantId !== null && a.tenantId !== ids['tenant-a:tenant'],
      );
      expect(foreign).toHaveLength(0);
    });

    it('ignores a tenantId supplied by a store owner', async () => {
      // Passing another tenant's id must not widen the query.
      const res = await request(app.getHttpServer())
        .get(`/api/v1/audit?tenantId=${ids['tenant-b:tenant']}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      for (const entry of res.body.data as { tenantId: string }[]) {
        expect(entry.tenantId).toBe(ids['tenant-a:tenant']);
      }
    });

    it('refuses the platform trail to a store owner', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/platform/audit')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });
  });

  describe('platform boundaries', () => {
    it('refuses plans and platform analytics to a store owner', async () => {
      for (const path of ['/api/v1/platform/plans', '/api/v1/platform/analytics/overview']) {
        await request(app.getHttpServer())
          .get(path)
          .set('Host', A.host)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(403);
      }
    });

    it('will not retire a plan a store is still on', async () => {
      const plans = await request(app.getHttpServer())
        .get('/api/v1/platform/plans')
        .set('Host', PLATFORM_HOST)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const inUse = plans.body.data.find(
        (p: { _count: { subscriptions: number } }) => p._count.subscriptions > 0,
      );

      if (inUse) {
        const res = await request(app.getHttpServer())
          .delete(`/api/v1/platform/plans/${inUse.id}`)
          .set('Host', PLATFORM_HOST)
          .set('Authorization', `Bearer ${superToken}`)
          .expect(409);
        expect(res.body.code).toBe('PLAN_IN_USE');
      }
    });
  });

  /**
   * `sortBy` arrives as free text and used to be spread straight into Prisma's
   * `orderBy`. An unknown column made Prisma throw, so `/shop?sort=anything`
   * was a 500 any visitor could trigger — the storefront puts that value in the
   * URL, so it was reachable by editing the address bar.
   */
  describe('sort field allowlist', () => {
    for (const sortBy of ['nonsense', '__proto__', 'id; DROP TABLE products', '']) {
      it(`falls back rather than failing on sortBy=${sortBy || '(empty)'}`, async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ sortBy })
          .set('Host', A.host)
          .expect(200);

        expect(Array.isArray(res.body.data)).toBe(true);
      });
    }

    it('still honours a field that is allowed', async () => {
      const asc = await request(app.getHttpServer())
        .get('/api/v1/products?sortBy=price&sortOrder=asc')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const desc = await request(app.getHttpServer())
        .get('/api/v1/products?sortBy=price&sortOrder=desc')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Asserts the ordering rather than a row count: other tests in this file
      // create products, so a count would depend on execution order.
      const ascPrices = asc.body.data.map((p: { price: string }) => Number(p.price));
      expect([...ascPrices].sort((a, b) => a - b)).toEqual(ascPrices);
      expect(desc.body.data.map((p: { price: string }) => Number(p.price))).toEqual(
        [...ascPrices].reverse(),
      );
    });
  });

  /**
   * `GET /products` is public and had no status filter of its own, so an
   * anonymous request returned every DRAFT and ARCHIVED product — names, prices
   * and all. The storefront passed `status=ACTIVE` and hid the problem; anyone
   * calling the API directly saw a store's unreleased catalogue.
   */
  describe('unpublished products', () => {
    let draftId: string;

    beforeAll(async () => {
      const draft = await prisma.runUnscoped((db) =>
        db.product.create({
          data: {
            tenantId: ids['tenant-a:tenant'],
            name: 'Unreleased Widget',
            slug: `unreleased-${Date.now()}`,
            sku: `UNREL-${Date.now()}`,
            price: 999,
            status: 'DRAFT',
          },
        }),
      );
      draftId = draft.id;
    });

    afterAll(async () => {
      await prisma.runUnscoped((db) => db.product.deleteMany({ where: { id: draftId } }));
    });

    it('are hidden from an anonymous list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('Unreleased Widget');
    });

    it('cannot be revealed by asking for them explicitly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products?status=DRAFT')
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('are visible to staff who may read products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products?status=DRAFT')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.some((p: { id: string }) => p.id === draftId)).toBe(true);
    });

    it('stay hidden from a signed-in shopper', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .expect(200);

      expect(res.body.data.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
    });
  });

  describe('wishlist', () => {
    it('tells a guest a product is not saved rather than refusing', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/wishlist/${ids['tenant-a:product']}`)
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data.saved).toBe(false);
    });

    it('saves once however many times it is asked', async () => {
      const first = await request(app.getHttpServer())
        .post(`/api/v1/wishlist/${ids['tenant-a:product']}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/wishlist/${ids['tenant-a:product']}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .expect(200);

      expect(first.body.data.alreadySaved).toBe(false);
      expect(second.body.data.alreadySaved).toBe(true);

      const list = await request(app.getHttpServer())
        .get('/api/v1/wishlist')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .expect(200);

      expect(list.body.data).toHaveLength(1);
    });

    it("will not save another store's product", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/wishlist/${ids['tenant-b:product']}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .expect(404);
    });

    /**
     * `list()` shows only ACTIVE products, so saving a draft used to succeed
     * and then never appear — the heart filled and the wishlist stayed empty.
     */
    it('will not save a product that is not on sale', async () => {
      const draft = await prisma.runUnscoped((db) =>
        db.product.create({
          data: {
            tenantId: ids['tenant-a:tenant'],
            name: 'Draft Widget',
            slug: `draft-${Date.now()}`,
            sku: `DRAFT-${Date.now()}`,
            price: 10,
            status: 'DRAFT',
          },
        }),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/wishlist/${draft.id}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .expect(404);

      await prisma.runUnscoped((db) => db.product.delete({ where: { id: draft.id } }));
    });
  });

  /**
   * Page content is author-written HTML rendered on the store's own origin, so
   * a script that survives the save runs against that store's customers. The
   * sanitiser is unit-tested; this proves it is actually wired into the write
   * path and that the storefront never serves the raw value.
   */
  describe('CMS pages', () => {
    let pageId: string;

    it('strips executable markup on save and reports what went', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pages')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'About Tenant A',
          content:
            '<h2>Story</h2><p>Since 2019.</p><script>steal()</script><p onclick="x()">Hi</p><a href="javascript:alert(1)">bad</a>',
          isPublished: true,
        })
        .expect(201);

      pageId = res.body.data.id;

      expect(res.body.data.content).not.toContain('<script');
      expect(res.body.data.content).not.toContain('onclick');
      expect(res.body.data.content).not.toContain('javascript:');
      expect(res.body.data.content).toContain('Since 2019');
      expect(res.body.data.removed).toEqual(
        expect.arrayContaining(['<script>', 'event handlers', 'unsafe URLs']),
      );
    });

    it('serves the sanitised page publicly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pages/by-slug/about-tenant-a')
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data.content).not.toContain('<script');
    });

    it('keeps pages to their own store', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pages/by-slug/about-tenant-a')
        .set('Host', B.host)
        .expect(404);

      const theirs = await request(app.getHttpServer())
        .get('/api/v1/pages')
        .set('Host', B.host)
        .expect(200);

      expect(theirs.body.data).toHaveLength(0);
    });

    it('refuses a slug the storefront router already owns', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pages')
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Cart', slug: 'cart', content: '<p>x</p>' })
        .expect(409);

      expect(res.body.code).toBe('PAGE_SLUG_RESERVED');
    });

    it('hides an unpublished page from the storefront and the sitemap', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/pages/${pageId}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ isPublished: false })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/pages/by-slug/about-tenant-a')
        .set('Host', A.host)
        .expect(404);

      const sitemap = await request(app.getHttpServer())
        .get('/sitemap.xml')
        .set('Host', A.host)
        .expect(200);

      expect(sitemap.text).not.toContain('about-tenant-a');
    });

    afterAll(async () => {
      await prisma.runUnscoped((db) => db.page.deleteMany({ where: { id: pageId } }));
    });
  });

  describe('shipments', () => {
    let orderId: string;
    let shipmentId: string;

    beforeAll(async () => {
      const cart = await guestCart(A.host);
      const order = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Host', A.host)
        .set('x-cart-token', cart)
        .send({ email: 'ship@example.test', shippingAddress: address, paymentMethod: 'COD' })
        .expect(201);

      orderId = order.body.data.id;
    });

    it('advances the order and records tracking', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/shipments`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ provider: 'Delhivery', trackingNumber: 'DL-E2E-1' })
        .expect(201);

      shipmentId = res.body.data.id;

      const order = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Dispatching *is* shipping; the two must not be able to disagree.
      expect(order.body.data.status).toBe('SHIPPED');
      expect(order.body.data.fulfillmentStatus).toBe('FULFILLED');
    });

    it('closes the order when the parcel is delivered', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/shipments/${shipmentId}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'DELIVERED' })
        .expect(200);

      const order = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(order.body.data.status).toBe('DELIVERED');
    });

    it("will not let another store dispatch this order", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/shipments`)
        .set('Host', B.host)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ provider: 'Hijack' })
        .expect(404);
    });

    it('refuses to dispatch a cancelled order', async () => {
      const cart = await guestCart(A.host);
      const order = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Host', A.host)
        .set('x-cart-token', cart)
        .send({ email: 'cancel@example.test', shippingAddress: address, paymentMethod: 'COD' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.body.data.id}/status`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'CANCELLED', reason: 'e2e' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.body.data.id}/shipments`)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ provider: 'Delhivery' })
        .expect(400);

      expect(res.body.code).toBe('ORDER_NOT_SHIPPABLE');
    });
  });

  describe('search facets', () => {
    it('counts only this store, and only what is on sale', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/facets')
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data.total).toBeGreaterThan(0);
      expect(res.body.data.categories.map((c: { name: string }) => c.name)).toContain(
        'Shared Category',
      );
      expect(Number(res.body.data.price.min)).toBeGreaterThan(0);
    });

    /**
     * The point of a facet count: choosing a category narrows the price range
     * and the availability counts, but must not remove the category list —
     * otherwise there is no way back without clearing the filter by hand.
     */
    it('keeps the category list navigable after a category is chosen', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/facets?categoryId=${ids['tenant-a:category']}`)
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data.categories.length).toBeGreaterThan(0);
    });

    it('narrows the total when a price range excludes everything', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/facets?minPrice=999999')
        .set('Host', A.host)
        .expect(200);

      expect(res.body.data.total).toBe(0);
      expect(res.body.data.availability.inStock).toBe(0);
    });

    it('never counts another store\'s catalogue', async () => {
      const a = await request(app.getHttpServer())
        .get('/api/v1/products/facets')
        .set('Host', A.host)
        .expect(200);

      const b = await request(app.getHttpServer())
        .get('/api/v1/products/facets')
        .set('Host', B.host)
        .expect(200);

      const aIds = a.body.data.categories.map((c: { id: string }) => c.id);
      const bIds = b.body.data.categories.map((c: { id: string }) => c.id);
      expect(aIds.filter((id: string) => bIds.includes(id))).toHaveLength(0);
    });

    it('excludes drafts from the counts', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/v1/products/facets')
        .set('Host', A.host)
        .expect(200);

      const draft = await prisma.runUnscoped((db) =>
        db.product.create({
          data: {
            tenantId: ids['tenant-a:tenant'],
            name: 'Facet Draft',
            slug: `facet-draft-${Date.now()}`,
            sku: `FACET-${Date.now()}`,
            price: 5,
            status: 'DRAFT',
            categoryId: ids['tenant-a:category'],
          },
        }),
      );

      const after = await request(app.getHttpServer())
        .get('/api/v1/products/facets')
        .set('Host', A.host)
        .expect(200);

      expect(after.body.data.total).toBe(before.body.data.total);

      await prisma.runUnscoped((db) => db.product.delete({ where: { id: draft.id } }));
    });
  });

  /**
   * Social scrapers read the first response and never run JavaScript, so a
   * client-rendered shell previewed as a blank card titled "Store". These
   * routes serve the same shell with real tags already in the head.
   */
  describe('server-rendered meta', () => {
    it('puts the product name, price and canonical in the first response', async () => {
      const res = await request(app.getHttpServer())
        .get('/__ssr/product/shared-widget')
        .set('Host', A.host)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<meta property="og:type" content="product">');
      expect(res.text).toMatch(/<meta property="og:title" content="[^"]*Shared Name Widget/);
      expect(res.text).toContain('product:price:amount');
      expect(res.text).toContain(`${A.host}/product/shared-widget`);
    });

    it('never leaves two title tags in the document', async () => {
      const res = await request(app.getHttpServer())
        .get('/__ssr/product/shared-widget')
        .set('Host', A.host)
        .expect(200);

      // The shell ships a placeholder title; two of them is invalid HTML and
      // scrapers disagree about which one wins.
      expect(res.text.match(/<title>/g) ?? []).toHaveLength(1);
    });

    it('describes each store with its own details on a shared slug', async () => {
      const a = await request(app.getHttpServer())
        .get('/__ssr/product/shared-widget').set('Host', A.host).expect(200);
      const b = await request(app.getHttpServer())
        .get('/__ssr/product/shared-widget').set('Host', B.host).expect(200);

      expect(a.text).toContain(`${A.host}/product/shared-widget`);
      expect(b.text).toContain(`${B.host}/product/shared-widget`);
      expect(a.text).not.toContain(B.host);
    });

    it('escapes a product name that contains markup', async () => {
      const nasty = await prisma.runUnscoped((db) =>
        db.product.create({
          data: {
            tenantId: ids['tenant-a:tenant'],
            name: '<script>alert(1)</script>',
            slug: `nasty-${Date.now()}`,
            sku: `NASTY-${Date.now()}`,
            price: 10,
            status: 'ACTIVE',
          },
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/__ssr/product/${nasty.slug}`)
        .set('Host', A.host)
        .expect(200);

      // A product name reaches the <head> as an attribute value, so it is the
      // same injection surface as a page body.
      expect(res.text).not.toContain('<script>alert(1)</script>');
      expect(res.text).toContain('&lt;script&gt;');

      await prisma.runUnscoped((db) => db.product.delete({ where: { id: nasty.id } }));
    });

    it('still returns the shell for a product that does not exist', async () => {
      // The SPA renders its own "no longer available" page; a 404 here would
      // replace that with the proxy's error page.
      await request(app.getHttpServer())
        .get('/__ssr/product/no-such-product')
        .set('Host', A.host)
        .expect(200);
    });

    it('serves the store and category shells too', async () => {
      await request(app.getHttpServer()).get('/__ssr/home').set('Host', A.host).expect(200);
      await request(app.getHttpServer())
        .get('/__ssr/category/shared-category').set('Host', A.host).expect(200);
    });
  });

  it('serves each hostname its own store branding', async () => {
    const a = await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', A.host).expect(200);
    const b = await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', B.host).expect(200);

    expect(a.body.data.id).toBe(ids['tenant-a:store']);
    expect(b.body.data.id).toBe(ids['tenant-b:store']);
    expect(a.body.data.theme.primaryColor).toBe(A.color);
    expect(b.body.data.theme.primaryColor).toBe(B.color);
  });

  it('never exposes the tenant id in the storefront config', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', A.host).expect(200);

    expect(JSON.stringify(res.body)).not.toContain(ids['tenant-a:tenant']);
  });

  it('404s the store config on an unknown hostname', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/store')
      .set('Host', 'not-a-tenant.platform.test')
      .expect(404);
  });

  it('hides an unpublished store rather than serving it', async () => {
    await prisma.runUnscoped((db) =>
      db.store.updateMany({
        where: { id: ids['tenant-a:store'] },
        data: { isPublished: false },
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/store').set('Host', A.host).expect(404);

    await prisma.runUnscoped((db) =>
      db.store.updateMany({
        where: { id: ids['tenant-a:store'] },
        data: { isPublished: true },
      }),
    );
  });

  it('serves nothing for an unknown hostname', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Host', 'not-a-tenant.platform.test')
      .expect(404);
  });

  it('stops serving a suspended tenant', async () => {
    await prisma.runUnscoped((db) =>
      db.tenant.update({ where: { id: ids['tenant-b:tenant'] }, data: { status: 'SUSPENDED' } }),
    );
    const resolver = app.get<any>(require('../src/tenants/tenant-resolver.service').TenantResolverService);
    await resolver.invalidate([B.host]);

    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Host', B.host)
      .expect(404);

    await prisma.runUnscoped((db) =>
      db.tenant.update({ where: { id: ids['tenant-b:tenant'] }, data: { status: 'ACTIVE' } }),
    );
    await resolver.invalidate([B.host]);
  });

  it('blocks a tenant owner from platform-only routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/platform/tenants')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);
  });

  // ---------------------------------------------------------------------------
  // Banners, templates and uploads.
  //
  // These three arrived after the original suite, and two of them are new
  // tenant-scoped surfaces — which is exactly where isolation regressions get
  // introduced.
  // ---------------------------------------------------------------------------

  it('returns only the requesting tenant\'s banners', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/banners')
      .set('Host', A.host)
      .expect(200);

    const returned = res.body.data.map((b: any) => b.id);
    expect(returned).toContain(ids['tenant-a:banner']);
    expect(returned).not.toContain(ids['tenant-b:banner']);
  });

  /**
   * The schedule is applied in the query, so an expired or not-yet-started
   * banner is absent from the public response rather than filtered in the
   * browser. A storefront must never receive a promotion it should not show.
   */
  it('withholds scheduled and expired banners from shoppers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/banners')
      .set('Host', A.host)
      .expect(200);

    const returned = res.body.data.map((b: any) => b.id);
    expect(returned).not.toContain(ids['tenant-a:banner-expired']);
    expect(returned).not.toContain(ids['tenant-a:banner-future']);
  });

  it('still shows the owner those banners, marked not live', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/banners/admin')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const rows: any[] = res.body.data;
    expect(rows.find((b) => b.id === ids['tenant-a:banner-expired'])?.isLive).toBe(false);
    expect(rows.find((b) => b.id === ids['tenant-a:banner-future'])?.isLive).toBe(false);
    expect(rows.find((b) => b.id === ids['tenant-a:banner'])?.isLive).toBe(true);
    // And still nothing belonging to the other tenant.
    expect(rows.map((b) => b.id)).not.toContain(ids['tenant-b:banner']);
  });

  it('404s when tenant A edits or deletes tenant B\'s banner', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/banners/${ids['tenant-b:banner']}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Hijacked' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/banners/${ids['tenant-b:banner']}`)
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    // The row is untouched, not merely the response unhelpful.
    const still = await prisma.runUnscoped((db) =>
      db.banner.findUnique({ where: { id: ids['tenant-b:banner'] } }),
    );
    expect(still?.title).toBe('Shared Banner Title');
  });

  /**
   * `linkUrl` becomes an href, which React does not escape. The unit suite
   * covers the sanitiser itself; this proves it is wired into the write path
   * rather than sitting unused beside it.
   */
  it('strips a javascript: banner link on write', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/banners')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        placement: 'HOME_HERO',
        imageUrl: 'https://cdn.example.test/x.jpg',
        title: 'Sanitise me',
        linkUrl: 'javascript:alert(1)',
      })
      .expect(201);

    expect(res.body.data.linkUrl).toBeNull();

    await prisma.runUnscoped((db) => db.banner.delete({ where: { id: res.body.data.id } }));
  });

  it('refuses a hero with no image and an announcement with no message', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/banners')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ placement: 'HOME_HERO', title: 'No image' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/banners')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ placement: 'SITE_ANNOUNCEMENT', imageUrl: 'https://cdn.example.test/x.jpg' })
      .expect(400);
  });

  it('keeps template management off limits to a tenant owner', async () => {
    for (const path of [
      '/api/v1/platform/templates',
      '/api/v1/platform/templates/gallery',
      '/api/v1/platform/templates/options',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Host', A.host)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    }
  });

  /**
   * A template is copied into a store's theme at provisioning, so retiring one
   * is safe and deleting one is not. The API has to say which, rather than
   * letting a foreign key surface as a 500.
   */
  it('refuses to delete a template a store used, but allows retiring it', async () => {
    // Nothing has been built from this one, so it may be deleted. Proving that
    // first means the refusal below is about the store, not a broken route.
    const spare = await prisma.runUnscoped((db) =>
      db.template.create({
        data: { name: 'E2E Spare', slug: 'e2e-spare', category: 'test' },
      }),
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/platform/templates/${spare.id}`)
      .set('Host', PLATFORM_HOST)
      .set('Authorization', `Bearer ${superToken}`)
      .expect(204);

    const template = await prisma.runUnscoped((db) =>
      db.template.create({
        data: { name: 'E2E Template', slug: 'e2e-template', category: 'test' },
      }),
    );

    await prisma.runUnscoped((db) =>
      db.store.update({
        where: { id: ids['tenant-a:store'] },
        data: { templateId: template.id },
      }),
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/platform/templates/${template.id}`)
      .set('Host', PLATFORM_HOST)
      .set('Authorization', `Bearer ${superToken}`)
      .expect(409);

    // Retiring is always allowed and takes it out of the gallery.
    await request(app.getHttpServer())
      .put(`/api/v1/platform/templates/${template.id}`)
      .set('Host', PLATFORM_HOST)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ isActive: false })
      .expect(200);

    const gallery = await request(app.getHttpServer())
      .get('/api/v1/platform/templates/gallery')
      .set('Host', PLATFORM_HOST)
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(gallery.body.data.map((t: any) => t.id)).not.toContain(template.id);

    await prisma.runUnscoped(async (db) => {
      await db.store.update({
        where: { id: ids['tenant-a:store'] },
        data: { templateId: null },
      });
      await db.template.delete({ where: { id: template.id } });
    });
  });

  /**
   * The stored key is what decides which tenant an object belongs to, and it is
   * generated rather than taken from the filename. A key not leading with this
   * tenant's id would put one store's uploads inside another's prefix.
   */
  it('stores an upload under the uploading tenant\'s own prefix', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/media/upload')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', png, 'photo.png')
      .expect(201);

    const key: string = res.body.data.key;
    expect(key.startsWith(`tenants/${ids['tenant-a:tenant']}/`)).toBe(true);
    expect(key).not.toContain(ids['tenant-b:tenant']);
    // The uploaded filename is not part of the key.
    expect(key).not.toContain('photo');
    expect(key.endsWith('.png')).toBe(true);

    await unlink(resolve(process.env.STORAGE_LOCAL_DIR ?? './uploads', key)).catch(() => {});
  });

  /**
   * The declared Content-Type is chosen by the uploader, so it cannot be what
   * decides a file's type. HTML served from the store's own origin is stored
   * XSS.
   */
  it('refuses an HTML file dressed up as a PNG', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/media/upload')
      .set('Host', A.host)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), {
        filename: 'not-really.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('rejects an unauthenticated upload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/media/upload')
      .set('Host', A.host)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x.jpg')
      .expect(401);
  });
});
