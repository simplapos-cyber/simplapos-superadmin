CREATE TABLE `activation_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`email` varchar(320) NOT NULL,
	`userId` int,
	`contractId` int,
	`restaurantId` int,
	`usedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activation_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `activation_tokens_token_unique` UNIQUE(`token`)
);
