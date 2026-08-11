import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public, TenantOptional } from '../common/decorators';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Staff sign in on tenant-less admin hostnames; the JWT carries the tenant.
  @Public()
  @TenantOptional()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in as platform or tenant staff' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('customer/register')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a customer account on the current store' })
  registerCustomer(@Body() dto: RegisterDto) {
    return this.auth.registerCustomer(dto);
  }

  @Public()
  @Post('customer/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in as a customer of the current store' })
  loginCustomer(@Body() dto: LoginDto) {
    return this.auth.loginCustomer(dto);
  }

  @Public()
  @TenantOptional()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @TenantOptional()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in customer or staff member' })
  me() {
    return this.auth.me();
  }

  @Public()
  @TenantOptional()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.auth.logout(dto.refreshToken);
  }
}
