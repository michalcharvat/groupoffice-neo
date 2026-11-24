<?php
namespace go\core\model;

use Exception;
use go\core\acl\model\AclOwnerEntity;
use go\core\db\Criteria;
use go\core\exception\Forbidden;
use go\core\orm\Filters;
use go\core\orm\exception\SaveException;
use go\core\orm\Mapping;
use go\core\orm\Query;
use go\core\util\ArrayObject;
use go\core\util\DateTime;
use go\core\validate\ErrorCode;

/**
 * A named workspace of the neo webclient: the panels (module + route) of the dock in the main area and one dock
 * layout per screen profile. See docs/neo-workspace.md.
 *
 * Workspaces are personal: the server sets createdBy to the authenticated user and gives every workspace a private
 * ACL (owner manage, nobody else). The client may only write the properties in {@see self::WRITABLE}; createdBy,
 * aclId and the ACL are refused.
 */
class Workspace extends AclOwnerEntity {

	/**
	 * Properties the client may write
	 */
	const WRITABLE = ['name', 'icon', 'sortOrder', 'panels', 'layouts', 'savedPanels', 'savedLayouts'];

	/**
	 * Screen profiles with a layout of their own (the narrow profile has no workspace)
	 */
	const PROFILES = ['medium', 'wide'];

	/**
	 * Byte limit of panels, layouts and their checkpoints together
	 */
	const MAX_BYTES = 262144;

	/**
	 * Maximum number of panels in a workspace
	 */
	const MAX_PANELS = 30;

	/**
	 * Maximum length of a panel route
	 */
	const MAX_ROUTE_LENGTH = 1024;

	public ?string $id;

	protected ?int $createdBy;

	public string $name = '';

	public ?string $icon = null;

	public int $sortOrder = 0;

	protected ?string $panels = null;

	protected ?string $layouts = null;

	protected ?string $savedPanels = null;

	protected ?string $savedLayouts = null;

	public ?DateTime $modifiedAt = null;

	/**
	 * Properties the client tried to set without being allowed to
	 *
	 * @var string[]
	 */
	private array $refused = [];

	/**
	 * Layout properties set to something else than an object
	 *
	 * @var string[]
	 */
	private array $invalid = [];

	/**
	 * Owner for a workspace created by the server for another user than the authenticated one
	 */
	private ?int $ownerId = null;

	protected static function defineMapping(): Mapping
	{
		return parent::defineMapping()
			->addTable("core_workspace", 'w');
	}

	protected static function defineFilters(): Filters
	{
		return parent::defineFilters()
			->add('mine', function (Criteria $criteria, $value) {
				if ($value) {
					$criteria->where('w.createdBy', '=', go()->getAuthState()->getUserId());
				}
			});
	}

	public static function sort(Query $query, ArrayObject $sort): Query
	{
		if (!count($sort)) {
			$sort['sortOrder'] = 'ASC';
			$sort['id'] = 'ASC';
		}

		return parent::sort($query, $sort);
	}

	/**
	 * Any authenticated user may keep workspaces
	 *
	 * @return bool
	 */
	protected function canCreate(): bool
	{
		return go()->getAuthState() && go()->getAuthState()->isAuthenticated();
	}

	/**
	 * The owner of the workspace. Set by the server, read only for the client.
	 *
	 * @return int|null
	 */
	public function getCreatedBy(): ?int
	{
		return $this->createdBy;
	}

	/**
	 * True when this is the default workspace of its owner (core_user.defaultWorkspaceId)
	 *
	 * @return bool
	 */
	public function getIsDefault(): bool
	{
		if ($this->isNew() || empty($this->createdBy)) {
			return false;
		}

		return self::findDefaultId($this->createdBy) === (int) $this->id;
	}

	/**
	 * Panels: panel id => ['module' => module name, 'route' => route within the module]
	 *
	 * @return ArrayObject
	 */
	public function getPanels(): ArrayObject
	{
		return self::decodeMap($this->panels);
	}

	/**
	 * @param mixed $panels an object or null; anything else is a validation error, not a TypeError
	 */
	public function setPanels(mixed $panels): void
	{
		if (!self::isMap($panels)) {
			$this->invalid[] = 'panels';
			return;
		}

		$this->panels = self::encodeMap($panels);
	}

	/**
	 * Dock documents (schema neo.dock.zone.v1) per screen profile
	 *
	 * @return ArrayObject
	 */
	public function getLayouts(): ArrayObject
	{
		return self::decodeMap($this->layouts);
	}

	/**
	 * @param mixed $layouts an object or null; anything else is a validation error, not a TypeError
	 */
	public function setLayouts(mixed $layouts): void
	{
		if (!self::isMap($layouts)) {
			$this->invalid[] = 'layouts';
			return;
		}

		$this->layouts = self::encodeMap($layouts);
	}

