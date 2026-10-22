import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user';
import { ConfirmReportDto } from './reports.dto';
import { ReportsService } from './reports.service';

@UseGuards(JwtGuard)
@Controller()
export class ReportsController {
  constructor(private svc: ReportsService) {}

  /** Step 1. Upload a photo or PDF for one family member. Returns the values the AI read, to be confirmed. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('profiles/:profileId/reports')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(@CurrentUser() u: string, @Param('profileId', ParseUUIDPipe) pid: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.upload(u, pid, file);
  }

  /** Step 2. Send the confirmed values. Returns statuses, reasons and Bangla explanations. */
  @Post('reports/:id/confirm')
  confirm(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmReportDto) {
    return this.svc.confirm(u, id, dto);
  }

  @Get('profiles/:profileId/reports')
  history(@CurrentUser() u: string, @Param('profileId', ParseUUIDPipe) pid: string) { return this.svc.history(u, pid); }

  @Get('profiles/:profileId/trends')
  trends(@CurrentUser() u: string, @Param('profileId', ParseUUIDPipe) pid: string, @Query('code') code?: string) {
    return this.svc.trends(u, pid, code);
  }

  @Get('reports/:id')
  get(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Get('reports/:id/summary.pdf')
  async summary(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.svc.summaryPdf(u, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="medilens-doctor-summary.pdf"' });
    res.send(pdf);
  }

  @Get('reports/:id/file')
  async file(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const f = await this.svc.file(u, id);
    res.type(f.mime).sendFile(f.path);
  }

  @Post('reports/:id/share')
  share(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.share(u, id); }

  @Delete('reports/:id/share')
  unshare(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.unshare(u, id); }

  /** Fills a demo family member with four reports over a year, for presentations. */
  @Post('demo')
  demo(@CurrentUser() u: string) { return this.svc.seedDemo(u); }

  @Delete('reports/:id')
  remove(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

/** Public, read-only: opened by a doctor from a link the patient shared. No login. */
@Controller('shared')
export class SharedController {
  constructor(private svc: ReportsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  get(@Param('token') token: string) { return this.svc.shared(token); }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token/summary.pdf')
  async pdf(@Param('token') token: string, @Res() res: Response) {
    const pdf = await this.svc.sharedPdf(token);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="medilens-summary.pdf"' });
    res.send(pdf);
  }
}
