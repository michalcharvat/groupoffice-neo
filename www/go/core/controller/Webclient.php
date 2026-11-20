<?php

namespace go\core\controller;

use go\core\Controller;
use go\core\exception\Forbidden;
use go\core\jmap\exception\InvalidArguments;
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
}
