import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretBox } from './secret-box';

/**
 * The application's key, as one injectable.
 *
 * Built once at boot with a `useFactory` rather than constructed per call site,
 * so a missing or wrong-length `CREDENTIALS_ENCRYPTION_KEY` refuses to start the
 * process. The alternative — discovering it when the first shopkeeper saves a
 * gateway key — leaves a broken deployment looking healthy.
 */
@Global()
@Module({
  providers: [
    {
      provide: SecretBox,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new SecretBox(config.getOrThrow<string>('credentials.encryptionKey')),
    },
  ],
  exports: [SecretBox],
})
export class CryptoModule {}
