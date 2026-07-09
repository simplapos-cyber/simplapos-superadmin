ALTER TABLE `restaurant_modules` MODIFY COLUMN `status` enum('active','inactive','pending','trial','trial_expired','blocked') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `restaurant_modules` ADD `trialStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `restaurant_modules` ADD `trialEndsAt` timestamp;