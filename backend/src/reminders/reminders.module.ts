import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user';
import { Reminder } from '../entities';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProfilesService } from '../profiles/profiles.service';
import { CreateReminderDto, UpdateReminderDto } from './reminders.dto';

@Injectable()
export class RemindersService {
  constructor(@InjectRepository(Reminder) private repo: Repository<Reminder>, private profiles: ProfilesService) {}

  list(userId: string, profileId?: string, pending?: boolean) {
    const where: any = { userId };
    if (profileId) where.profileId = profileId;
    if (pending) where.done = false;
    return this.repo.find({ where, order: { dueDate: 'ASC' } });
  }

  async create(userId: string, dto: CreateReminderDto) {
    await this.profiles.getOwned(userId, dto.profileId);
    return this.repo.save(this.repo.create({ ...dto, userId, reportId: null }));
  }

  private async owned(userId: string, id: string) {
    const r = await this.repo.findOne({ where: { id, userId } });
    if (!r) throw new NotFoundException('Reminder not found.');
    return r;
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    return this.repo.save(Object.assign(await this.owned(userId, id), dto));
  }

  async remove(userId: string, id: string) {
    await this.repo.remove(await this.owned(userId, id));
    return { deleted: true };
  }
}

@UseGuards(JwtGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private svc: RemindersService) {}
  @Get() list(@CurrentUser() u: string, @Query('profileId') pid?: string, @Query('pending') pending?: string) {
    return this.svc.list(u, pid, pending === 'true');
  }
  @Post() create(@CurrentUser() u: string, @Body() dto: CreateReminderDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReminderDto) {
    return this.svc.update(u, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Reminder]), ProfilesModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
