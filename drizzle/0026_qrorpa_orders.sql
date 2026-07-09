-- QRorpa Bestelldaten (Passagino-Gourmet GmbH)
CREATE TABLE `qrorpa_orders` (
  `id` varchar(20) NOT NULL,
  `datum` varchar(12) NOT NULL,
  `uhrzeit` varchar(6) NOT NULL,
  `iso_datum` datetime NOT NULL,
  `wochentag` varchar(12) NOT NULL DEFAULT '',
  `woche` int NOT NULL DEFAULT 0,
  `monat` int NOT NULL,
  `monat_name` varchar(30) NOT NULL DEFAULT '',
  `quartal` int NOT NULL DEFAULT 1,
  `jahr` int NOT NULL,
  `tisch` varchar(100) NOT NULL DEFAULT '',
  `produkte` text NOT NULL,
  `mitarbeiter` varchar(100) NOT NULL DEFAULT '',
  `betrag_chf` decimal(10,2) NOT NULL DEFAULT '0.00',
  `zahlungsmethode` varchar(50) NOT NULL DEFAULT '',
  `status` varchar(50) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `qrorpa_orders_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_qrorpa_iso_datum` ON `qrorpa_orders` (`iso_datum`);
CREATE INDEX `idx_qrorpa_monat_jahr` ON `qrorpa_orders` (`monat`, `jahr`);
CREATE INDEX `idx_qrorpa_mitarbeiter` ON `qrorpa_orders` (`mitarbeiter`);
CREATE INDEX `idx_qrorpa_zahlungsmethode` ON `qrorpa_orders` (`zahlungsmethode`);
