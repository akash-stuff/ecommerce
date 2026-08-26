import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService, ScopedTransactionClient } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { money, Money, round2, sum, ZERO } from '../common/money';
import { CouponsService } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { priceOrder, type CouponInput, type PricedLineInput } from '../orders/pricing';
import { AddCartItemDto, CartShippingQuoteDto } from './dto/cart.dto';

const GUEST_CART_TTL_DAYS = 30;

/** A cart line resolved against current catalogue data. */
export interface ResolvedLine {
  itemId: string;
  priced: PricedLineInput;
  available: number;
  trackInventory: boolean;
  imageUrl: string | null;
  weightGrams: number;
}

export interface ResolvedCart {
  cartId: string;
  sessionToken: string | null;
  couponCode: string | null;
  lines: ResolvedLine[];
  /** Lines dropped because the product went away, so the UI can say so. */
  removed: string[];
}

/**
 * A cart belongs either to a signed-in customer or to an anonymous session
 * token. Both live in the same table and both are tenant-scoped, so a token
 * minted at one store is meaningless at another.
 *
 * Nothing about money is stored on the cart. Totals are recomputed on every
 * read from current catalogue prices, which is what stops a cart from holding a
 * price that was true last week.
 */
@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
    private readonly shipping: ShippingService,
  ) {}

  // --- Identity --------------------------------------------------------------

  private customerId(): string | null {
    return RequestContextStore.get()?.customerId ?? null;
  }

  /**
   * Finds the caller's cart, optionally creating one. A signed-in customer's
   * cart is keyed by customer id; a guest's by the opaque token they were given
   * the first time they added something.
   */
  private async resolve(token: string | null, create: boolean) {
    const customerId = this.customerId();

    if (customerId) {
      const existing = await this.prisma.db.cart.findFirst({ where: { customerId } });
      if (existing) return existing;
      if (!create) return null;

      return this.prisma.db.cart.create({
        data: { customerId } as unknown as Prisma.CartCreateInput,
      });
    }

    if (token) {
      const existing = await this.prisma.db.cart.findFirst({
        where: { sessionToken: token },
      });
      if (existing) return existing;
    }

    if (!create) return null;

    return this.prisma.db.cart.create({
      data: {
        sessionToken: randomBytes(24).toString('base64url'),
        expiresAt: new Date(Date.now() + GUEST_CART_TTL_DAYS * 86_400_000),
      } as unknown as Prisma.CartCreateInput,
    });
  }

  // --- Reads -----------------------------------------------------------------

  /**
   * The cart as the shopper should see it.
   *
   * A shipping method may be supplied so checkout can show the real total before
   * the order is placed. It is priced here rather than added up in the browser —
   * the figure on the button and the figure charged come from one function.
   */
  async view(token: string | null, shippingMethodId?: string | null, isCod = false) {
    const cart = await this.resolve(token, false);
    if (!cart) return this.emptyView();

    const resolved = await this.resolveLines(cart.id, cart.sessionToken, cart.couponCode);
    return this.present(resolved, shippingMethodId, isCod);
  }

  /**
   * Resolves stored item rows against live catalogue rows.
   *
   * A product that has been deleted or unpublished since it was added is
   * dropped from the cart rather than priced, because the alternative is either
   * selling something that is no longer for sale or failing the whole cart.
   */
  async resolveLines(
    cartId: string,
    sessionToken: string | null,
    couponCode: string | null,
    tx?: ScopedTransactionClient,
  ): Promise<ResolvedCart> {
    const db = tx ?? this.prisma.db;

    const items = await db.cartItem.findMany({
      where: { cartId },
      include: {
        product: {
          select: {
            id: true, name: true, sku: true, price: true, taxRate: true, stock: true,
            status: true, deletedAt: true, weightGrams: true, categoryId: true,
            trackInventory: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          },
        },
        variant: {
          select: {
            id: true, name: true, sku: true, price: true, stock: true, isActive: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const lines: ResolvedLine[] = [];
    const removed: string[] = [];

    for (const item of items) {
      const p = item.product;
      const unsellable =
        !p || p.deletedAt !== null || p.status !== 'ACTIVE' ||
        (item.variantId !== null && (!item.variant || !item.variant.isActive));

      if (unsellable) {
        removed.push(p?.name ?? 'An item');
        continue;
      }

      const unitPrice = item.variant ? money(item.variant.price) : money(p.price);
      const available = item.variant ? item.variant.stock : p.stock;

      lines.push({
        itemId: item.id,
        priced: {
          productId: p.id,
          variantId: item.variantId,
          productName: p.name,
          variantName: item.variant?.name ?? null,
          sku: item.variant?.sku ?? p.sku,
          unitPrice,
          taxRate: money(p.taxRate),
          quantity: item.quantity,
          categoryId: p.categoryId,
        },
        available,
        trackInventory: p.trackInventory,
        imageUrl: item.variant?.imageUrl ?? p.images[0]?.url ?? null,
        weightGrams: p.weightGrams ?? 0,
      });
    }

    // Tidy up in the background of the read: a cart that shows five items and
    // prices four is worse than one that shows four.
    if (removed.length > 0) {
      const keep = new Set(lines.map((l) => l.itemId));
      await db.cartItem.deleteMany({
        where: { cartId, id: { notIn: [...keep] } },
      });
    }

    return { cartId, sessionToken, couponCode, lines, removed };
  }

  /**
   * Prices a resolved cart. Shared with checkout so a shopper cannot be shown
   * one total and charged another — same inputs, same function, one code path.
   */
  async price(resolved: ResolvedCart, shippingMethodId?: string | null, isCod = false) {
    const lineInputs = resolved.lines.map((l) => l.priced);
    const goodsSubtotal = round2(
      sum(lineInputs.map((l) => round2(l.unitPrice.mul(l.quantity)))),
    );

    let coupon: CouponInput | null = null;
    let couponError: string | null = null;

    if (resolved.couponCode && lineInputs.length > 0) {
      const check = await this.coupons.check(resolved.couponCode, {
        subtotal: goodsSubtotal,
        productIds: lineInputs.map((l) => l.productId),
        categoryIds: lineInputs.map((l) => l.categoryId),
        customerId: this.customerId(),
      });

      if (check.ok) coupon = check.coupon;
      else couponError = check.message;
    }

    let shippingInput = null;
    let method = null;

    if (shippingMethodId) {
      method = await this.shipping.getMethod(shippingMethodId);
      shippingInput = {
        baseRate: money(method.baseRate),
        perKgRate: money(method.perKgRate),
        freeAboveAmount: method.freeAboveAmount ? money(method.freeAboveAmount) : null,
        codFee: money(method.codFee),
        isCod: isCod && method.codAvailable,
        totalWeightKg: this.weightKg(resolved),
      };
    }

    return {
      totals: priceOrder(lineInputs, coupon, shippingInput),
      coupon,
      couponError,
      method,
    };
  }

  weightKg(resolved: ResolvedCart): Money {
    const grams = resolved.lines.reduce(
      (total, l) => total + l.weightGrams * l.priced.quantity,
      0,
    );
    return money(grams).div(1000);
  }

  // --- Mutations -------------------------------------------------------------

  async addItem(token: string | null, dto: AddCartItemDto) {
    const product = await this.prisma.db.product.findFirst({
      where: { id: dto.productId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, stock: true, trackInventory: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'That product is no longer available.',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    let available = product.stock;

    if (dto.variantId) {
      const variant = await this.prisma.db.productVariant.findFirst({
        where: { id: dto.variantId, productId: dto.productId, isActive: true },
        select: { stock: true },
      });
      if (!variant) {
        throw new NotFoundException({
          message: 'That option is no longer available.',
          code: 'VARIANT_NOT_FOUND',
        });
      }
      available = variant.stock;
    }

    const cart = (await this.resolve(token, true))!;

    // Adding the same line twice increases the quantity rather than duplicating,
    // which is also what the (cartId, productId, variantId) unique index expects.
    const existing = await this.prisma.db.cartItem.findFirst({
      where: { cartId: cart.id, productId: dto.productId, variantId: dto.variantId ?? null },
      select: { id: true, quantity: true },
    });

    const wanted = (existing?.quantity ?? 0) + dto.quantity;

    if (product.trackInventory && wanted > available) {
      throw new BadRequestException({
        message:
          available > 0
            ? `Only ${available} left in stock.`
            : 'That item is out of stock.',
        code: 'INSUFFICIENT_STOCK',
      });
    }

    if (existing) {
      await this.prisma.db.cartItem.update({
        where: { id: existing.id },
        data: { quantity: wanted },
      });
    } else {
      await this.prisma.db.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          variantId: dto.variantId ?? null,
          quantity: dto.quantity,
        } as unknown as Prisma.CartItemCreateInput,
      });
    }

    await this.touch(cart.id);
    return this.present(
      await this.resolveLines(cart.id, cart.sessionToken, cart.couponCode),
    );
  }

  /** Quantity 0 removes the line — one endpoint for both, as a UI stepper wants. */
  async setQuantity(token: string | null, itemId: string, quantity: number) {
    const cart = await this.requireCart(token);

    const item = await this.prisma.db.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: {
        product: { select: { stock: true, trackInventory: true } },
        variant: { select: { stock: true } },
      },
    });
    if (!item) throw this.itemNotFound();

    if (quantity === 0) {
      await this.prisma.db.cartItem.delete({ where: { id: item.id } });
    } else {
      const available = item.variant ? item.variant.stock : item.product.stock;
      if (item.product.trackInventory && quantity > available) {
        throw new BadRequestException({
          message: available > 0 ? `Only ${available} left in stock.` : 'That item is out of stock.',
          code: 'INSUFFICIENT_STOCK',
        });
      }
      await this.prisma.db.cartItem.update({ where: { id: item.id }, data: { quantity } });
    }

    await this.touch(cart.id);
    return this.present(
      await this.resolveLines(cart.id, cart.sessionToken, cart.couponCode),
    );
  }

  async removeItem(token: string | null, itemId: string) {
    return this.setQuantity(token, itemId, 0);
  }

  /**
   * Stores the code on the cart only if it validates now. It is re-checked on
   * every read and again at checkout, because a coupon can expire or hit its
   * limit while the cart sits there.
   */
  async applyCoupon(token: string | null, code: string) {
    const cart = await this.requireCart(token);
    const resolved = await this.resolveLines(cart.id, cart.sessionToken, cart.couponCode);

    if (resolved.lines.length === 0) {
      throw new BadRequestException({
        message: 'Add something to your cart before applying a coupon.',
        code: 'CART_EMPTY',
      });
    }

    const subtotal = round2(
      sum(resolved.lines.map((l) => round2(l.priced.unitPrice.mul(l.priced.quantity)))),
    );

    const check = await this.coupons.check(code, {
      subtotal,
      productIds: resolved.lines.map((l) => l.priced.productId),
      categoryIds: resolved.lines.map((l) => l.priced.categoryId),
      customerId: this.customerId(),
    });

    if (!check.ok) {
      throw new BadRequestException({ message: check.message, code: check.reason });
    }

    await this.prisma.db.cart.update({
      where: { id: cart.id },
      data: { couponCode: check.coupon.code },
    });

    return this.present(
      await this.resolveLines(cart.id, cart.sessionToken, check.coupon.code),
    );
  }

  async removeCoupon(token: string | null) {
    const cart = await this.requireCart(token);
    await this.prisma.db.cart.update({
      where: { id: cart.id },
      data: { couponCode: null },
    });
    return this.present(await this.resolveLines(cart.id, cart.sessionToken, null));
  }

  /**
   * Called after a guest signs in. Quantities are added rather than replaced,
   * and the guest cart is deleted so the token stops resolving.
   */
  async merge(token: string | null) {
    const customerId = this.customerId();
    if (!customerId) {
      throw new BadRequestException({
        message: 'Sign in before merging a cart.',
        code: 'NOT_A_CUSTOMER',
      });
    }
    if (!token) return this.view(null);

    const guest = await this.prisma.db.cart.findFirst({ where: { sessionToken: token } });
    if (!guest) return this.view(null);

    const mine = (await this.resolve(null, true))!;
    if (guest.id === mine.id) return this.view(null);

    const guestItems = await this.prisma.db.cartItem.findMany({ where: { cartId: guest.id } });

    for (const item of guestItems) {
      const existing = await this.prisma.db.cartItem.findFirst({
        where: { cartId: mine.id, productId: item.productId, variantId: item.variantId },
        select: { id: true, quantity: true },
      });

      if (existing) {
        await this.prisma.db.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(existing.quantity + item.quantity, 999) },
        });
      } else {
        await this.prisma.db.cartItem.create({
          data: {
            cartId: mine.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          } as unknown as Prisma.CartItemCreateInput,
        });
      }
    }

    // The guest's coupon carries over only if the customer has none.
    if (guest.couponCode && !mine.couponCode) {
      await this.prisma.db.cart.update({
        where: { id: mine.id },
        data: { couponCode: guest.couponCode },
      });
    }

    await this.prisma.db.cart.delete({ where: { id: guest.id } });

    const fresh = (await this.resolve(null, true))!;
    return this.present(
      await this.resolveLines(fresh.id, fresh.sessionToken, fresh.couponCode),
    );
  }

  async shippingOptions(token: string | null, dto: CartShippingQuoteDto) {
    const cart = await this.requireCart(token);
    const resolved = await this.resolveLines(cart.id, cart.sessionToken, cart.couponCode);
    const { totals } = await this.price(resolved);

    return this.shipping.quote(
      { country: dto.country, state: dto.state, postalCode: dto.postalCode },
      totals.subtotal.sub(totals.discountTotal),
      this.weightKg(resolved),
    );
  }

  /** Emptied after checkout, inside the same transaction that made the order. */
  async clear(tx: ScopedTransactionClient, cartId: string): Promise<void> {
    await tx.cartItem.deleteMany({ where: { cartId } });
    await tx.cart.update({ where: { id: cartId }, data: { couponCode: null } });
  }

  async requireCart(token: string | null) {
    const cart = await this.resolve(token, false);
    if (!cart) {
      throw new NotFoundException({
        message: 'Your cart is empty.',
        code: 'CART_NOT_FOUND',
      });
    }
    return cart;
  }

  // --- Presentation ----------------------------------------------------------

  /** The wire shape. Totals are always computed, never read from a column. */
  private async present(
    resolved: ResolvedCart,
    shippingMethodId?: string | null,
    isCod = false,
  ) {
    const { totals, couponError, coupon, method } = await this.price(
      resolved,
      shippingMethodId,
      isCod,
    );

    return {
      cartId: resolved.cartId,
      cartToken: resolved.sessionToken,
      itemCount: resolved.lines.reduce((n, l) => n + l.priced.quantity, 0),
      coupon: coupon ? { code: coupon.code } : null,
      couponError,
      shippingMethod: method ? { id: method.id, name: method.name } : null,
      removedItems: resolved.removed,
      items: resolved.lines.map((line, i) => ({
        id: line.itemId,
        productId: line.priced.productId,
        variantId: line.priced.variantId,
        name: line.priced.productName,
        variantName: line.priced.variantName,
        sku: line.priced.sku,
        imageUrl: line.imageUrl,
        unitPrice: totals.lines[i].unitPrice,
        quantity: line.priced.quantity,
        available: line.trackInventory ? line.available : null,
        lineSubtotal: totals.lines[i].lineSubtotal,
        discount: totals.lines[i].discount,
        tax: totals.lines[i].tax,
        lineTotal: totals.lines[i].lineTotal,
      })),
      totals: {
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        shippingTotal: totals.shippingTotal,
        grandTotal: totals.grandTotal,
      },
    };
  }

  private emptyView() {
    return {
      cartId: null,
      cartToken: null,
      itemCount: 0,
      coupon: null,
      couponError: null,
      shippingMethod: null,
      removedItems: [],
      items: [],
      totals: {
        subtotal: ZERO,
        discountTotal: ZERO,
        taxTotal: ZERO,
        shippingTotal: ZERO,
        grandTotal: ZERO,
      },
    };
  }

  private touch(cartId: string) {
    return this.prisma.db.cart.update({
      where: { id: cartId },
      data: { updatedAt: new Date() },
    });
  }

  private itemNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'That item is not in your cart.',
      code: 'CART_ITEM_NOT_FOUND',
    });
  }
}
