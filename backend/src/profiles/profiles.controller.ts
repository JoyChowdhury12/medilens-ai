import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user';
import { CreateProfileDto, UpdateProfileDto } from './profiles.dto';
import { ProfilesService } from './profiles.service';

@UseGuards(JwtGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private svc: ProfilesService) {}

  @Get() list(@CurrentUser() u: string) { return this.svc.list(u); }
  @Post() create(@CurrentUser() u: string, @Body() dto: CreateProfileDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProfileDto) {
    return this.svc.update(u, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
