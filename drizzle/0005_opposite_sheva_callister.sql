CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` int NOT NULL,
	`restaurantId` int NOT NULL,
	`stripePaymentIntentId` varchar(255),
	`stripeInvoiceId` varchar(255),
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(8) DEFAULT 'CHF',
	`status` enum('pending','succeeded','failed','refunded') NOT NULL DEFAULT 'pending',
	`description` text,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`contractId` int,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`status` enum('pending','active','past_due','blocked','cancelled') NOT NULL DEFAULT 'pending',
	`billingCycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`monthlyAmount` decimal(10,2) NOT NULL,
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`gracePeriodEnd` timestamp,
	`reminderSentAt` timestamp,
	`dueDayNotifiedAt` timestamp,
	`blockedNotifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
