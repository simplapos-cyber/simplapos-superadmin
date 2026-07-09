-- Migration: HTTP Basic Auth Felder für Drucker mit Passwortschutz
ALTER TABLE `printers`
  ADD COLUMN `authUsername` VARCHAR(128) NULL AFTER `sortOrder`,
  ADD COLUMN `authPassword` VARCHAR(256) NULL AFTER `authUsername`;
