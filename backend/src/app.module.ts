import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.service';
import { AuthModule } from './auth/auth.module';
import { ALL_ENTITIES } from './entities';
import { ProfilesModule } from './profiles/profiles.module';
import { RemindersModule } from './reminders/reminders.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres' as const,
        url: c.getOrThrow('DATABASE_URL'),
        entities: ALL_ENTITIES,
        // Creates/updates tables automatically. Fine for development and the capstone demo.
        // For a real production database, switch this off and use migrations.
        synchronize: c.get('DB_SYNC') !== 'false',
      }),
    }),
    AiModule, AuthModule, ProfilesModule, ReportsModule, RemindersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
