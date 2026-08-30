import { BRAND_DEFAULTS } from '../theme/brand-defaults';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryReason,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService, ScopedTransactionClient } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { money } from '../common/money';
import { CartsService } from '../carts/carts.service';
import { CouponsService } from '../coupons/coupons.service';
import { InventoryService } from '../inventory/inventory.service';
import { ShippingService } from '../shipping/shipping.service';
import { GatewaysService } from '../payments/gateways.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { OrderEmailData } from '../notifications/templates';
import { CheckoutDto, OrderQueryDto } from './dto/order.dto';

/**
 * Which status may follow which. Anything not listed is refused, so an order
 * cannot go from DELIVERED back to PENDING because someone sent the wrong
 * request twice.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** Stock is returned to the shelf only from states where it was still held. */
const RESTOCK_ON_CANCEL: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
];

import { courierName } from '../shipping/couriers';

/**
 * What a shopper may see of a parcel.
 *
 * A select rather than `include: { shipments: true }`, because a shipment row
 * also carries `tenantId` and `methodId` — internal plumbing that has no
 * meaning to a customer and no business crossing the wire. What is here is
 * exactly what the tracking panel renders.
 */
const SHOPPER_SHIPMENT = {
  select: {
    id: true,
    provider: true,
    trackingNumber: true,
    trackingUrl: true,
    status: true,
    shippedAt: true,
    deliveredAt: true,
  },
  orderBy: { createdAt: 'desc' },
} as const;

/**
 * Adds the carrier's name to every parcel on an order.
 *
 * Resolved here rather than in the storefront, which used to keep its own copy
 * of the courier list. Two lists mean two lists that drift: adding a carrier
 * server-side would have left shoppers reading `XPRESSBEES` until somebody
 * remembered the other file. The code is still sent — it is the stable
 * identifier — and `courierName` is what the page renders.
 */
