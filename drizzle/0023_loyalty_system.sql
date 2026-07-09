-- Treuepunkte-System Migration
-- loyalty_programs: Programm-Einstellungen pro Restaurant
CREATE TABLE IF NOT EXISTS `loyalty_programs` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT 'Treueprogramm',
  `isActive` boolean NOT NULL DEFAULT true,
  `pointsPerChf` decimal(6,2) NOT NULL DEFAULT '1.00',
  `pointsPerRedemptionChf` decimal(8,2) NOT NULL DEFAULT '100.00',
  `minRedemptionPoints` int NOT NULL DEFAULT 100,
  `maxRedemptionPercent` int NOT NULL DEFAULT 50,
  `welcomeBonus` int NOT NULL DEFAULT 50,
  `birthdayBonus` int NOT NULL DEFAULT 100,
  `tiers` json,
  `expiryMonths` int NOT NULL DEFAULT 24,
  `privacyText` text,
  `primaryColor` varchar(7) DEFAULT '#7c3aed',
  `logoUrl` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- loyalty_customers: Kundenkonten (DSGVO-konform)
CREATE TABLE IF NOT EXISTS `loyalty_customers` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `token` varchar(64) NOT NULL UNIQUE,
  `email` varchar(320) NOT NULL,
  `firstName` varchar(128) NOT NULL,
  `lastName` varchar(128),
  `phone` varchar(32),
  `birthMonth` int,
  `totalPoints` int NOT NULL DEFAULT 0,
  `lifetimePoints` int NOT NULL DEFAULT 0,
  `tier` enum('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
  `consentGiven` boolean NOT NULL DEFAULT false,
  `consentDate` timestamp,
  `consentIp` varchar(45),
  `marketingConsent` boolean NOT NULL DEFAULT false,
  `applePassUpdatedAt` timestamp,
  `googlePassId` varchar(255),
  `isActive` boolean NOT NULL DEFAULT true,
  `lastActivityAt` timestamp DEFAULT (now()),
  `birthdayBonusYear` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- loyalty_transactions: Punkte-Verlauf
CREATE TABLE IF NOT EXISTS `loyalty_transactions` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `customerId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `type` enum('earn','redeem','welcome_bonus','birthday_bonus','manual_add','manual_deduct','expire','refund') NOT NULL,
  `points` int NOT NULL,
  `balanceAfter` int NOT NULL,
  `orderId` int,
  `orderAmount` decimal(10,2),
  `description` varchar(255),
  `adminNote` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- loyalty_rewards: Prämien-Definitionen
CREATE TABLE IF NOT EXISTS `loyalty_rewards` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `type` enum('discount_chf','discount_percent','free_item','custom') NOT NULL,
  `pointsCost` int NOT NULL,
  `value` decimal(8,2),
  `minTier` enum('bronze','silver','gold','platinum'),
  `isActive` boolean NOT NULL DEFAULT true,
  `sortOrder` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Indizes für Performance
CREATE INDEX `idx_loyalty_customers_restaurant` ON `loyalty_customers` (`restaurantId`);
CREATE INDEX `idx_loyalty_customers_email` ON `loyalty_customers` (`restaurantId`, `email`);
CREATE INDEX `idx_loyalty_transactions_customer` ON `loyalty_transactions` (`customerId`);
CREATE INDEX `idx_loyalty_transactions_restaurant` ON `loyalty_transactions` (`restaurantId`);
CREATE INDEX `idx_loyalty_rewards_restaurant` ON `loyalty_rewards` (`restaurantId`);