	/**
	 * Checkpoint of the panels ("Save")
	 *
	 * @return ArrayObject
	 */
	public function getSavedPanels(): ArrayObject
	{
		return self::decodeMap($this->savedPanels);
	}

	/**
	 * @param mixed $panels an object or null; anything else is a validation error, not a TypeError
	 */
	public function setSavedPanels(mixed $panels): void
	{
		if (!self::isMap($panels)) {
			$this->invalid[] = 'savedPanels';
			return;
		}

		$this->savedPanels = self::encodeMap($panels);
	}

	/**
	 * Checkpoint of the layouts ("Save")
	 *
	 * @return ArrayObject
	 */
	public function getSavedLayouts(): ArrayObject
	{
		return self::decodeMap($this->savedLayouts);
	}

	/**
	 * @param mixed $layouts an object or null; anything else is a validation error, not a TypeError
	 */
	public function setSavedLayouts(mixed $layouts): void
	{
		if (!self::isMap($layouts)) {
			$this->invalid[] = 'savedLayouts';
			return;
		}

		$this->savedLayouts = self::encodeMap($layouts);
	}

	/**
	 * Workspaces are never shared: the ACL is set by the server only
	 *
	 * @param array|ArrayObject|null $acl
	 */
	public function setAcl(array|ArrayObject|null $acl): void
	{
		$this->refused[] = 'acl';
	}

	/**
	 * Only the properties in {@see self::WRITABLE} may be set through the API. Others, like createdBy, aclId and acl,
	 * are refused with a validation error, so a forged owner or ACL never takes effect.
	 *
	 * @param string $propName
	 * @param mixed $value
	 * @param bool $checkAPIRights
	 * @return static
	 */
	public function setValue(string $propName, mixed $value, bool $checkAPIRights = true): static
	{
		if ($checkAPIRights && !in_array($propName, self::WRITABLE, true)) {
			$this->refused[] = $propName;
			return $this;
		}

		parent::setValue($propName, $value, $checkAPIRights);

		return $this;
	}

	/**
	 * Creates a workspace for another user than the authenticated one (server side only)
	 *
	 * @param int $userId
	 * @return static
	 */
	public static function newFor(int $userId): static
	{
		$workspace = new static();
		$workspace->ownerId = $userId;

		return $workspace;
	}

	protected function internalValidate()
	{
		foreach (array_unique($this->refused) as $propName) {
			$this->setValidationError($propName, ErrorCode::FORBIDDEN, go()->t("This property can't be changed"));
		}

		foreach (array_unique($this->invalid) as $propName) {
			$this->setValidationError($propName, ErrorCode::INVALID_INPUT, "must be an object");
		}

		$this->name = trim($this->name);
		if ($this->name === '') {
			$this->setValidationError('name', ErrorCode::REQUIRED);
		}

		if ($this->isModified(['panels', 'layouts', 'savedPanels', 'savedLayouts'])) {
			$this->validateLayoutProperties();
		}

		parent::internalValidate();
	}

	/**
	 * Validates panels and layouts, and their checkpoints
	 */
	private function validateLayoutProperties(): void
	{
		$size = strlen($this->panels ?? '') + strlen($this->layouts ?? '') + strlen($this->savedPanels ?? '') + strlen($this->savedLayouts ?? '');
		if ($size > self::MAX_BYTES) {
			$this->setValidationError('layouts', ErrorCode::INVALID_INPUT, go()->t("The workspace is too large"));
			return;
		}

		$pairs = [
			['panels', 'layouts', $this->panels, $this->layouts],
			['savedPanels', 'savedLayouts', $this->savedPanels, $this->savedLayouts]
		];

		foreach ($pairs as [$panelsProp, $layoutsProp, $panelsJson, $layoutsJson]) {
			if (!$this->isModified([$panelsProp, $layoutsProp])) {
				continue;
			}

			$panels = self::decodeRaw($panelsJson);
			$error = is_array($panels) ? $this->validatePanels($panels, $panelsProp) : "not an object";
			if ($error !== null) {
				$this->setValidationError($panelsProp, ErrorCode::INVALID_INPUT, $error);
				continue;
			}

			$layouts = self::decodeRaw($layoutsJson);
			if (!is_array($layouts)) {
				$this->setValidationError($layoutsProp, ErrorCode::INVALID_INPUT, "not an object");
				continue;
			}

			// a profile's layout is checked when it changes; an unchanged one may still refer to a panel that was
			// closed meanwhile, the client reconciles it when the profile is shown again (docs/neo-workspace.md)
			$oldLayouts = $this->isNew() ? [] : (self::decodeRaw($this->getOldValue($layoutsProp)) ?: []);

			foreach ($layouts as $profile => $document) {
				if (!in_array($profile, self::PROFILES, true)) {
					$this->setValidationError($layoutsProp, ErrorCode::INVALID_INPUT, "Unknown profile " . $profile);
					break;
				}

				if (isset($oldLayouts[$profile]) && $oldLayouts[$profile] === $document) {
					continue;
				}

				$error = WorkspaceLayout::validate($document, array_map('strval', array_keys($panels)));
				if ($error !== null) {
					$this->setValidationError($layoutsProp, ErrorCode::INVALID_INPUT, $profile . ": " . $error);
					break;
				}
			}
		}
	}

