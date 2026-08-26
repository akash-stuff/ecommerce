import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { money, Money, round2 } from '../common/money';
import {
  CreateMethodDto,
  CreateZoneDto,
  ShippingQuoteDto,
  UpdateMethodDto,
  UpdateZoneDto,
} from './dto/shipping.dto';

export interface ShippingDestination {
  country: string;
  state?: string | null;
  postalCode?: string | null;
}

export interface RateQuote {
  methodId: string;
  name: string;
  zoneId: string;
  amount: Money;
  codAvailable: boolean;
  codFee: Money;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Zones -----------------------------------------------------------------

  listZones() {
    return this.prisma.db.shippingZone.findMany({
      include: { methods: { orderBy: { baseRate: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  createZone(dto: CreateZoneDto) {
    return this.prisma.db.shippingZone.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: {
        ...dto,
        countries: dto.countries?.map(upper) ?? [],
      } as unknown as Prisma.ShippingZoneCreateInput,
    });
  }

  async updateZone(id: string, dto: UpdateZoneDto) {
    await this.getZone(id);
    return this.prisma.db.shippingZone.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.countries ? { countries: dto.countries.map(upper) } : {}),
      } as Prisma.ShippingZoneUpdateInput,
    });
  }

  async removeZone(id: string): Promise<void> {
    await this.getZone(id);
    // Methods cascade with the zone; shipments reference methods, so a zone in
    // use will be refused by the FK rather than silently orphaning history.
    await this.prisma.db.shippingZone.delete({ where: { id } });
  }

  // --- Methods ---------------------------------------------------------------

  async createMethod(dto: CreateMethodDto) {
    await this.getZone(dto.zoneId); // 404s if the zone is another tenant's
    return this.prisma.db.shippingMethod.create({
      data: dto as unknown as Prisma.ShippingMethodCreateInput,
    });
  }

  async updateMethod(id: string, dto: UpdateMethodDto) {
    await this.getMethod(id);
    return this.prisma.db.shippingMethod.update({
      where: { id },
      data: dto as Prisma.ShippingMethodUpdateInput,
    });
  }

  async removeMethod(id: string): Promise<void> {
    await this.getMethod(id);
    await this.prisma.db.shippingMethod.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getMethod(id: string) {
    const method = await this.prisma.db.shippingMethod.findFirst({ where: { id } });
    if (!method) {
      throw new NotFoundException({
        message: 'That shipping method does not exist.',
        code: 'SHIPPING_METHOD_NOT_FOUND',
      });
    }
    return method;
  }

  // --- Quoting ---------------------------------------------------------------

  /**
   * Rates for a destination, cheapest first.
   *
   * Zone matching is most-specific-wins: a postal-code prefix beats a state,
   * which beats a country. Without that ordering a broad "India" zone would
   * shadow a specific "Mumbai metro" one and every customer would get the
   * national rate.
   */
  async quote(
    destination: ShippingDestination,
    goodsTotal: Money,
    totalWeightKg: Money,
  ): Promise<RateQuote[]> {
    const zones = await this.prisma.db.shippingZone.findMany({
      where: { isActive: true },
      include: { methods: { where: { isActive: true } } },
    });

    const scored = zones
      .map((zone) => ({ zone, score: matchScore(zone, destination) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return [];

    const best = scored[0].zone;

    return best.methods
      .map((method) => {
        const freeAbove = method.freeAboveAmount ? money(method.freeAboveAmount) : null;
        const isFree = freeAbove !== null && goodsTotal.greaterThanOrEqualTo(freeAbove);

        const amount = isFree
          ? money(0)
          : round2(money(method.baseRate).add(money(method.perKgRate).mul(totalWeightKg)));

        return {
          methodId: method.id,
          name: method.name,
          zoneId: best.id,
          amount,
          codAvailable: method.codAvailable,
          codFee: money(method.codFee),
          minDeliveryDays: method.minDeliveryDays,
          maxDeliveryDays: method.maxDeliveryDays,
        };
      })
      .sort((a, b) => a.amount.comparedTo(b.amount));
  }

  async quoteFromDto(dto: ShippingQuoteDto, goodsTotal: Money, weightKg: Money) {
    return this.quote(
      { country: dto.country, state: dto.state, postalCode: dto.postalCode },
      goodsTotal,
      weightKg,
    );
  }

  /**
   * Confirms at checkout that the chosen method actually serves the address, so
   * a client cannot pick the cheapest method in the store and ship anywhere.
   */
  async assertServes(methodId: string, destination: ShippingDestination) {
    const method = await this.prisma.db.shippingMethod.findFirst({
      where: { id: methodId, isActive: true },
      include: { zone: true },
    });

    if (!method) {
      throw new NotFoundException({
        message: 'That shipping method is not available.',
        code: 'SHIPPING_METHOD_NOT_FOUND',
      });
    }

    if (!method.zone.isActive || matchScore(method.zone, destination) === 0) {
      throw new BadRequestException({
        message: 'That shipping method does not deliver to this address.',
        code: 'SHIPPING_METHOD_NOT_SERVICEABLE',
      });
    }

    return method;
  }

  private async getZone(id: string) {
    const zone = await this.prisma.db.shippingZone.findFirst({ where: { id } });
    if (!zone) {
      throw new NotFoundException({
        message: 'That shipping zone does not exist.',
        code: 'SHIPPING_ZONE_NOT_FOUND',
      });
    }
    return zone;
  }
}

interface ZoneRules {
  countries: string[];
  states: string[];
  postalCodePrefixes: string[];
  isActive: boolean;
}

/** 0 = no match. Higher is more specific. Exported for tests. */
export function matchScore(zone: ZoneRules, to: ShippingDestination): number {
  const country = upper(to.country);

  // A zone listing countries must include this one; a zone listing none is global.
  if (zone.countries.length > 0 && !zone.countries.includes(country)) return 0;

  if (zone.postalCodePrefixes.length > 0) {
    const postal = (to.postalCode ?? '').replace(/\s+/g, '');
    const hit = zone.postalCodePrefixes.some(
      (prefix) => prefix.length > 0 && postal.startsWith(prefix),
    );
    return hit ? 3 : 0;
  }

  if (zone.states.length > 0) {
    const state = (to.state ?? '').trim().toLowerCase();
    const hit = zone.states.some((s) => s.trim().toLowerCase() === state);
    return hit ? 2 : 0;
  }

  return 1;
}

const upper = (value: string): string => value.trim().toUpperCase();
