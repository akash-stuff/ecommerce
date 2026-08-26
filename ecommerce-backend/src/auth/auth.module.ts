import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailOtpService } from './email-otp.service';

@Module({
  // global: the JwtAuthGuard is registered as an APP_GUARD in AppModule and
  // needs JwtService outside this module's injector.
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, EmailOtpService],
  exports: [AuthService],
})
export class AuthModule {}