	/**
	 * @param array $panels
	 * @param string $prop panels or savedPanels
	 * @return string|null error
	 */
	private function validatePanels(array $panels, string $prop): ?string
	{
		if (count($panels) > self::MAX_PANELS) {
			return "Too many panels";
		}

		if (!empty($panels) && array_is_list($panels)) {
			return "not an object";
		}

		// a panel that was there already keeps its module, also when the user lost access meanwhile
		$old = $this->isNew() ? [] : (self::decodeRaw($this->getOldValue($prop)) ?: []);
		$modules = [];

		foreach ($panels as $panelId => $panel) {
			if (!WorkspaceLayout::isId((string) $panelId)) {
				return "Invalid panel id";
			}

			if (!is_array($panel) || array_diff(array_keys($panel), ['module', 'route'])) {
				return "Invalid panel " . $panelId;
			}

			if (!isset($panel['module']) || !is_string($panel['module']) || !preg_match('/^[a-z0-9_]{1,100}(-[0-9]{1,20})?$/i', $panel['module'])) {
				return "Invalid module of panel " . $panelId;
			}

			if (isset($panel['route']) && (!is_string($panel['route']) || mb_strlen($panel['route']) > self::MAX_ROUTE_LENGTH)) {
				return "Invalid route of panel " . $panelId;
			}

			// one module in at most one panel per window (docs/neo-workspace.md)
			if (isset($modules[$panel['module']])) {
				return "Module " . $panel['module'] . " is in more than one panel";
			}
			$modules[$panel['module']] = true;

			if (($old[$panelId]['module'] ?? null) !== $panel['module'] && !self::mayUseModule($panel['module'])) {
				return "No access to module " . $panel['module'];
			}
		}

		return null;
	}

