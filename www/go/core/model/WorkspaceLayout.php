<?php
namespace go\core\model;

/**
 * Validates a dock document of a {@see Workspace} layout: the raw document of neo.mjs 14
 * `Neo.dashboard.dock.Workspace`, schema `neo.dock.zone.v1` (neo.mjs src/dashboard/dock/model/WorkspaceDocument.mjs,
 * validate()). The checks follow neo's validator, plus GO's own limits: every item is a panel of the workspace,
 * items carry only the fields GO uses (no blueprint or metadata), bounded size and depth.
 */
class WorkspaceLayout {

	const SCHEMA = 'neo.dock.zone.v1';

	const MAX_NODES = 200;

	const MAX_DEPTH = 16;

	const ITEM_KEYS = ['reference', 'title', 'closable', 'pinnable', 'pinned', 'autoHidden', 'lockable', 'locked', 'movable'];

	const ITEM_BOOLEANS = ['closable', 'pinnable', 'pinned', 'autoHidden', 'lockable', 'locked', 'movable'];

	const NODE_KEYS = [
		'edge-zone' => ['type', 'zones'],
		'split' => ['type', 'orientation', 'children', 'sizes'],
		'tabs' => ['type', 'items', 'activeItemId']
	];

	const EDGES = ['top', 'right', 'bottom', 'left', 'center'];

	/**
	 * Whether a string can be a node, item or panel id
	 *
	 * @param string $id
	 * @return bool
	 */
	public static function isId(string $id): bool
	{
		return (bool) preg_match('/^[A-Za-z0-9_.:-]{1,100}$/', $id);
	}

	/**
	 * @param mixed $document the decoded document
	 * @param string[] $panelIds the panels of the workspace
	 * @return string|null the first error, null when valid
	 */
	public static function validate(mixed $document, array $panelIds): ?string
	{
		if (!is_array($document) || array_is_list($document) && !empty($document)) {
			return "not an object";
		}

		if (array_diff(array_keys($document), ['schema', 'root', 'items', 'nodes'])) {
			return "unexpected key";
		}

		if (($document['schema'] ?? null) !== self::SCHEMA) {
			return "schema must be " . self::SCHEMA;
		}

		$items = $document['items'] ?? [];
		$nodes = $document['nodes'] ?? [];
		if (!is_array($items) || !is_array($nodes) || (!empty($items) && array_is_list($items)) || (!empty($nodes) && array_is_list($nodes))) {
			return "items and nodes must be objects";
		}

		if (count($nodes) > self::MAX_NODES) {
			return "too many nodes";
		}

		foreach ($items as $itemId => $item) {
			$error = self::validateItem((string) $itemId, $item, $panelIds);
			if ($error !== null) {
				return $error;
			}
		}

		foreach ($nodes as $nodeId => $node) {
			$error = self::validateNode((string) $nodeId, $node, $nodes, $items);
			if ($error !== null) {
				return $error;
			}
		}

		$root = $document['root'] ?? null;
		if (!is_string($root) || !isset($nodes[$root])) {
			return "root node missing";
		}

		// tree walk from the root: no cycles, no node or item twice, bounded depth
		$seenNodes = [];
		$seenItems = [];
		$error = self::walk($root, $nodes, 1, $seenNodes, $seenItems);
		if ($error !== null) {
			return $error;
		}

		// a node the tree doesn't reach (a detached branch, maybe a cycle) is refused, as the dock would never show it
		if (count($seenNodes) !== count($nodes)) {
			return "unreachable node";
		}

		return null;
	}

	private static function validateItem(string $itemId, mixed $item, array $panelIds): ?string
	{
		if (!self::isId($itemId)) {
			return "invalid item id";
		}

		if (!in_array($itemId, $panelIds, true)) {
			return "item " . $itemId . " is no panel";
		}

		if (!is_array($item) || (!empty($item) && array_is_list($item))) {
			return "item " . $itemId . " must be an object";
		}

		if (array_diff(array_keys($item), self::ITEM_KEYS)) {
			return "item " . $itemId . " has an unexpected key";
		}

		foreach (self::ITEM_BOOLEANS as $key) {
			if (array_key_exists($key, $item) && !is_bool($item[$key])) {
				return "item " . $itemId . ": " . $key . " must be a boolean";
			}
		}

		if (!empty($item['pinned']) && !empty($item['autoHidden'])) {
			return "item " . $itemId . " can't be pinned and auto hidden";
		}

		if (array_key_exists('title', $item) && (!is_string($item['title']) || mb_strlen($item['title']) > 190)) {
			return "item " . $itemId . ": invalid title";
		}

		if (array_key_exists('reference', $item) && (!is_string($item['reference']) || !self::isId($item['reference']))) {
			return "item " . $itemId . ": invalid reference";
		}

		return null;
	}

