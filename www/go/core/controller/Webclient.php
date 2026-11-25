<?php

namespace go\core\controller;

use go\core\Controller;
use go\core\exception\Forbidden;
use go\core\jmap\exception\InvalidArguments;
use go\core\webclient\Neo;
use go\core\webclient\OpenModules;
use go\core\webclient\Webclient as WebclientChooser;

/**
 * The user's choice between the neo and the classic webclient (docs/neo-switch.md, D2)
 */
class Webclient extends Controller {

	/**
	 * Remember the webclient for this browser (cookie GO_WEBCLIENT)
	 *
	 * Refused when $config['webclientSwitch'] is false.
	 *
	 * @apiPermission Module access: any logged-in user may choose the client of their own browser; it only sets a cookie for this browser, the classic and the neo client check permissions themselves.
	 * @param array $params ['client' => 'neo' | 'classic']
	 * @return array ['client' => string]
	 * @throws Forbidden
	 * @throws InvalidArguments
	 */
	public function setPreference(array $params): array
	{
		if (!WebclientChooser::switchAllowed()) {
			throw new Forbidden("Switching the webclient is disabled");
		}

		$client = $params['client'] ?? null;
		if ($client !== WebclientChooser::NEO && $client !== WebclientChooser::CLASSIC) {
			throw new InvalidArguments("'client' must be 'neo' or 'classic'");
		}

		WebclientChooser::setPreference($client);

		return ['client' => $client];
	}

	/**
	 * Modules of the logged-in user with a main panel in the classic client, which the neo
	 * apps menu opens there (docs/neo-switch.md, D3)
	 *
	 * @apiPermission Module access: lists only enabled modules the user may read (module ACL), with their title and classic route; the classic client checks permissions again when one opens.
	 * @apiReadOnly
	 * @return array ['list' => [['package' => ?string, 'name' => string, 'title' => string, 'route' => string], ...]]
	 */
	public function classicApps(): array
	{
		return ['list' => Neo::get()->classicApps()];
	}

	/**
	 * Store the logged-in user's last open modules (the module tabs), which the classic and the
	 * neo client open at the next login. The session returns them in 'state' ('open-modules').
	 *
	 * @apiPermission Module access: any logged-in user may store the open modules of their own account; only go_state 'open-modules' of the current user is written, the names are validated and their number limited, and both clients show only modules the user may access.
	 * @param array $params ['modules' => string[]]
	 * @return array ['modules' => string[]]
	 * @throws InvalidArguments
	 */
	public function saveOpenModules(array $params): array
	{
		$modules = OpenModules::validate($params['modules'] ?? null);
		OpenModules::save($modules);

		return ['modules' => $modules];
	}
}
