CREATE TABLE `hardware_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('tablet','drucker','monitor','zubehoer') NOT NULL DEFAULT 'tablet',
	`price` decimal(10,2) NOT NULL,
	`imageUrl` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hardware_products_id` PRIMARY KEY(`id`)
);
