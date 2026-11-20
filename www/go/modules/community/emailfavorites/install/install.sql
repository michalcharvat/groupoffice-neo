CREATE TABLE IF NOT EXISTS `em_folders_favorites`
(
    `id`         INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId`     INT(11)          NOT NULL,
    `name`       VARCHAR(255)     NOT NULL,
    `account_id` INT(11)          NOT NULL,
    `mailbox`    VARCHAR(255)     NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `em_folders_favorites_user_id` FOREIGN KEY (`userId`) REFERENCES `core_user` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `em_folders_favorites_destroyed`
(
    `id`          INT(11) UNSIGNED NOT NULL,
    `userId`      INT(11)          NOT NULL,
    `destroyedAt` DATETIME         NOT NULL,
    PRIMARY KEY (`id`),
    KEY `em_folders_favorites_destroyed_destroyedAt` (`destroyedAt`),
    CONSTRAINT `em_folders_favorites_destroyed_user_id` FOREIGN KEY (`userId`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB;
