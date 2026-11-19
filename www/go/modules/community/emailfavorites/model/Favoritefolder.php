<?php

namespace go\modules\community\emailfavorites\model;

use go\core\db\Criteria;
use go\core\jmap\Entity;
use go\core\model\Acl;
use go\core\orm\Filters;
use go\core\orm\Mapping;
use go\core\orm\Query;

class Favoritefolder extends Entity
{
	public $id;
	public $userId;
	public $account_id;
	public $mailbox;
	public $name;

	protected static function defineMapping(): Mapping
	{
		return parent::defineMapping()
			->addTable('em_folders_favorites', 'eff');
	}

	protected static function defineFilters(): Filters
	{
		return parent::defineFilters()
			->add('userId', function (Criteria $criteria, $value) {
				$criteria->where('userId', '=', $value);
			});
	}

	/**
	 * Favorites are personal: only the user they belong to may see them, like internalGetPermissionLevel(). The
	 * permissionLevel filter calls it, so Favoritefolder/query doesn't return the ids of other users' favorites.
	 */
	public static function applyAclToQuery(Query $query, int $level = Acl::LEVEL_READ, int|null $userId = null, array|null $groups = null): Query
	{
		$query->andWhere('eff.userId', '=', $userId ?? go()->getUserId());
		return $query;
	}

	protected function internalGetPermissionLevel(): int
	{
		if ($this->userId == go()->getUserId()) {
			return Acl::LEVEL_MANAGE;
		} else {
			return 0;
		}
	}

	protected function canCreate(): bool
	{
		return true;
	}

	public function internalSave(): bool
	{
		return parent::internalSave();
	}
}
