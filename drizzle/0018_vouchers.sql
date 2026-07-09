-- Migration: Gutschein-System (vouchers + voucher_redemptions)

CREATE TABLE `vouchers` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `code` varchar(64) NOT NULL,
  `type` enum('fixed','percent') NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `minOrderValue` decimal(10,2),
  `maxDiscount` decimal(10,2),
  `initialBalance` decimal(10,2) NOT NULL,
  `remainingBalance` decimal(10,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'CHF',
  `status` enum('active','redeemed','partially_redeemed','expired','cancelled') NOT NULL DEFAULT 'active',
  `issuedTo` varchar(255),
  `issuedBy` int,
  `note` text,
  `validFrom` timestamp NOT NULL,
  `validUntil` timestamp,
  `maxUses` int,
  `usedCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `voucher_redemptions` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `voucherId` int NOT NULL,
  `orderId` int,
  `restaurantId` int NOT NULL,
  `redeemedBy` int,
  `amountDeducted` decimal(10,2) NOT NULL,
  `balanceBefore` decimal(10,2) NOT NULL,
  `balanceAfter` decimal(10,2) NOT NULL,
  `note` text,
  `redeemedAt` timestamp NOT NULL DEFAULT (now())
);

-- Unique constraint: code pro Restaurant eindeutig
CREATE UNIQUE INDEX `vouchers_restaurant_code_idx` ON `vouchers` (`restaurantId`, `code`);
-- Index für schnelle Suche nach Code
CREATE INDEX `vouchers_code_idx` ON `vouchers` (`code`);
-- Index für Redemptions nach Voucher
CREATE INDEX `voucher_redemptions_voucher_idx` ON `voucher_redemptions` (`voucherId`);
