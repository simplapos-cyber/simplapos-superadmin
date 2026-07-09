CREATE TABLE `advertisements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`imageUrl` text,
	`linkUrl` text,
	`targetType` enum('all','specific') NOT NULL DEFAULT 'all',
	`restaurantIds` json,
	`isActive` boolean DEFAULT true,
	`startDate` timestamp,
	`endDate` timestamp,
	`impressions` int DEFAULT 0,
	`clicks` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `advertisements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`imageUrl` text,
	`sortOrder` int DEFAULT 0,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int,
	`userId` int NOT NULL,
	`subject` varchar(255),
	`status` enum('open','ai_handled','escalated','resolved','closed') NOT NULL DEFAULT 'open',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignedTo` int,
	`lastMessageAt` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int,
	`senderType` enum('user','superadmin','ai') NOT NULL DEFAULT 'user',
	`content` text NOT NULL,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`contractType` enum('standard','referral','dropshipping','partner') NOT NULL DEFAULT 'standard',
	`partnerId` int,
	`title` varchar(255) NOT NULL,
	`status` enum('draft','sent','signed','active','expired','cancelled') NOT NULL DEFAULT 'draft',
	`startDate` timestamp,
	`endDate` timestamp,
	`monthlyFee` decimal(10,2),
	`commissionRate` decimal(5,2),
	`documentUrl` text,
	`signedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`productId` int,
	`name` varchar(128) NOT NULL,
	`price` decimal(10,2) DEFAULT '0.00',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `extras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`contractId` int,
	`invoiceNumber` varchar(64),
	`status` enum('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`amount` decimal(10,2) NOT NULL,
	`taxAmount` decimal(10,2) DEFAULT '0.00',
	`totalAmount` decimal(10,2) NOT NULL,
	`currency` varchar(8) DEFAULT 'CHF',
	`dueDate` timestamp,
	`paidAt` timestamp,
	`description` text,
	`lineItems` json,
	`pdfUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `media_library` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`category` enum('logo','category','product','advertisement','contract','other') NOT NULL DEFAULT 'other',
	`restaurantId` int,
	`uploadedBy` int,
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_library_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`categoryId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`imageUrl` text,
	`isActive` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`allergens` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `restaurant_tables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`seats` int DEFAULT 4,
	`area` varchar(64),
	`qrCode` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `restaurant_tables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(128),
	`logoUrl` text,
	`address` text,
	`city` varchar(128),
	`country` varchar(64) DEFAULT 'CH',
	`phone` varchar(32),
	`email` varchar(320),
	`website` varchar(255),
	`status` enum('active','inactive','suspended','trial') NOT NULL DEFAULT 'trial',
	`openingHours` json,
	`currency` varchar(8) DEFAULT 'CHF',
	`taxRate` decimal(5,2) DEFAULT '7.70',
	`totalRevenue` decimal(12,2) DEFAULT '0.00',
	`totalOrders` int DEFAULT 0,
	`riskScore` int DEFAULT 0,
	`ownerId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurants_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('platform','restaurant') NOT NULL DEFAULT 'restaurant',
	`restaurantId` int,
	`userId` int,
	`guestName` varchar(128),
	`rating` int NOT NULL,
	`comment` text,
	`status` enum('pending','approved','rejected','hidden') NOT NULL DEFAULT 'pending',
	`response` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('superadmin','admin','kellner','koch','buchhalter','gast','partner','user') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','inactive','suspended') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `restaurantId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);