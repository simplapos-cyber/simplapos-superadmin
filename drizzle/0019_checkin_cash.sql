-- Migration 0019: Check-in/Check-out Bargeld-Tracking
-- Neue Felder für Kellner-Bargeld, Trinkgeld und Rollen-basiertes Check-in

ALTER TABLE `waiter_shifts`
  ADD COLUMN `cashStart` DECIMAL(10,2) NULL COMMENT 'Startbargeld beim Check-in (CHF)',
  ADD COLUMN `cashEnd` DECIMAL(10,2) NULL COMMENT 'Endbargeld beim Check-out (CHF)',
  ADD COLUMN `tipAmount` DECIMAL(10,2) NULL COMMENT 'Berechnetes Trinkgeld (cashEnd - cashStart - cashRevenue)',
  ADD COLUMN `cashRevenue` DECIMAL(10,2) NULL COMMENT 'Barzahlungen dieser Schicht aus orders',
  ADD COLUMN `totalRevenue` DECIMAL(10,2) NULL COMMENT 'Gesamtumsatz dieser Schicht',
  ADD COLUMN `staffRole` VARCHAR(32) NULL COMMENT 'Rolle beim Check-in (kellner/admin/koch)',
  ADD COLUMN `pinless` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'PIN-freier Check-in für admin/koch';
