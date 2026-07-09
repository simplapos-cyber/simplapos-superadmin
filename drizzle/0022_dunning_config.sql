-- Migration: dunning_config Tabelle (Mahnspesen-Konfiguration pro Restaurant)
CREATE TABLE IF NOT EXISTS `dunning_config` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `graceDays` int NOT NULL DEFAULT 3,
  `dunning1Days` int NOT NULL DEFAULT 7,
  `dunning2Days` int NOT NULL DEFAULT 14,
  `dunning1Fee` decimal(10,2) NOT NULL DEFAULT '20.00',
  `dunning2Fee` decimal(10,2) NOT NULL DEFAULT '40.00',
  `interestRate` decimal(5,2) DEFAULT '5.00',
  `currency` varchar(3) NOT NULL DEFAULT 'CHF',
  `autoEnabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `dunning_config_restaurantId_unique` (`restaurantId`)
);
