CREATE TABLE `floor_plan_objects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`floorPlanId` int NOT NULL,
	`type` enum('table_round','table_square','table_rect','table_long','table_high','table_banquet','table_custom','bar','kitchen','cashier','buffet','reception','wall','door','window','stairs','emergency_exit','plant','divider','decoration') NOT NULL,
	`x` int NOT NULL DEFAULT 0,
	`y` int NOT NULL DEFAULT 0,
	`width` int NOT NULL DEFAULT 80,
	`height` int NOT NULL DEFAULT 80,
	`rotation` int NOT NULL DEFAULT 0,
	`label` varchar(100),
	`tableNumber` int,
	`seats` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`qrCodeEnabled` boolean NOT NULL DEFAULT false,
	`qrOrderEnabled` boolean NOT NULL DEFAULT false,
	`qrPaymentEnabled` boolean NOT NULL DEFAULT false,
	`notes` text,
	`properties` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `floor_plan_objects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `floor_plan_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`floorPlanId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`snapshot` json NOT NULL,
	`description` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `floor_plan_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `floor_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`areaName` varchar(255) NOT NULL DEFAULT 'Hauptbereich',
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`gridSize` int NOT NULL DEFAULT 20,
	`canvasWidth` int NOT NULL DEFAULT 1200,
	`canvasHeight` int NOT NULL DEFAULT 800,
	`currentVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `floor_plans_id` PRIMARY KEY(`id`)
);
