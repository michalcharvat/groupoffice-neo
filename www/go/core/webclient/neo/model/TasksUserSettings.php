<?php

namespace go\core\webclient\neo\model;

use go\core\orm\Mapping;
use go\core\orm\Property;

/**
 * Tasks settings of the neo web client per user, User property neoTasksSettings
 *
 * In table neo_tasks_user_settings, so the upstream tasks_user_settings stays untouched. A user without a row gets
 * the defaults; the row is inserted when the user saves a change.
 */
class TasksUserSettings extends Property {

	/**
	 * Primary key to User id
	 */
	public ?int $userId;

	/**
	 * Property the tasks board groups its columns by, null for the client's default
	 */
	public ?string $boardGroupBy = null;

	/**
	 * View of the tasks main panel, "list" or "board", null for the list
	 */
	public ?string $view = null;

	protected static function defineMapping(): Mapping
	{
		return parent::defineMapping()->addTable("neo_tasks_user_settings", "ntus");
	}
}
