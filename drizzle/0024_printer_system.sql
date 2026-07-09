-- ─── BONDRUCKER ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `printers` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `type` enum('kitchen','bar','receipt','label') NOT NULL DEFAULT 'kitchen',
  `connectionType` enum('network','usb','bluetooth','cloud') NOT NULL DEFAULT 'network',
  `ipAddress` varchar(64),
  `port` int DEFAULT 9100,
  `paperWidth` enum('58mm','80mm') NOT NULL DEFAULT '80mm',
  `charsPerLine` int NOT NULL DEFAULT 48,
  `printCopies` int NOT NULL DEFAULT 1,
  `isActive` boolean NOT NULL DEFAULT true,
  `isDefault` boolean NOT NULL DEFAULT false,
  `headerLine1` varchar(128),
  `headerLine2` varchar(128),
  `footerLine1` varchar(128),
  `footerLine2` varchar(128),
  `printLogo` boolean NOT NULL DEFAULT false,
  `printQrCode` boolean NOT NULL DEFAULT false,
  `autoCut` boolean NOT NULL DEFAULT true,
  `openCashDrawer` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- ─── DRUCKER-ROUTING ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `printer_routes` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `printerId` int NOT NULL,
  `categoryId` int,
  `topCategoryId` int,
  `itemType` enum('food','drink','other'),
  `priority` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- ─── DRUCKAUFTRÄGE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `print_jobs` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `restaurantId` int NOT NULL,
  `printerId` int NOT NULL,
  `jobType` enum('kitchen_order','bar_order','receipt','reprint','test','closing') NOT NULL,
  `orderId` int,
  `tableId` int,
  `status` enum('pending','sent','printed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `payload` text,
  `errorMessage` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `printedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
