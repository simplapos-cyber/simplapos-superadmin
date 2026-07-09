-- Migration: Stempeluhr-System (Waiter Shifts, Breaks, Audit Log, Clock PINs)
-- Gesetzliche Grundlage: CH ArG Art. 46 + L-GAV Gastronomie

-- ─── waiter_shifts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `waiter_shifts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `restaurantId` int NOT NULL,
  `staffId` int NOT NULL,
  `startedAt` timestamp NOT NULL,
  `endedAt` timestamp,
  `durationMinutes` int,
  `breakMinutes` int NOT NULL DEFAULT 0,
  `netWorkMinutes` int,
  `status` enum('active','on_break','completed','auto_closed') NOT NULL DEFAULT 'active',
  `clockInIp` varchar(64),
  `clockInUserAgent` varchar(512),
  `clockInDeviceId` varchar(128),
  `clockOutIp` varchar(64),
  `clockOutUserAgent` varchar(512),
  `notes` text,
  `autoClosedAt` timestamp,
  `autoCloseReason` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `waiter_shifts_id` PRIMARY KEY(`id`)
);

-- ─── waiter_breaks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `waiter_breaks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `shiftId` int NOT NULL,
  `staffId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `startedAt` timestamp NOT NULL,
  `endedAt` timestamp,
  `durationMinutes` int,
  `breakType` enum('mandatory','voluntary','meal') NOT NULL DEFAULT 'voluntary',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `waiter_breaks_id` PRIMARY KEY(`id`)
);

-- ─── shift_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `shift_audit_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `restaurantId` int NOT NULL,
  `staffId` int NOT NULL,
  `shiftId` int,
  `action` enum('clock_in','clock_out','break_start','break_end','pin_failed','pin_success','auto_close','admin_edit') NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT (now()),
  `ipAddress` varchar(64),
  `userAgent` varchar(512),
  `deviceId` varchar(128),
  `details` json,
  CONSTRAINT `shift_audit_log_id` PRIMARY KEY(`id`)
);

-- ─── staff_clock_pins ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `staff_clock_pins` (
  `id` int AUTO_INCREMENT NOT NULL,
  `staffId` int NOT NULL UNIQUE,
  `restaurantId` int NOT NULL,
  `pinHash` varchar(255) NOT NULL,
  `failedAttempts` int NOT NULL DEFAULT 0,
  `lockedUntil` timestamp,
  `lastChangedAt` timestamp NOT NULL DEFAULT (now()),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `staff_clock_pins_id` PRIMARY KEY(`id`)
);
