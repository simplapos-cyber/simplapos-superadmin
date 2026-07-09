CREATE TABLE `restaurant_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`contractId` int,
	`moduleId` varchar(64) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`status` enum('active','inactive','pending') NOT NULL DEFAULT 'active',
	`activatedAt` timestamp NOT NULL DEFAULT (now()),
	`deactivatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_modules_id` PRIMARY KEY(`id`)
);
