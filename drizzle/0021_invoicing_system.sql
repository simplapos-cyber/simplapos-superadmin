-- Migration: Erweitertes Rechnungs- und Debitorenmanagement-System
-- Schweizer QR-Rechnung, Mandate, Zahlungserinnerungen, Zahlungsbestätigungen

-- 1. invoices-Tabelle erweitern
ALTER TABLE `invoices`
  ADD COLUMN IF NOT EXISTS `mandateId` int,
  ADD COLUMN IF NOT EXISTS `taxRate` decimal(5,2) DEFAULT '8.10',
  ADD COLUMN IF NOT EXISTS `paidAmount` decimal(10,2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS `discountPercent` decimal(5,2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS `discountDays` int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `discountAmount` decimal(10,2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS `dunningFee` decimal(10,2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS `dunningLevel` int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `issueDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS `recipientName` varchar(255),
  ADD COLUMN IF NOT EXISTS `recipientEmail` varchar(255),
  ADD COLUMN IF NOT EXISTS `recipientAddress` text,
  ADD COLUMN IF NOT EXISTS `iban` varchar(34),
  ADD COLUMN IF NOT EXISTS `qrReference` varchar(27),
  ADD COLUMN IF NOT EXISTS `creditorName` varchar(255),
  ADD COLUMN IF NOT EXISTS `creditorAddress` text,
  ADD COLUMN IF NOT EXISTS `additionalInfo` varchar(140),
  ADD COLUMN IF NOT EXISTS `pdfKey` varchar(512),
  ADD COLUMN IF NOT EXISTS `creditNoteForId` int,
  ADD COLUMN IF NOT EXISTS `sentAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `lastReminderAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `internalNotes` text;

-- Status-Enum erweitern (MySQL: Tabelle neu erstellen oder MODIFY)
ALTER TABLE `invoices`
  MODIFY COLUMN `status` enum('draft','sent','reminded','dunning1','dunning2','paid','partial','overdue','cancelled','credited') NOT NULL DEFAULT 'draft';

-- 2. invoice_items-Tabelle erstellen
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `invoiceId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `description` varchar(512) NOT NULL,
  `quantity` decimal(10,3) NOT NULL DEFAULT '1.000',
  `unit` varchar(32) DEFAULT 'Stück',
  `unitPrice` decimal(10,2) NOT NULL,
  `taxRate` decimal(5,2) DEFAULT '8.10',
  `taxAmount` decimal(10,2) DEFAULT '0.00',
  `totalPrice` decimal(10,2) NOT NULL,
  `sortOrder` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. mandates-Tabelle erstellen
CREATE TABLE IF NOT EXISTS `mandates` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `restaurantId` int NOT NULL,
  `mandateNumber` varchar(64) UNIQUE,
  `status` enum('active','paused','cancelled','expired') NOT NULL DEFAULT 'active',
  `recipientName` varchar(255) NOT NULL,
  `recipientEmail` varchar(255),
  `recipientAddress` text,
  `amount` decimal(10,2) NOT NULL,
  `taxRate` decimal(5,2) DEFAULT '8.10',
  `currency` varchar(8) DEFAULT 'CHF',
  `interval` enum('weekly','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
  `iban` varchar(34),
  `creditorName` varchar(255),
  `creditorAddress` text,
  `startDate` timestamp NOT NULL,
  `endDate` timestamp NULL,
  `nextInvoiceDate` timestamp NULL,
  `lastInvoiceDate` timestamp NULL,
  `description` text,
  `lineItems` json,
  `paymentDays` int DEFAULT 30,
  `discountPercent` decimal(5,2) DEFAULT '0.00',
  `discountDays` int DEFAULT 0,
  `internalNotes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. payment_reminders-Tabelle erstellen
CREATE TABLE IF NOT EXISTS `payment_reminders` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `invoiceId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `level` int NOT NULL,
  `sentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sentTo` varchar(255),
  `fee` decimal(10,2) DEFAULT '0.00',
  `newDueDate` timestamp NULL,
  `emailSubject` varchar(512),
  `emailBody` text,
  `pdfUrl` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. payment_confirmations-Tabelle erstellen
CREATE TABLE IF NOT EXISTS `payment_confirmations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `invoiceId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `paymentDate` timestamp NOT NULL,
  `method` enum('bank_transfer','cash','card','twint','other') NOT NULL DEFAULT 'bank_transfer',
  `reference` varchar(255),
  `confirmedBy` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
