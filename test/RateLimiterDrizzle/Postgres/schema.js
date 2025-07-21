import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const rateLimiterFlexible = pgTable('RateLimiterFlexible', {
  key: text('key').primaryKey(),
  points: integer('points').notNull(),
  expire: timestamp('expire'),
});