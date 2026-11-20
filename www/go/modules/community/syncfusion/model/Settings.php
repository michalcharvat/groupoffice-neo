<?php

namespace go\modules\community\syncfusion\model;

use go\core;

class Settings extends core\Settings
{
	/**
	 * @var string
	 */
	public $licenseKey = '';

	/**
	 * @var string
	 */
	public $documentServiceUrl = '';

	/**
	 * @var string
	 */
	public $spreadsheetServiceUrl = '';

	/**
	 * Library source: 'cdn' or 'local'
	 *
	 * @var string
	 */
	public $librarySource = 'cdn';

	/**
	 * CDN base URL including version, e.g. "https://cdn.syncfusion.com/ej2/32.1.19/"
	 *
	 * @var string
	 */
	public $cdnUrl = 'https://cdn.syncfusion.com/ej2/32.1.19/';

	/**
	 * Shared secret for JWT authorization to Docker services.
	 * When set, requests include an Authorization: Bearer <JWT> header.
	 *
	 * @var string
	 */
	public $serviceSecret = '';

	/**
	 * The settings model is serialized to every user via the Module entity
	 * (the client needs licenseKey, cdnUrl etc.). The JWT secret is only used
	 * server-side: it is write-only, admins too can set it but never read it back.
	 * Settings forms send changed values only, so an untouched empty field keeps it.
	 *
	 * @param array|null $properties
	 * @return array
	 */
	public function toArray(?array $properties = null): array
	{
		$arr = parent::toArray($properties);

		unset($arr['serviceSecret']);

		return $arr;
	}
}
