CREATE TABLE `device_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`floorPlanId` int NOT NULL,
	`device` enum('desktop','tablet','phone') NOT NULL,
	`canvasWidth` int NOT NULL,
	`canvasHeight` int NOT NULL,
	`objectPositions` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_layouts_id` PRIMARY KEY(`id`)
);
