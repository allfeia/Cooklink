import { pgTable, uuid, text, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const jobs = pgTable('jobs', {
    id: uuid('id').primaryKey(),
    sourceUrl: text('source_url').notNull(),
    canonicalKey: varchar('canonical_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    canonicalKeyIdx: index('idx_jobs_canonical_key').on(table.canonicalKey),
}));

export const videoMetadata = pgTable('video_metadata', {
    videoId: varchar('video_id', { length: 32 }).primaryKey(),
    platform: varchar('platform', { length: 32 }).notNull(),
    title: text('title').notNull(),
    channelName: text('channel_name'),
    durationSeconds: integer('duration_seconds').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});

export const transcripts = pgTable('transcripts', {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: varchar('video_id', { length: 32 }).notNull().unique().references(() => videoMetadata.videoId),
    language: varchar('language', { length: 8 }).notNull(),
    transcriptText: text('transcript_text').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});

export const recipes = pgTable('recipes', {
    id: uuid('id').primaryKey().defaultRandom(),
    canonicalKey: varchar('canonical_key', { length: 255 }).notNull().unique(),
    recipe: jsonb('recipe').notNull(),
});
