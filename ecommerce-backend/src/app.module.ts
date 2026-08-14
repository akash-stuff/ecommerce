import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';

import { PrismaModule } from './common/prisma/prisma.module';
import { CacheModule } from './common/cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryModule } from './inventory/inventory.module';
import { CartsModule } from './carts/carts.module';
import { CouponsModule } from './coupons/coupons.module';
import { ShippingModule } from './shipping/shipping.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StoresModule } from './stores/stores.module';
import { ThemeModule } from './theme/theme.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DomainsModule } from './domains/domains.module';
import { CustomersModule } from './customers/customers.module';
import { SeoModule } from './seo/seo.module';
import { AuditModule } from './audit/audit.module';
import { PlansModule } from './plans/plans.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { PagesModule } from './pages/pages.module';
import { HealthModule } from './health/health.module';

import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttlMs', 60_000),
          limit: config.get<number>('throttle.limit', 120),
        },
      ],
    }),
    PrismaModule,
    CacheModule,
    NotificationsModule,
    AuditModule,
    PlansModule,
    WishlistModule,
    PagesModule,
    TenantsModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    InventoryModule,
    CouponsModule,
    ShippingModule,
    CartsModule,
    OrdersModule,
    PaymentsModule,
    StoresModule,
    ThemeModule,
    ReviewsModule,
    AnalyticsModule,
    DomainsModule,
    CustomersModule,
    SeoModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle, authenticate, require a tenant, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
