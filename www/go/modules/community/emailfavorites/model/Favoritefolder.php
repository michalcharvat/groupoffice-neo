<?php

namespace go\modules\community\emailfavorites\model;

use go\core\db\Criteria;
use go\core\jmap\Entity;
use go\core\model\Acl;
use go\core\orm\Filters;
use go\core\orm\Mapping;
use go\core\orm\Query;
use go\core\util\DateTime;

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

	/**
	 * The change log has no owner column for entities without an ACL, so Favoritefolder/changes would list the ids
	 * of every user's favorites. Only return the changes of the current user's own favorites: the ones that still
	 * exist and the destroyed ones whose owner {@see logDeleteChanges()} remembered.
	 */
	protected static function getEntityChangesQuery($sinceModSeq): Query
	{
		$userId = go()->getUserId();

		return parent::getEntityChangesQuery($sinceModSeq)
			->join('em_folders_favorites', 'eff', 'eff.id = change.entityId', 'LEFT')
			->join('em_folders_favorites_destroyed', 'effd', 'effd.id = change.entityId', 'LEFT')
			->andWhere(
				(new Criteria())
					->where('eff.userId', '=', $userId)
					->orWhere((new Criteria())->where('eff.id', '=', null)->andWhere('effd.userId', '=', $userId))
			);
	}

	/**
	 * Remembers the owners of the deleted favorites, so {@see getEntityChangesQuery()} reports a destroyed favorite
	 * only to its owner. Owners older than the sync change log ({@see \go\core\model\Settings::$syncChangesMaxAge})
	 * whose changes are gone from the log are no longer needed and are pruned here.
	 */
	protected static function logDeleteChanges(Query $query): bool
	{
		$alias = $query->getTableAlias();
		$owners = (clone $query)
			->select($alias . '.id, ' . $alias . '.userId', false)
			->select('NOW()', true);

		$db = go()->getDbConnection();
		$db->replace('em_folders_favorites_destroyed', $owners, ['id', 'userId', 'destroyedAt'])->execute();

		// Keep an owner as long as the change log still has the favorite: the garbage collection cron deletes the log
		// separately, so a client may still sync a deletion that is older than the retention.
		$expired = new DateTime();
		$expired->modify('-' . go()->getSettings()->syncChangesMaxAge . ' days');
		$db->delete('em_folders_favorites_destroyed', (new Query())
			->tableAlias('effd')
			->where('effd.destroyedAt', '<', $expired)
			->whereExists(
				(new Query())
					->select('change.id')
					->from('core_change', 'change')
					->where('change.entityTypeId', '=', static::entityType()->getId())
					->andWhere('change.entityId = effd.id'),
				true
			)
		)->execute();

		return parent::logDeleteChanges($query);
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
