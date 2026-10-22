import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../entities';
import { CreateProfileDto, UpdateProfileDto } from './profiles.dto';

@Injectable()
export class ProfilesService {
  constructor(@InjectRepository(Profile) private repo: Repository<Profile>) {}

  list(userId: string) { return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } }); }

  create(userId: string, dto: CreateProfileDto) {
    return this.repo.save(this.repo.create({ ...dto, userId, sex: dto.sex ?? null, birthDate: dto.birthDate ?? null }));
  }

  /** Every other service uses this, so one user can never touch another user's family data. */
  async getOwned(userId: string, id: string) {
    const p = await this.repo.findOne({ where: { id, userId } });
    if (!p) throw new NotFoundException('Profile not found.');
    return p;
  }

  async update(userId: string, id: string, dto: UpdateProfileDto) {
    const p = await this.getOwned(userId, id);
    return this.repo.save(Object.assign(p, dto));
  }

  async remove(userId: string, id: string) {
    const p = await this.getOwned(userId, id);
    await this.repo.remove(p);
    return { deleted: true };
  }
}
