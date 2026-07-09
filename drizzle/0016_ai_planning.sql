-- Migration 0016: KI-Personalplanung, Abwesenheiten, Verfügbarkeit
-- Erstellt: staff_absences, ai_shift_plans, ai_plan_shifts, staff_availability

CREATE TABLE IF NOT EXISTS `staff_absences` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `staffId` int NOT NULL,
  `type` enum('vacation','sick','personal','unpaid','other') NOT NULL,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `startDate` varchar(10) NOT NULL,
  `endDate` varchar(10) NOT NULL,
  `totalDays` int NOT NULL,
  `reason` text,
  `adminNote` text,
  `approvedBy` int,
  `approvedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `ai_shift_plans` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `weekStart` varchar(10) NOT NULL,
  `weekEnd` varchar(10) NOT NULL,
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `aiModel` varchar(100),
  `aiReasoning` text,
  `inputData` json,
  `totalStaffHours` decimal(8,2),
  `estimatedCost` decimal(10,2),
  `createdBy` int NOT NULL,
  `publishedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `ai_plan_shifts` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `planId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `staffId` int,
  `staffName` varchar(255),
  `role` varchar(64) NOT NULL,
  `date` varchar(10) NOT NULL,
  `startTime` varchar(5) NOT NULL,
  `endTime` varchar(5) NOT NULL,
  `breakMinutes` int NOT NULL DEFAULT 0,
  `netHours` decimal(4,2) NOT NULL,
  `aiNote` text,
  `priority` enum('essential','recommended','optional') NOT NULL DEFAULT 'recommended',
  `confirmedByStaff` boolean NOT NULL DEFAULT false,
  `confirmedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS `staff_availability` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `staffId` int NOT NULL,
  `dayOfWeek` int NOT NULL,
  `availableFrom` varchar(5),
  `availableTo` varchar(5),
  `isAvailable` boolean NOT NULL DEFAULT true,
  `maxHoursPerDay` decimal(4,2),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
