<?php
$updates['202603021502'][] = 'ALTER TABLE `em_folders_favorites` ADD `userId` INT(11) NOT NULL AFTER `id`;';
$updates['202603021502'][] = 'ALTER TABLE `em_folders_favorites` ADD CONSTRAINT `em_folders_favorites_user_id` FOREIGN KEY (`userId`) REFERENCES `core_user` (`id`);';
$updates['202611200400'][] = 'CREATE TABLE IF NOT EXISTS `em_folders_favorites_destroyed` (
    `id` INT(11) UNSIGNED NOT NULL,
    `userId` INT(11) NOT NULL,
    `destroyedAt` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `em_folders_favorites_destroyed_destroyedAt` (`destroyedAt`),
    CONSTRAINT `em_folders_favorites_destroyed_user_id` FOREIGN KEY (`userId`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB;';
// The change log of favorites deleted before this update has no owner, so Favoritefolder/changes no longer reports
// them. Let the clients resync their favorites instead of keeping deleted ones in their cache.
$updates['202611200400'][] = function() {
	\go\modules\community\emailfavorites\model\Favoritefolder::entityType()->resetSyncState();
};