	/**
	 * Whether the current user has access to an enabled module of this name (any package)
	 *
	 * @param string $name
	 * @return bool
	 */
	private static function mayUseModule(string $name): bool
	{
		// "bookmarks-42": a bookmark opened as a module (bookmarks module, views/neo/Index.mjs)
		$name = explode('-', $name, 2)[0];

		$modules = Module::find(['id', 'package', 'name', 'enabled'])
			->where(['name' => $name, 'enabled' => true])
			->all();

		foreach ($modules as $module) {
			if ($module->getUserRights()->mayRead) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Personal only: the owner (and an administrator) has access, whatever the ACL holds. A default grant
	 * of the entity type applied to all ACLs (Acl controller, reset) must not share a workspace.
	 *
	 * @return int
	 */
	protected function internalGetPermissionLevel(): int
	{
		if ($this->isNew()) {
			return parent::internalGetPermissionLevel();
		}

		$auth = go()->getAuthState();
		if (!$auth || !$auth->isAuthenticated()) {
			return 0;
		}

		if (!$auth->isAdmin() && (int) $this->createdBy !== (int) $auth->getUserId()) {
			return 0;
		}

		return parent::internalGetPermissionLevel();
	}

	/**
	 * The ACL, and the owner unless the user is an administrator (see internalGetPermissionLevel())
	 *
	 * @param Query $query
	 * @param int $level
	 * @param int|null $userId
	 * @param array|null $groups
	 * @return Query
	 */
	public static function applyAclToQuery(Query $query, int $level = Acl::LEVEL_READ, int|null $userId = null, array|null $groups = null): Query
	{
		parent::applyAclToQuery($query, $level, $userId, $groups);

		$userId ??= go()->getAuthState()?->getUserId();
		if (!$userId || !User::isAdminById($userId)) {
			$query->andWhere('w.createdBy', '=', (int) $userId);
		}

		return $query;
	}

	protected function internalSave(): bool
	{
		if ($this->isNew()) {
			// the authenticated user owns the workspace; a private ACL, not a copy of the entity type's default ACL
			$this->createdBy = $this->ownerId ?? go()->getAuthState()->getUserId();
			$this->setAcl = [];
		}

		return parent::internalSave();
	}

	/**
	 * Deleting the default workspace makes the first remaining one the default; deleting the last one is refused.
	 *
	 * @param Query $query
	 * @return bool
	 * @throws Exception
	 */
	protected static function internalDelete(Query $query): bool
	{
		$rows = go()->getDbConnection()
			->select('w.id, w.createdBy')
			->from('core_workspace', 'w')
			->where('w.id', 'IN', $query)
			->all();

		$deleted = [];
		foreach ($rows as $row) {
			$deleted[(int) $row['createdBy']][] = (int) $row['id'];
		}

		foreach ($deleted as $userId => $ids) {
			$remaining = go()->getDbConnection()
				->selectSingleValue('id')
				->from('core_workspace')
				->where('createdBy', '=', $userId)
				->andWhere('id', 'NOT IN', $ids)
				->orderBy(['sortOrder' => 'ASC', 'id' => 'ASC'])
				->single();

			if (!$remaining) {
				throw new Forbidden(go()->t("The last workspace can't be deleted"));
			}

			if (in_array(self::findDefaultId($userId), $ids, true)) {
				self::setDefaultId($userId, (int) $remaining);
			}
		}

		return parent::internalDelete($query);
	}

	/**
	 * The default workspace id of a user, if it still exists
	 *
	 * @param int $userId
	 * @return int|null
	 */
	public static function findDefaultId(int $userId): ?int
	{
		$id = go()->getDbConnection()
			->selectSingleValue('u.defaultWorkspaceId')
			->from('core_user', 'u')
			->join('core_workspace', 'w', 'w.id = u.defaultWorkspaceId AND w.createdBy = u.id')
			->where('u.id', '=', $userId)
			->single();

		return $id ? (int) $id : null;
	}

	/**
	 * @param int $userId
	 * @param int $workspaceId
	 */
	private static function setDefaultId(int $userId, int $workspaceId): void
	{
		go()->getDbConnection()
			->update('core_user', ['defaultWorkspaceId' => $workspaceId], ['id' => $userId])
			->execute();
	}

	/**
	 * Creates the workspace "Default" for a user who has none. Runs in one transaction that locks the user's row, so
	 * two windows opening at once create one workspace.
	 *
	 * @param int $userId
	 * @return int the default workspace id
	 * @throws Exception
	 */
	public static function ensureDefault(int $userId): int
	{
		$db = go()->getDbConnection();
		$db->beginTransaction();

		try {
			// serializes concurrent first opens of the same user
			$db->selectSingleValue('id')->from('core_user')->where('id', '=', $userId)->forUpdate()->single();

			$defaultId = self::findDefaultId($userId);

			if (!$defaultId) {
				$defaultId = $db->selectSingleValue('id')
					->from('core_workspace')
					->where('createdBy', '=', $userId)
					->orderBy(['sortOrder' => 'ASC', 'id' => 'ASC'])
					->single();

				if (!$defaultId) {
					$workspace = self::newFor($userId);
					$workspace->name = go()->t("Default");
					if (!$workspace->save()) {
						throw new SaveException($workspace);
					}
					$defaultId = $workspace->id;
				}

				$defaultId = (int) $defaultId;
				self::setDefaultId($userId, $defaultId);
			}

			$db->commit();
		} catch (Exception $e) {
			$db->rollBack();
			throw $e;
		}

		return $defaultId;
	}

	/**
	 * @param string|null $json
	 * @return ArrayObject
	 */
	private static function decodeMap(?string $json): ArrayObject
	{
		$value = self::decodeRaw($json);
		$map = new ArrayObject(is_array($value) ? $value : []);
		$map->serializeJsonAsObject = true;

		return $map;
	}

	/**
	 * @param string|null $json
	 * @return mixed null for empty, false for invalid JSON
	 */
	private static function decodeRaw(?string $json): mixed
	{
		if ($json === null || $json === '') {
			return [];
		}

		try {
			return json_decode($json, true, 64, JSON_THROW_ON_ERROR);
		} catch (\JsonException) {
			return false;
		}
	}

	/**
	 * Encodes a map, leaving out keys set to null (JMAP patch "layouts/wide": null removes the profile)
	 *
	 * @param array|ArrayObject|null $map
	 * @return string|null
	 */
	private static function isMap(mixed $value): bool
	{
		return $value === null || $value instanceof ArrayObject || (is_array($value) && (empty($value) || !array_is_list($value)));
	}

	private static function encodeMap(array|ArrayObject|null $map): ?string
	{
		if ($map === null) {
			return null;
		}

		$map = $map instanceof ArrayObject ? $map->getArray() : $map;
		$map = array_filter($map, fn($v) => $v !== null);

		return empty($map) ? null : json_encode((object) $map, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
	}
}