	private static function validateNode(string $nodeId, mixed $node, array $nodes, array $items): ?string
	{
		if (!self::isId($nodeId)) {
			return "invalid node id";
		}

		$type = is_array($node) ? ($node['type'] ?? null) : null;
		if (!is_string($type) || !isset(self::NODE_KEYS[$type])) {
			return "node " . $nodeId . ": unknown type";
		}

		if (array_diff(array_keys($node), self::NODE_KEYS[$type])) {
			return "node " . $nodeId . " has an unexpected key";
		}

		switch ($type) {
			case 'split':
				if (!in_array($node['orientation'] ?? null, ['horizontal', 'vertical'], true)) {
					return "node " . $nodeId . ": invalid orientation";
				}
				$children = $node['children'] ?? null;
				$sizes = $node['sizes'] ?? null;
				if (!is_array($children) || !array_is_list($children) || !count($children) || !is_array($sizes) || !array_is_list($sizes) || count($sizes) !== count($children)) {
					return "node " . $nodeId . ": children and sizes must be lists of the same length";
				}
				foreach ($children as $child) {
					if (!is_string($child) || !isset($nodes[$child])) {
						return "node " . $nodeId . ": child missing";
					}
				}
				$sum = 0;
				foreach ($sizes as $size) {
					if ((!is_int($size) && !is_float($size)) || $size <= 0) {
						return "node " . $nodeId . ": sizes must be positive";
					}
					$sum += $size;
				}
				if (abs($sum - 1) > 1e-6) {
					return "node " . $nodeId . ": sizes must sum to 1";
				}
				break;

			case 'tabs':
				$tabItems = $node['items'] ?? null;
				if (!is_array($tabItems) || !array_is_list($tabItems)) {
					return "node " . $nodeId . ": items must be a list";
				}
				foreach ($tabItems as $itemId) {
					if (!is_string($itemId) || !array_key_exists($itemId, $items)) {
						return "node " . $nodeId . ": item missing";
					}
				}
				$active = $node['activeItemId'] ?? null;
				if ($active !== null && !in_array($active, $tabItems, true)) {
					return "node " . $nodeId . ": active item is no member";
				}
				break;

			case 'edge-zone':
				$zones = $node['zones'] ?? [];
				if (!is_array($zones) || (!empty($zones) && array_is_list($zones))) {
					return "node " . $nodeId . ": zones must be an object";
				}
				foreach ($zones as $edge => $zone) {
					if (!in_array($edge, self::EDGES, true)) {
						return "node " . $nodeId . ": unknown edge";
					}
					if (!is_array($zone) || array_diff(array_keys($zone), ['nodeId', 'extent', 'resizable'])) {
						return "node " . $nodeId . ": invalid zone " . $edge;
					}
					if (!is_string($zone['nodeId'] ?? null) || !isset($nodes[$zone['nodeId']])) {
						return "node " . $nodeId . ": zone node missing";
					}
					if (array_key_exists('extent', $zone) && ((!is_int($zone['extent']) && !is_float($zone['extent'])) || $zone['extent'] <= 0 || $zone['extent'] >= 1)) {
						return "node " . $nodeId . ": extent must be between 0 and 1";
					}
					if (array_key_exists('resizable', $zone) && !is_bool($zone['resizable'])) {
						return "node " . $nodeId . ": resizable must be a boolean";
					}
				}
				break;
		}

		return null;
	}

	private static function walk(string $nodeId, array $nodes, int $depth, array &$seenNodes, array &$seenItems): ?string
	{
		if ($depth > self::MAX_DEPTH) {
			return "layout too deep";
		}

		if (isset($seenNodes[$nodeId])) {
			return "node " . $nodeId . " is used twice";
		}
		$seenNodes[$nodeId] = true;

		$node = $nodes[$nodeId];
		$children = match ($node['type']) {
			'split' => $node['children'],
			'edge-zone' => array_column($node['zones'] ?? [], 'nodeId'),
			default => []
		};

		if ($node['type'] === 'tabs') {
			foreach ($node['items'] as $itemId) {
				if (isset($seenItems[$itemId])) {
					return "item " . $itemId . " is used twice";
				}
				$seenItems[$itemId] = true;
			}
		}

		foreach ($children as $child) {
			$error = self::walk($child, $nodes, $depth + 1, $seenNodes, $seenItems);
			if ($error !== null) {
				return $error;
			}
		}

		return null;
	}
}
