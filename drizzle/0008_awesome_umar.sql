ALTER TABLE `contracts` MODIFY COLUMN `status` enum('draft','sent','signed','active','expired','cancelled','pending_verification','rejected') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `restaurants` MODIFY COLUMN `status` enum('active','inactive','suspended','trial','pending_verification') NOT NULL DEFAULT 'pending_verification';--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantZip` varchar(10);--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantPhoneReceipt` varchar(32);--> statement-breakpoint
ALTER TABLE `contracts` ADD `restaurantVatNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyName` varchar(255);--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyAddress` text;--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyZip` varchar(10);--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyCity` varchar(128);--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyContact` varchar(255);--> statement-breakpoint
ALTER TABLE `contracts` ADD `verifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `contracts` ADD `verifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `contracts` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `zip` varchar(10);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `phoneReceipt` varchar(32);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `vatNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `companyName` varchar(255);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `companyAddress` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `companyZip` varchar(10);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `companyCity` varchar(128);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `companyPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `companyContact` varchar(255);