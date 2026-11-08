import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  numeric,
} from 'drizzle-orm/pg-core';

const jsonArray = <T extends unknown[]>(name: string) =>
  jsonb(name).$type<T>().notNull().default(sql\`'[]'::jsonb\`);
const jsonObject = <T extends Record<string, unknown>>(name: string) =>
  jsonb(name).$type<T>().notNull().default(sql\`'{}'::jsonb\`);

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  website: text('website').notNull(),
});

export const opportunitySourceRuns = pgTable('opportunity_source_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sourceName: text('source_name').notNull(),
  opportunityType: text('opportunity_type').notNull(),
  status: text('status').notNull().default('pending'),
  query: jsonObject<Record<string, unknown>>('query'),
  discoveredCount: integer('discovered_count').notNull().default(0),
  newCount: integer('new_count').notNull().default(0),
  duplicateCount: integer('duplicate_count').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_opportunity_source_runs_created').on(table.createdAt),
]);

export const opportunityProfiles = pgTable('opportunity_profiles', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  profileKey: text('profile_key').notNull().default('primary'),
  displayName: text('display_name').notNull().default('Primary profile'),
  skills: jsonArray<string[]>('skills'),
  experience: jsonObject<Record<string, unknown>>('experience'),
  preferences: jsonObject<Record<string, unknown>>('preferences'),
  constraints: jsonObject<Record<string, unknown>>('constraints'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('opportunity_profiles_profile_key_unique').on(table.profileKey),
]);

export const opportunityRecords = pgTable('opportunity_records', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  opportunityType: text('opportunity_type').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  externalId: text('external_id'),
  dedupeKey: text('dedupe_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  organizationName: text('organization_name'),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  location: text('location'),
  isRemote: boolean('is_remote').notNull().default(false),
  employmentType: text('employment_type'),
  compensationMin: numeric('compensation_min', { precision: 14, scale: 2 }),
  compensationMax: numeric('compensation_max', { precision: 14, scale: 2 }),
  compensationCurrency: text('compensation_currency'),
  compensationPeriod: text('compensation_period'),
  deadlineAt: timestamp('deadline_at', { withTimezone: true, mode: 'date' }),
  requiredSkills: jsonArray<string[]>('required_skills'),
  evidence: jsonArray<Array<Record<string, unknown>>>('evidence'),
  qualification: jsonObject<Record<string, unknown>>('qualification'),
  fitScore: numeric('fit_score', { precision: 5, scale: 2 }),
  verificationStatus: text('verification_status').notNull().default('unverified'),
  status: text('status').notNull().default('discovered'),
  discoveredAt: timestamp('discovered_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true, mode: 'date' }),
  appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'date' }),
  sourceRunId: bigint('source_run_id', { mode: 'number' }).references(() => opportunitySourceRuns.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('opportunity_records_dedupe_key_unique').on(table.dedupeKey),
  index('idx_opportunity_records_status_created').on(table.status, table.createdAt),
  index('idx_opportunity_records_type_created').on(table.opportunityType, table.createdAt),
  index('idx_opportunity_records_source').on(table.sourceName, table.createdAt),
  index('idx_opportunity_records_fit').on(table.fitScore),
  index('idx_opportunity_records_deadline').on(table.deadlineAt),
  index('idx_opportunity_records_source_run').on(table.sourceRunId),
]);

export const opportunityOutcomes = pgTable('opportunity_outcomes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  opportunityId: bigint('opportunity_id', { mode: 'number' }).notNull().references(() => opportunityRecords.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  notes: text('notes'),
  metadata: jsonObject<Record<string, unknown>>('metadata'),
  eventAt: timestamp('event_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_opportunity_outcomes_opportunity_event').on(table.opportunityId, table.eventAt),
  index('idx_opportunity_outcomes_type_event').on(table.eventType, table.eventAt),
]);
