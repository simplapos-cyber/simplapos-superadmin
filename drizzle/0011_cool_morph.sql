CREATE TABLE `ai_insights_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`insights` json NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_insights_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`currentStock` decimal(10,2) DEFAULT '0',
	`minStock` decimal(10,2) DEFAULT '0',
	`unit` varchar(32) DEFAULT 'Stk',
	`category` varchar(64),
	`costPerUnit` decimal(10,2) DEFAULT '0.00',
	`lastRestocked` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int,
	`name` varchar(255) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(10,2) NOT NULL,
	`totalPrice` decimal(10,2) NOT NULL,
	`notes` text,
	`status` enum('pending','preparing','ready','served','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`tableId` int,
	`staffId` int,
	`orderNumber` varchar(32),
	`status` enum('pending','preparing','ready','served','paid','cancelled') NOT NULL DEFAULT 'pending',
	`type` enum('dine_in','takeaway','delivery') NOT NULL DEFAULT 'dine_in',
	`subtotal` decimal(10,2) DEFAULT '0.00',
	`taxAmount` decimal(10,2) DEFAULT '0.00',
	`tipAmount` decimal(10,2) DEFAULT '0.00',
	`totalAmount` decimal(10,2) DEFAULT '0.00',
	`paymentMethod` enum('cash','card','twint','online','invoice'),
	`paidAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