function withCourierNames<T extends { shipments?: { provider: string }[] }>(order: T): T {
  if (!order.shipments) return order;

  return {
    ...order,
    shipments: order.shipments.map((parcel) => ({
      ...parcel,
      courierName: courierName(parcel.provider),
    })),
  };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartsService,
    private readonly coupons: CouponsService,
    private readonly inventory: InventoryService,
    private readonly shipping: ShippingService,
    private readonly gateways: GatewaysService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // --- Checkout --------------------------------------------------------------

  /**
   * Turns a cart into an order.
   *
   * Everything that must be true together happens in one transaction: prices are
   * re-read, the coupon is re-validated and claimed, stock is deducted, the
   * order and its snapshotted line items are written, and the cart is emptied.
   * If any of it fails, none of it happened — no order with unpaid stock held,
   * no stock deducted for an order that was never created.
   *
   * Line items snapshot name, sku and unit price because a product may be
   * renamed or repriced later and an invoice must not change retroactively.
   */
  async checkout(cartToken: string | null, dto: CheckoutDto) {
    const cart = await this.carts.requireCart(cartToken);
    const customerId = RequestContextStore.get()?.customerId ?? null;

    const destination = {
      country: dto.shippingAddress.country,
      state: dto.shippingAddress.state,
      postalCode: dto.shippingAddress.postalCode,
    };

    // Checked before the transaction so a bad address fails fast and cheaply.
    if (dto.shippingMethodId) {
      await this.shipping.assertServes(dto.shippingMethodId, destination);
    }

    const isCod = (dto.paymentMethod ?? 'COD') === 'COD';

    /**
     * Does this store accept the method being asked for?
     *
     * Payment methods are per store now, and both are opt-in — so this can no
     * longer be assumed. Without the check, a request made outside the
     * storefront could place a cash order at a store that only takes prepaid,
     * committing stock against money that will never be collected. Checked
     * before the transaction, since it cannot change inside one.
     */
    const available = await this.gateways.availableFor();
    const accepted = isCod
      ? available.includes('COD')
      : available.some((provider) => provider !== 'COD');

    if (!accepted) {
      throw new BadRequestException({
        message: isCod
          ? 'This store does not accept cash on delivery.'
          : 'Online payment is not available at this store.',
        code: 'PAYMENT_METHOD_NOT_ACCEPTED',
      });
    }

    const order = await this.prisma.db.$transaction(
      async (tx) => {
        // Re-resolved inside the transaction: the cart may have been sitting in
        // a browser tab for an hour, and these are the prices that will be
        // charged, so they must be the ones the order is written from.
        const resolved = await this.carts.resolveLines(
          cart.id,
          cart.sessionToken,
          cart.couponCode,
          tx,
        );

        if (resolved.lines.length === 0) {
          throw new BadRequestException({
            message: 'Your cart is empty.',
            code: 'CART_EMPTY',
          });
        }

        const { totals, coupon, couponError, method } = await this.carts.price(
          resolved,
          dto.shippingMethodId ?? null,
          isCod,
        );

        // A coupon that expired between adding it and paying must not be
        // silently dropped — the total would differ from what was displayed.
        if (couponError) {
          throw new BadRequestException({
            message: couponError,
            code: 'COUPON_NO_LONGER_VALID',
          });
        }

        if (isCod && method && !method.codAvailable) {
          throw new BadRequestException({
            message: 'Cash on delivery is not available for that shipping method.',
            code: 'COD_NOT_AVAILABLE',
          });
        }

        const orderNumber = await this.nextOrderNumber(tx);
        const shippingAddress = { ...dto.shippingAddress };
        const billingAddress = dto.billingAddress ?? shippingAddress;

        const order = await tx.order.create({
          // tenantId is injected by the tenant-scope extension at runtime.
          data: {
            orderNumber,
            customerId,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            shippingTotal: totals.shippingTotal,
            grandTotal: totals.grandTotal,
            couponId: coupon?.id ?? null,
            couponCode: coupon?.code ?? null,
            customerEmail: dto.email.toLowerCase(),
            customerPhone: dto.phone ?? dto.shippingAddress.phone,
            billingAddress: billingAddress as unknown as Prisma.InputJsonValue,
            shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
            shippingMethodId: dto.shippingMethodId ?? null,
            notes: dto.notes ?? null,
            items: {
              create: totals.lines.map((line) => ({
                tenantId: RequestContextStore.requireTenantId(),
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                variantName: line.variantName,
                sku: line.sku,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                discount: line.discount,
                tax: line.tax,
                lineTotal: line.lineTotal,
              })),
            },
          } as unknown as Prisma.OrderCreateInput,
          include: { items: true },
        });

        // Stock leaves the shelf now, not on payment: two shoppers must not both
        // be able to buy the last unit while one of them finishes paying.
        await this.inventory.applyLines(
          tx,
          resolved.lines
            .filter((l) => l.trackInventory)
            .map((l) => ({
              productId: l.priced.productId,
              variantId: l.priced.variantId,
              quantity: l.priced.quantity,
            })),
          InventoryReason.SALE,
          order.orderNumber,
          'deduct',
        );

        if (coupon) {
          const full = await tx.coupon.findFirst({
            where: { id: coupon.id },
            select: { usageLimit: true },
          });
          await this.coupons.recordUsage(tx, {
            couponId: coupon.id,
            orderId: order.id,
            customerId,
            amount: totals.discountTotal,
            usageLimit: full?.usageLimit ?? null,
          });
        }

        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: isCod ? 'COD' : 'PENDING_GATEWAY',
            method: isCod ? 'COD' : null,
            status: PaymentStatus.PENDING,
            amount: totals.grandTotal,
            currency: 'INR',
          } as unknown as Prisma.PaymentCreateInput,
        });

        await this.carts.clear(tx, cart.id);

        this.logger.log(`Order ${order.orderNumber} placed for ${totals.grandTotal}`);
        return order;
      },
      // Serializable would be stricter, but the two things that can actually
      // race — stock and coupon redemption — are each guarded by a conditional
      // UPDATE, so the default level is enough and deadlocks less.
      { timeout: 15_000 },
    );

    // Sent after the commit, never inside it: an unreachable mail server must
    // not roll back a paid order, and a transaction should not be held open for
    // the length of an SMTP conversation.
    await this.sendOrderEmail(order, isCod);

    return order;
  }

  /** Best effort by design — the order is already placed and stands regardless. */
  private async sendOrderEmail(
    order: Prisma.OrderGetPayload<{ include: { items: true } }>,
    isCod: boolean,
  ): Promise<void> {
    try {
      const store = await this.prisma.db.store.findFirst({
        select: { name: true, email: true, theme: { select: { primaryColor: true } } },
      });

      const address = order.shippingAddress as unknown as OrderEmailData['shippingAddress'];

      await this.notifications.orderPlaced(order.customerEmail, order.tenantId, {
        storeName: store?.name ?? 'The store',
        storeEmail: store?.email ?? order.customerEmail,
        brandColor: store?.theme?.primaryColor ?? BRAND_DEFAULTS.PRIMARY,
        orderNumber: order.orderNumber,
        customerName: address.fullName,
        currency: order.currency,
        items: order.items.map((i) => ({
          name: i.productName,
          variantName: i.variantName,
          quantity: i.quantity,
          lineTotal: i.lineTotal.toFixed(2),
        })),
        subtotal: order.subtotal.toFixed(2),
        discountTotal: order.discountTotal.toFixed(2),
        taxTotal: order.taxTotal.toFixed(2),
        shippingTotal: order.shippingTotal.toFixed(2),
        grandTotal: order.grandTotal.toFixed(2),
        shippingAddress: address,
        paymentMethod: isCod ? 'Cash on delivery' : 'Online',
      }, order.customerPhone);
    } catch (error) {
      this.logger.error(
        `Order ${order.orderNumber} placed but its confirmation could not be sent: ${(error as Error).message}`,
      );
    }
  }

  /** Tells the customer their order moved, without letting that block the move. */
  private async sendStatusEmail(
    order: {
      orderNumber: string;
      customerEmail: string;
      tenantId: string;
      customerPhone?: string | null;
    },
    status: OrderStatus,
    reason?: string | null,
  ): Promise<void> {
    try {
      const store = await this.prisma.db.store.findFirst({
        select: { name: true, email: true },
      });

      await this.notifications.orderStatus(order.customerEmail, order.tenantId, {
        storeName: store?.name ?? 'The store',
        storeEmail: store?.email ?? order.customerEmail,
        orderNumber: order.orderNumber,
        customerName: order.customerEmail,
        status,
        reason: reason ?? null,
      }, order.customerPhone);
    } catch (error) {
      this.logger.error(`Status email for ${order.orderNumber} failed: ${(error as Error).message}`);
    }
  }

  // --- Reads -----------------------------------------------------------------

  async findAll(query: OrderQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { customerEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.order.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { placedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.order.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /** Admin view. Tenant scoping is what keeps this from being cross-tenant. */
  async findOne(id: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id },
      include: { items: true, payments: true, shipments: true },
    });
    if (!order) throw this.notFound();
    return order;
  }

  /** A customer's own orders. Scoped by tenant *and* by customer id. */
  async findMine(query: OrderQueryDto): Promise<PaginatedResult<unknown>> {
    const customerId = this.requireCustomer();

    const where: Prisma.OrderWhereInput = {
      customerId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.order.findMany({
        where,
        // Shipments come with the list, not from a second request per order:
        // the account page shows tracking on every card, and N+1 calls for it
        // would make a ten-order page eleven round trips.
        include: { items: true, shipments: SHOPPER_SHIPMENT },
        orderBy: { placedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.order.count({ where }),
    ]);

    return paginate(items.map(withCourierNames), total, query);
  }

  async findMineByNumber(orderNumber: string) {
    const customerId = this.requireCustomer();

    const order = await this.prisma.db.order.findFirst({
      where: { orderNumber, customerId },
      include: {
        items: true,
        payments: { select: { status: true, provider: true } },
        shipments: SHOPPER_SHIPMENT,
      },
    });
    if (!order) throw this.notFound();
    return withCourierNames(order);
  }

  // --- Management ------------------------------------------------------------

  async updateStatus(id: string, next: OrderStatus, reason?: string) {
    const order = await this.findOne(id);

    if (order.status === next) return order;

    if (!TRANSITIONS[order.status].includes(next)) {
      throw new ConflictException({
        message: `An order that is ${order.status.toLowerCase()} cannot become ${next.toLowerCase()}.`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    if (next === OrderStatus.CANCELLED) return this.cancel(id, reason);

    const updated = await this.prisma.db.order.update({
      where: { id },
      data: {
        status: next,
        ...(next === OrderStatus.DELIVERED ? { fulfillmentStatus: 'FULFILLED' } : {}),
      },
    });

    void this.audit.record({
      action: `order.${next.toLowerCase()}`,
      entityType: 'Order',
      entityId: id,
      changes: { from: order.status, to: next, orderNumber: updated.orderNumber },
    });

    await this.sendStatusEmail(updated, next, reason);
    return updated;
  }

  /**
   * Cancelling returns the stock it took. Doing that outside a transaction would
   * risk a cancelled order whose stock was never given back.
   */
  async cancel(id: string, reason?: string) {
    const cancelled = await this.prisma.db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id },
        include: { items: true },
      });
      if (!order) throw this.notFound();

      if (!TRANSITIONS[order.status].includes(OrderStatus.CANCELLED)) {
        throw new ConflictException({
          message: `An order that is ${order.status.toLowerCase()} can no longer be cancelled.`,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }

      if (RESTOCK_ON_CANCEL.includes(order.status)) {
        await this.inventory.applyLines(
          tx,
          order.items
            .filter((i) => i.productId !== null)
            .map((i) => ({
              productId: i.productId!,
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          InventoryReason.CANCELLATION,
          order.orderNumber,
          'restock',
        );
      }

      // The redemption is released so the customer is not billed a use for an
      // order that never happened.
      if (order.couponId) {
        await tx.coupon.updateMany({
          where: { id: order.couponId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
        await tx.couponUsage.deleteMany({
          where: { couponId: order.couponId, orderId: order.id },
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: reason ?? null,
        },
      });
    });

    void this.audit.record({
      action: 'order.cancelled',
      entityType: 'Order',
      entityId: id,
      changes: { orderNumber: cancelled.orderNumber, reason: reason ?? null },
    });

    await this.sendStatusEmail(cancelled, OrderStatus.CANCELLED, reason);
    return cancelled;
  }

  /** A customer may cancel their own order, but only while it is still early. */
  async cancelMine(orderNumber: string, reason?: string) {
    const customerId = this.requireCustomer();

    const order = await this.prisma.db.order.findFirst({
      where: { orderNumber, customerId },
      select: { id: true, status: true },
    });
    if (!order) throw this.notFound();

    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw new ForbiddenException({
        message: 'This order is already being prepared. Contact the store to cancel it.',
        code: 'CANCEL_WINDOW_PASSED',
      });
    }

    return this.cancel(order.id, reason ?? 'Cancelled by customer');
  }

  // ---------------------------------------------------------------------------

  /**
   * Human-readable and unique per tenant. Random rather than sequential so one
   * store cannot infer another's volume, and retried on the astronomically
   * unlikely collision rather than assumed unique.
   */
  private async nextOrderNumber(tx: ScopedTransactionClient): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `ORD-${today}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const clash = await tx.order.findFirst({
        where: { orderNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    throw new ConflictException({
      message: 'Could not allocate an order number. Try again.',
      code: 'ORDER_NUMBER_EXHAUSTED',
    });
  }

  private requireCustomer(): string {
    const customerId = RequestContextStore.get()?.customerId;
    if (!customerId) {
      throw new ForbiddenException({
        message: 'Sign in to view your orders.',
        code: 'NOT_A_CUSTOMER',
      });
    }
    return customerId;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: 'That order does not exist.',
      code: 'ORDER_NOT_FOUND',
    });
  }
}
