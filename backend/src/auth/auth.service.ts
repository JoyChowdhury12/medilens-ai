import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Profile, User } from '../entities';
import { randomBytes } from 'crypto';
import { ChangePasswordDto, DeleteAccountDto, LoginDto, RegisterDto, UpdateMeDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Profile) private profiles: Repository<Profile>,
    private jwt: JwtService,
  ) {}

  private publicUser(u: User) {
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, avatar: u.avatar, bloodGroup: u.bloodGroup, city: u.city, emergencyName: u.emergencyName, emergencyPhone: u.emergencyPhone, hasPassword: u.hasPassword, google: !!u.googleId, createdAt: u.createdAt };
  }
  private token(u: User) { return this.jwt.sign({ sub: u.id }); }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.findOne({ where: { email } })) throw new ConflictException('This email is already registered.');
    const user = await this.users.save(
      this.users.create({ name: dto.name.trim(), email, passwordHash: await bcrypt.hash(dto.password, 10) }),
    );
    // Every new account starts with a "self" profile so the user can upload right away.
    await this.profiles.save(this.profiles.create({ userId: user.id, name: user.name, relation: 'self' }));
    return { token: this.token(user), user: this.publicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    // Same message for wrong email and wrong password, so nobody can probe which emails exist.
    if (!user || !user.hasPassword || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password.');
    }
    return { token: this.token(user), user: this.publicUser(user) };
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Please log in again.'); // e.g. account was deleted
    return this.publicUser(user);
  }

  config() { return { googleClientId: process.env.GOOGLE_CLIENT_ID || null }; }

  async update(userId: string, dto: UpdateMeDto) {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (dto.name !== undefined) {
      user.name = dto.name.trim();
      // the "self" family member carries the same name
      await this.profiles.update({ userId, relation: 'self' }, { name: user.name });
    }
    const clean = (v: string) => v.trim() || null;
    if (dto.phone !== undefined) user.phone = clean(dto.phone);
    if (dto.bloodGroup !== undefined) user.bloodGroup = dto.bloodGroup || null;
    if (dto.city !== undefined) user.city = clean(dto.city);
    if (dto.emergencyName !== undefined) user.emergencyName = clean(dto.emergencyName);
    if (dto.emergencyPhone !== undefined) user.emergencyPhone = clean(dto.emergencyPhone);
    if (dto.avatar !== undefined) user.avatar = dto.avatar;
    await this.users.save(user);
    return this.publicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (user.hasPassword) {
      if (!dto.currentPassword || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
        throw new BadRequestException('Your current password is not correct.');
      }
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.hasPassword = true;
    await this.users.save(user);
    return { ok: true, user: this.publicUser(user) };
  }

  async remove(userId: string, dto: DeleteAccountDto) {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (user.hasPassword && !(await bcrypt.compare(dto.password || '', user.passwordHash))) {
      throw new BadRequestException('Password is not correct.');
    }
    await this.users.delete(user.id); // profiles, reports, results, reminders go with it (cascade)
    return { ok: true };
  }

  /** Sign in with Google: the browser gives us a signed ID token; Google confirms it is genuine. */
  async google(credential: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not set up on this server.');
    let info: any;
    try {
      const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
      if (!res.ok) throw new Error('bad token');
      info = await res.json();
    } catch {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
    if (info.aud !== clientId || !info.sub || !info.email || String(info.email_verified) !== 'true') {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
    const email = String(info.email).toLowerCase();
    let user = await this.users.findOne({ where: { googleId: info.sub } }) || await this.users.findOne({ where: { email } });
    if (user) {
      if (!user.googleId) user.googleId = info.sub; // link an existing email account
      await this.users.save(user);
    } else {
      user = await this.users.save(this.users.create({
        email, googleId: info.sub, name: String(info.name || email.split('@')[0]).slice(0, 80),
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10), hasPassword: false,
      }));
      await this.profiles.save(this.profiles.create({ userId: user.id, name: user.name, relation: 'self' }));
    }
    return { token: this.token(user), user: this.publicUser(user) };
  }
}
