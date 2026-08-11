import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    await seedTwoTenants();
  });

  afterAll(async () => {
    await prisma.runUnscoped(async (db) => {
      await db.tenant.deleteMany({ where: { slug: { in: [A.slug, B.slug] } } });
      await db.user.deleteMany({
        where: { email: { in: [`owner@${A.slug}.test`, `owner@${B.slug}.test`] } },
      });
    });
    // The hostname->tenant cache outlives the data. Leaving it populated makes
    // the next run resolve these hosts to tenants that no longer exist.
    await app.get(TenantResolverService).invalidate([A.host, B.host]);
    await app.close();
  });

  async function seedTwoTenants() {
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
          },
        });
        ids[`${t.slug}:product`] = product.id;

        // Same email registered at both stores — two unrelated accounts.
        const customer = await db.customer.create({
          data: {
            tenantId: tenant.id,
            email: 'shopper@example.com',
            firstName: 'Sam',
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
});
