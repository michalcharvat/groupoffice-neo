<?php

namespace go\core\webclient;

use go\core\jmap\exception\InvalidArguments;

/**
 * The user's last open modules (the module tabs of the top bar), shared by the classic and the
 * neo client (docs/neo-core-components.md, "Module tabs")
 *
 * Stored in the user's client state (table go_state, name 'open-modules') in the encoding of
 * Ext.state.Provider::encodeValue() that the classic client writes and reads (MainLayout.js
 * saveState()). Both clients get it with the session ('state' of api/jmap.php).
 */
class OpenModules {

	/** go_state name, the classic client's Ext.state id */
	public const STATE_NAME = 'open-modules';

	/** At most this many modules are stored */
	public const MAX_MODULES = 200;

	/** A module name (bookmarks as modules: 'bookmarks-<id>'): also what Ext encodes without escaping */
	private const NAME_PATTERN = '/^[A-Za-z0-9_-]{1,100}$/D';

	/**
	 * Validate the modules a client sends
	 *
	 * @param mixed $modules
	 * @return string[] without duplicates, in the given order
	 * @throws InvalidArguments
	 */
	public static function validate(mixed $modules): array
	{
		if (!is_array($modules) || !array_is_list($modules)) {
			throw new InvalidArguments("'modules' must be a list of module names");
		}
		if (count($modules) > self::MAX_MODULES) {
			throw new InvalidArguments("'modules' may hold at most " . self::MAX_MODULES . " names");
		}
		foreach ($modules as $name) {
			if (!is_string($name) || !preg_match(self::NAME_PATTERN, $name)) {
				throw new InvalidArguments("Invalid module name in 'modules'");
			}
		}

		return array_values(array_unique($modules));
	}

	/**
	 * The value Ext.state.Provider::encodeValue() gives a list of strings:
	 * escape("a:" + escape("s:" + name) joined by "^"). Module names need no escaping of their own.
	 *
	 * @param string[] $modules valid names (validate())
	 * @return string
	 */
	public static function encode(array $modules): string
	{
		return rawurlencode('a:' . implode('^', array_map(fn(string $name) => rawurlencode('s:' . $name), $modules)));
	}

	/**
	 * Store the modules as the current user's last open ones
	 *
	 * @param string[] $modules valid names (validate())
	 * @return void
	 */
	public static function save(array $modules): void
	{
		go()->getDbConnection()->replace('go_state', [
			'user_id' => go()->getUserId(),
			'name' => self::STATE_NAME,
			'value' => self::encode($modules)
		])->execute();
	}
}
