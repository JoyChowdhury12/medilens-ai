import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/current-user';
import { ChangePasswordDto, DeleteAccountDto, GoogleDto, LoginDto, RegisterDto, UpdateMeDto } from './auth.dto';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() userId: string) { return this.auth.me(userId); }

  @Get('config')
  config() { return this.auth.config(); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  google(@Body() dto: GoogleDto) { return this.auth.google(dto.credential); }

  @UseGuards(JwtGuard)
  @Patch('me')
  update(@CurrentUser() userId: string, @Body() dto: UpdateMeDto) { return this.auth.update(userId, dto); }

  @UseGuards(JwtGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password')
  password(@CurrentUser() userId: string, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(userId, dto); }

  @UseGuards(JwtGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('me')
  remove(@CurrentUser() userId: string, @Body() dto: DeleteAccountDto) { return this.auth.remove(userId, dto); }
}
