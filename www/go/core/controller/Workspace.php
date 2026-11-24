<?php
namespace go\core\controller;

use go\core\jmap\EntityController;
use go\core\model;
use go\core\model\Acl;
use go\core\orm\Entity;
use go\core\util\ArrayObject;

/**
 * Workspaces of the neo webclient (docs/neo-workspace.md). Personal only: the ACL of every workspace gives its owner
 * manage permission and nobody else, so the ACL filters below keep other users out.
 *
 * @extends EntityController<\go\core\model\Workspace>
 */
class Workspace extends EntityController {

	protected function entityClass(): string
	{
		return model\Workspace::class;
	}

	/**
	 * Workspace/query. Creates the workspace "Default" for the authenticated user when they have none yet.
	 *
	 * @param array $params
	 * @return ArrayObject
	 */
	public function query(array $params): ArrayObject
	{
		$userId = go()->getAuthState()->getUserId();
		if ($userId && !model\Workspace::findDefaultId($userId)) {
			model\Workspace::ensureDefault($userId);
		}

		return $this->defaultQuery($params);
	}

	/**
	 * Workspace/get
	 *
	 * @param array $params
	 * @return ArrayObject
	 */
	public function get(array $params): ArrayObject
	{
		return $this->defaultGet($params);
	}

	/**
	 * Workspace/set. Send ifInState and only the changed properties (patch syntax "layouts/wide").
	 *
	 * @param array $params
	 * @return ArrayObject
	 */
	public function set(array $params): ArrayObject
	{
		return $this->defaultSet($params);
	}

	/**
	 * Workspace/changes
	 *
	 * @param array $params
	 * @return ArrayObject
	 */
	public function changes(array $params): ArrayObject
	{
		return $this->defaultChanges($params);
	}

	/**
	 * Only the owner manages a workspace (administrators through the ACL, like on every entity), and the last one of
	 * a user stays.
	 *
	 * @param Entity $entity
	 * @return bool
	 */
	protected function canDestroy(Entity $entity): bool
	{
		if (!$entity->hasPermissionLevel(Acl::LEVEL_MANAGE)) {
			return false;
		}

		/** @var model\Workspace $entity */
		$count = go()->getDbConnection()
			->selectSingleValue('count(*)')
			->from('core_workspace')
			->where('createdBy', '=', $entity->getCreatedBy())
			->single();

		return $count > 1;
	}
}
