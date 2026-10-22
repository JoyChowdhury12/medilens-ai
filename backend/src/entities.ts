import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column() email: string;
  @Column() passwordHash: string;
  @Column({ default: true }) hasPassword: boolean;
  @Index({ unique: true }) @Column({ type: 'varchar', nullable: true }) googleId: string | null;
  @Column() name: string;
  @Column({ type: 'varchar', nullable: true }) phone: string | null;
  @Column({ type: 'text', nullable: true }) avatar: string | null;
  @Column({ type: 'varchar', nullable: true }) bloodGroup: string | null;
  @Column({ type: 'varchar', nullable: true }) city: string | null;
  @Column({ type: 'varchar', nullable: true }) emergencyName: string | null;
  @Column({ type: 'varchar', nullable: true }) emergencyPhone: string | null;
  @CreateDateColumn() createdAt: Date;
  @OneToMany(() => Profile, (p) => p.user) profiles: Profile[];
}

/** One person in the family: the user, a parent, a child... */
@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() userId: string;
  @ManyToOne(() => User, (u) => u.profiles, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user: User;
  @Column() name: string;
  @Column({ default: 'self' }) relation: string;
  @Column({ type: 'varchar', nullable: true }) sex: 'male' | 'female' | null;
  @Column({ type: 'date', nullable: true }) birthDate: string | null;
  @CreateDateColumn() createdAt: Date;
  @OneToMany(() => Report, (r) => r.profile) reports: Report[];
}

/** DRAFT = AI has read the file, user has not confirmed yet. CONFIRMED = values checked and interpreted. */
@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() profileId: string;
  @ManyToOne(() => Profile, (p) => p.reports, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'profileId' }) profile: Profile;
  @Column({ default: 'DRAFT' }) status: 'DRAFT' | 'CONFIRMED';
  @Column({ type: 'varchar', nullable: true }) labName: string | null;
  @Column({ type: 'date', nullable: true }) reportDate: string | null;
  @Column() filePath: string;
  @Column() fileMime: string;
  @Column({ type: 'jsonb', nullable: true }) quality: any;
  @Column({ type: 'jsonb', nullable: true }) draft: any;
  @Column({ type: 'jsonb', nullable: true }) nextStep: any;
  @Column({ type: 'text', nullable: true }) summaryBn: string | null;
  /** cross-check notes, e.g. hemoglobin / hematocrit / MCHC that do not fit together */
  @Column({ type: 'jsonb', nullable: true }) warnings: { codes: string[]; text: string; text_bn: string }[] | null;
  /** read-only link for a doctor; valid until shareExpires */
  @Index({ unique: true }) @Column({ type: 'varchar', nullable: true }) shareToken: string | null;
  @Column({ type: 'timestamptz', nullable: true }) shareExpires: Date | null;
  @CreateDateColumn() createdAt: Date;
  @OneToMany(() => TestResult, (t) => t.report) results: TestResult[];
}

@Entity('test_results')
export class TestResult {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() reportId: string;
  @ManyToOne(() => Report, (r) => r.results, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'reportId' }) report: Report;
  @Index() @Column() code: string;
  @Column() name: string;
  @Column() nameBn: string;
  @Column({ type: 'double precision' }) value: number;
  @Column() unit: string;
  @Column({ type: 'double precision', nullable: true }) rangeLow: number | null;
  @Column({ type: 'double precision', nullable: true }) rangeHigh: number | null;
  @Column({ type: 'varchar', nullable: true }) rangeSource: string | null;
  @Column() status: 'normal' | 'borderline' | 'low' | 'high' | 'critical';
  @Column({ type: 'varchar', nullable: true }) direction: string | null;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'text' }) explanationBn: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() userId: string;
  @Column() profileId: string;
  @ManyToOne(() => Profile, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'profileId' }) profile: Profile;
  @Column() title: string;
  @Column({ type: 'date' }) dueDate: string;
  @Column({ default: false }) done: boolean;
  @Column({ type: 'varchar', nullable: true }) reportId: string | null;
  @CreateDateColumn() createdAt: Date;
}

export const ALL_ENTITIES = [User, Profile, Report, TestResult, Reminder];
