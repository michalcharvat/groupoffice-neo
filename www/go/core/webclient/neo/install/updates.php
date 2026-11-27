<?php
/**
 * Schema updates of the neo web client, run by {@see \go\core\webclient\neo\Schema::migrate()}
 *
 * Only neo_* tables, never an upstream table (docs/neo-upstream-sync.md). Never edit or reorder an entry that
 * has been committed: like GroupOffice's updates.php the version counts the queries by position.
 * An entry may run again when the process dies before its version is saved, so make it safe to rerun
 * (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).
 */

$updates = [];

$updates['202611270100'][] = "CREATE TABLE IF NOT EXISTS `neo_tasks_user_settings` (
	`userId` INT(11) NOT NULL,
	`boardGroupBy` VARCHAR(32) NULL DEFAULT NULL,
	PRIMARY KEY (`userId`),
	CONSTRAINT `neo_tasks_user_settings_user` FOREIGN KEY (`userId`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

$updates['202611271200'][] = "ALTER TABLE `neo_tasks_user_settings` ADD COLUMN IF NOT EXISTS `view` VARCHAR(16) NULL DEFAULT NULL";

// one row per module with neo updates (views/neo/install/updates.php), keyed "package/name"; core neo stays id 1, module NULL
$updates['202611271700'][] = "ALTER TABLE `neo_schema` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	ADD COLUMN IF NOT EXISTS `module` VARCHAR(201) NULL DEFAULT NULL,
	ADD UNIQUE KEY IF NOT EXISTS `module` (`module`)";
