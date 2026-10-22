import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder, Report, TestResult } from '../entities';
import { ProfilesModule } from '../profiles/profiles.module';
import { ReportsController, SharedController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Report, TestResult, Reminder]), ProfilesModule],
  controllers: [ReportsController, SharedController],
  providers: [ReportsService],
})
export class ReportsModule {}
