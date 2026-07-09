CREATE TABLE `verification_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`code` varchar(6) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contracts` MODIFY COLUMN `restaurantId` int;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `status` enum('active','inactive','suspended','pending') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `contracts` ADD `plan` enum('starter','growth','ecosystem','modular') DEFAULT 'modular' NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD `billingCycle` enum('monthly','yearly') DEFAULT 'yearly' NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantName` varchar(255);--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantAddress` text;--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantCity` varchar(128);--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `contracts` ADD `numEmployees` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `contracts` ADD `numTables` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `contracts` ADD `numPosTerminals` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `contracts` ADD `numKdsScreens` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contracts` ADD `features` json;--> statement-breakpoint
ALTER TABLE `contracts` ADD `employees` json;--> statement-breakpoint
ALTER TABLE `contracts` ADD `basePriceMonthly` decimal(10,2);--> statement-breakpoint
ALTER TABLE `contracts` ADD `addOnsMonthly` decimal(10,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `contracts` ADD `setupFee` decimal(10,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `contracts` ADD `signedByName` varchar(255);--> statement-breakpoint
ALTER TABLE `contracts` ADD `signedByEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `contracts` ADD `createdByUserId` int;--> statement-breakpoint
ALTER TABLE `contracts` ADD `createdByName` varchar(255);--> statement-breakpoint
ALTER TABLE `contracts` ADD `createdByType` enum('partner','online','superadmin') DEFAULT 'partner' NOT NULL;