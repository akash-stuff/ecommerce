import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateShipmentDto, UpdateShipmentDto } from './dto/shipment.dto';
import { DEFAULT_COURIER, courierName, trackingUrlFor } from './couriers';

/**
 * Which shipment states are terminal, and which order state each implies.
 *
 * A shipment is the physical half of an order: the order says what was bought,
 * the shipment says where the parcel is. They are kept in step here rather than
 * left to whoever remembers to update both.
 */
const DELIVERED_STATES: ShipmentStatus[] = [ShipmentStatus.DELIVERED];

/** An order in these states has nothing left to dispatch. */
const UNSHIPPABLE: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];

/** States a first dispatch may advance out of. */
const PRE_SHIPMENT: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
];

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  listForOrder(orderId: string) {
    return this.prisma.db.shipment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: { method: { select: { name: true, provider: true } } },
    });
  }

  /**
   * Records a dispatch.
   *
   * Creating a shipment is what "shipped" means, so it advances the order too —
   * an order marked SHIPPED with no shipment is a parcel nobody can trace, and
   * a shipment against a cancelled order is a parcel nobody should have sent.
   */
  async create(orderId: string, dto: CreateShipmentDto) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      select: {
        id: true, orderNumber: true, status: true, customerEmail: true,
        customerPhone: true, tenantId: true, shippingMethodId: true,
      },
    });

    if (!order) {
      throw new NotFoundException({
        message: 'That order does not exist.',
        code: 'ORDER_NOT_FOUND',
      });
    }

    if (UNSHIPPABLE.includes(order.status)) {
      throw new BadRequestException({
        message: `Order ${order.orderNumber} is ${order.status.toLowerCase()} and cannot be shipped.`,
        code: 'ORDER_NOT_SHIPPABLE',
      });
    }

    const shipment = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        // tenantId is injected by the tenant-scope extension at runtime.
        data: {
          orderId,
          methodId: dto.methodId ?? order.shippingMethodId ?? null,
          provider: dto.provider ?? DEFAULT_COURIER,
          trackingNumber: dto.trackingNumber?.trim() || null,
          /**
           * Derived from the courier and the consignment number when nobody
           * typed one, so a shopkeeper who picks Delhivery and enters an AWB
           * gets a working link without knowing the URL format. An explicit
           * value always wins; see `trackingUrlFor`.
           */
          trackingUrl: trackingUrlFor(
            dto.provider ?? DEFAULT_COURIER,
            dto.trackingNumber,
            dto.trackingUrl,
          ),
          status: dto.status ?? ShipmentStatus.IN_TRANSIT,
          shippedAt: new Date(),
        } as unknown as Prisma.ShipmentCreateInput,
      });

      // Only move the order forward, never backwards: an order already
      // DELIVERED must not return to SHIPPED because a second parcel went out.
      if (PRE_SHIPMENT.includes(order.status)) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.SHIPPED, fulfillmentStatus: 'FULFILLED' },
        });
      }

      return created;
    });

    void this.audit.record({
      action: 'shipment.created',
      entityType: 'Order',
      entityId: orderId,
      changes: {
        orderNumber: order.orderNumber,
        provider: shipment.provider,
        trackingNumber: shipment.trackingNumber,
      },
    });

    await this.notifyShipped(
      order,
      shipment.provider,
      shipment.trackingNumber,
      shipment.trackingUrl,
    );

    return shipment;
  }

  async update(id: string, dto: UpdateShipmentDto) {
    const shipment = await this.prisma.db.shipment.findFirst({
      where: { id },
      include: { order: { select: { id: true, orderNumber: true, status: true } } },
    });

    if (!shipment) {
      throw new NotFoundException({
        message: 'That shipment does not exist.',
        code: 'SHIPMENT_NOT_FOUND',
      });
    }

    const nowDelivered =
      dto.status !== undefined &&
      DELIVERED_STATES.includes(dto.status) &&
      !DELIVERED_STATES.includes(shipment.status);

    /**
     * Re-derived against the merged result, not the patch.
     *
     * Changing the courier without re-deriving would leave the previous
     * carrier's link on the shipment — a working URL pointing at a company that
     * is not carrying the parcel, which is worse than no link at all. An
     * explicit URL in the same request still wins.
     */
    const provider = dto.provider ?? shipment.provider;
    const consignment =
      dto.trackingNumber !== undefined ? dto.trackingNumber : shipment.trackingNumber;
    const touchesTracking =
      dto.provider !== undefined ||
      dto.trackingNumber !== undefined ||
      dto.trackingUrl !== undefined;

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const row = await tx.shipment.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.trackingNumber !== undefined
            ? { trackingNumber: dto.trackingNumber?.trim() || null }
            : {}),
          ...(touchesTracking
            ? { trackingUrl: trackingUrlFor(provider, consignment, dto.trackingUrl) }
            : {}),
          ...(nowDelivered ? { deliveredAt: new Date() } : {}),
        },
      });

      if (nowDelivered && shipment.order.status === OrderStatus.SHIPPED) {
        await tx.order.update({
          where: { id: shipment.order.id },
          data: { status: OrderStatus.DELIVERED },
        });
      }

      return row;
    });

    void this.audit.record({
      action: 'shipment.updated',
      entityType: 'Order',
      entityId: shipment.order.id,
      changes: { orderNumber: shipment.order.orderNumber, ...dto },
    });

    return updated;
  }

  /** Best effort — a parcel that went out must not be un-shipped by a mail failure. */
  private async notifyShipped(
    order: {
      orderNumber: string;
      customerEmail: string;
      tenantId: string;
      customerPhone?: string | null;
    },
    provider: string | null,
    trackingNumber: string | null,
    trackingUrl: string | null,
  ): Promise<void> {
    try {
      const store = await this.prisma.db.store.findFirst({ select: { name: true, email: true } });

      await this.notifications.orderStatus(order.customerEmail, order.tenantId, {
        storeName: store?.name ?? 'The store',
        storeEmail: store?.email ?? order.customerEmail,
        orderNumber: order.orderNumber,
        customerName: order.customerEmail,
        status: 'SHIPPED',
        // Tracking belongs in the email that announces the dispatch, not in a
        // separate message the customer has to go looking for. The carrier is
        // named rather than coded: "DELHIVERY" is a database value, not
        // something to put in front of a shopper.
        reason: trackingNumber
          ? `${courierName(provider)} · ${trackingNumber}${trackingUrl ? ` — ${trackingUrl}` : ''}`
          : null,
      }, order.customerPhone);
    } catch {
      // Logged by the notifications service; never fatal here.
    }
  }
}
