-- 0020_trial_reminder.sql
-- Adds trialReminderSentAt column to subscriptions for idempotent 3-day trial reminder
ALTER TABLE `subscriptions` ADD COLUMN `trialReminderSentAt` timestamp NULL DEFAULT NULL;
