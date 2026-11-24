<?php

namespace go\core\model;

use Exception;
use GO\Base\Db\ActiveRecord;
use go\core\exception\NotFound;
use go\core\jmap\Entity;
use go\core\model\Acl;
use go\core\acl\model\AclOwnerEntity;
use go\core\db\Criteria;
use go\core\db\Query as DbQuery;
use go\core\orm\EntityType;
use go\core\orm\Filters;
use go\core\orm\Mapping;
use go\core\orm\Query;
use go\core\orm\SearchableTrait;
use go\core\util\DateTime;
use go\core\util\StringUtil;
use go\core\db\Expression;

class Search extends AclOwnerEntity {

	public ?string $id;
	public string $entityId;
	protected int $entityTypeId;
	protected string $entity;
	protected int $moduleId;

	public bool $dontChangeModifiedAt = true;

	public static function loggable(): bool
	{
		return false;
	}


	public static function check()
	{
		//remove search cache with invalid aclId's. Can happen in old framework.
		go()->getDbConnection()->exec("delete s from core_search s left join core_acl a on a.id = s.aclId where a.id is null");


		return parent::check();
	}
	public static function checkAcls() {
		// do nothing for search
	}

	private static ?array $excludedEntityTypeIds = null;

	/**
	 * Get the entity type ID's that are left out of the global search in the system settings
	 *
	 * @return int[]
	 */
	public static function getExcludedEntityTypeIds(): array
	{
		if(!isset(self::$excludedEntityTypeIds)) {
			self::$excludedEntityTypeIds = [];
			foreach(go()->getSettings()->getSearchExcludedEntities() as $name) {
				if(EntityType::existsByName($name)) {
					self::$excludedEntityTypeIds[] = EntityType::findByName($name)->getId();
				}
			}
		}
		return self::$excludedEntityTypeIds;
	}

	/**
	 * Check if an entity type is left out of the global search. Its search record is saved for links but without keywords.
	 *
	 * @param EntityType $entityType
	 * @return bool
	 */
	public static function isExcluded(EntityType $entityType): bool
	{
		return in_array($entityType->getId(), self::getExcludedEntityTypeIds());
	}

	/**
	 * Clear the cached excluded entity types after the setting changed
	 */
	public static function resetExcludedEntityTypeIds(): void
	{
		self::$excludedEntityTypeIds = null;
	}

	/**
	 * Prepares the query for a search
	 *
	 * @param Criteria $criteria
	 * @param Query $query
	 * @param string $searchPhrase
	 * @throws Exception
	 */
	public static function addCriteria(Criteria $criteria, Query $query, string $searchPhrase): void
	{

		go()->setOptimizerSearchDepth();

		$words = StringUtil::splitTextKeywords($searchPhrase, false);
		$words = array_unique($words);

		if (empty($words)) {
			// Without words, the text filter only requires a search row, as the INNER join of core_search does.
			// Under an OR or NOT, Entity::useSearchableTraitForSearch() joins it with LEFT, and a later filter of
			// the query may reuse that join.
			$criteria->where('search.id IS NOT NULL');
		}

		if ($query->isFilteringInOrOrNot() || $query->isJoined('core_search_word', 'w0')) {
			// Under an OR or NOT, a join of the word rows would drop the items that another branch matches and
			// would let the other word rows of an item pass the NOT. And an earlier text filter of this query may
			// own the joins already. Each word checks its own word rows then.
			foreach ($words as $word) {
				$criteria->whereExists(
					(new DbQuery())
						->select('ws.searchId')
						->from('core_search_word', 'ws')
						->where('ws.searchId = search.id')
						->andWhere('ws.word', 'LIKE', $word . '%')
				);
			}
			if ($query->isFilteringInOrOrNot()) {
				// Other joins, like the one of the "link" filter, return an item once per row in another branch
				$query->groupBy(['id']);
			}
			return;
		}

		$i = 0;
		foreach ($words as $word) {
			$query->join(
				"core_search_word",
				'w' . $i, 'w' . $i . '.searchId = search.id',
				'INNER'
			);

			$criteria->where('w' . $i . '.word', 'LIKE', $word . '%');

			$i++;
		}

		// joining the search can lead to duplicates so group by to onky return unique results
		$query->groupBy(['id']);
	}

	/**
	 * Whether a query must keep the GROUP BY that addCriteria() set
	 *
	 * Under an OR or NOT operator, the rows of other joins pass through the branch of a text filter, like the
	 * one row per link of the "link" filter. The text filter used to keep the GROUP BY through its word joins
	 * there; under OR or NOT it checks its words with EXISTS now, so this keeps the GROUP BY when the filter uses
	 * the text filter with an OR or NOT operator. To keep this cheap, any OR or NOT operator in the filter counts.
	 *
	 * Without OR or NOT, the word joins still repeat an item when a word starts two of its words. The plain global
	 * search accepts that rare repeat for speed.
	 *
	 * @param Query $query The query the filter was applied to
	 * @param array|null $filter The JMAP filter of the query
	 * @return bool
	 */
	public static function queryNeedsGroupBy(Query $query, ?array $filter): bool
	{
		return !empty($filter) && $query->isFilterUsed('text') && self::hasOrOrNotOperator($filter);
	}

	private static function hasOrOrNotOperator(array $filter): bool
	{
		if (!isset($filter['conditions'], $filter['operator'])) {
			return false;
		}

		if (in_array(strtoupper($filter['operator']), ['OR', 'NOT'])) {
			return true;
		}

		foreach ($filter['conditions'] as $condition) {
			if (is_array($condition) && self::hasOrOrNotOperator($condition)) {
				return true;
			}
		}
		return false;
	}

	protected function createAcl() : void
	{
		// don't for search
	}

	protected static function checkAcl()
	{
		//don't call parent as it's messes up core_acl references!
	}

	protected static function getDefaultFetchProperties() : array
	{
		//Acl prop is not needed for search results
		return array_diff(parent::getDefaultFetchProperties(), ['acl']);
	}


	public function getEntity() {
		return $this->entity;
	}
	
	public function setAclId(?int $aclId) {
		$this->aclId = $aclId;
	}
	
	//don't delete acl on search
	protected static function getAclsToDelete(Query $query) : array
	{
		return [];
	}

	public function findAclId() : int {
		return $this->aclId;
	}
	
	
	/**
	 * Set the entity type
	 * 
	 * @param string|EntityType $entity "note" or entitytype instance
	 */
	public function setEntity($entity) {
		
		if(!($entity instanceof EntityType)) {
			$entity = EntityType::findByName($entity);
		}	
		$this->entity = $entity->getName();
		$this->entityTypeId = $entity->getId();
		$this->moduleId = $entity->getModuleId();
	}

	public $name;
	public $description;
	public $filter;

	protected function internalValidate() {
		
		$this->name = StringUtil::cutString($this->name, $this->getMapping()->getColumn('name')->length, false);
		$this->description = StringUtil::cutString($this->description, $this->getMapping()->getColumn('description')->length);		
		//$this->keywords = StringUtil::cutString($this->keywords, $this->getMapping()->getColumn('keywords')->length, true, "");
		
		return parent::internalValidate();
	}

	/**
	 *
	 * @var DateTime
	 */
	public $modifiedAt;

	/**
	 * Rebuild this entry when running build search cache.
	 *
	 * @var bool
	 */
	public $rebuild = false;

	protected static function defineMapping(): Mapping
	{
		return parent::defineMapping()
										->addTable('core_search', 'search')
										->addQuery(
														(new Query())
														->select("e.clientName AS entity")
														->join('core_entity', 'e', 'e.id = search.entityTypeId')
		);
	}

	/**
	 * Applies conditions to the query so that only entities with the given permission level are fetched.
	 * 
	 * @param Query $query
	 * @param int $level
	 */
	public static function applyAclToQuery(Query $query, int $level = Acl::LEVEL_READ, int|null $userId = null, array|null $groups = null): Query
	{
		$query->disableSemiJoin()
			->maxExecutionTime(go()->getConfig()['searchMaxExecutionTime']);
		Acl::applyToQuery($query, 'search.aclId', $level, $userId, $groups);

		return $query;
	}
	
	protected static function defineFilters(): Filters
	{
		return parent::defineFilters()
						->add("link", function(Criteria $criteria, $value, Query $query) {
							$fromEntityTypeId = EntityType::findByName($value['entity'])->getId();

							if ($query->isFilteringInOrOrNot() || $query->isJoined('core_link', 'link')) {
								// Under an OR or NOT, the join would drop the items that another branch matches and
								// would let the other links of an item pass the NOT. And an earlier link filter of
								// this query may own the join already. Check the link with EXISTS then.
								$criteria->whereExists(
									(new DbQuery())
										->select('linkFilter.toId')
										->from('core_link', 'linkFilter')
										->where('linkFilter.toId = search.entityId AND linkFilter.toEntityTypeId = search.entityTypeId')
										->andWhere('linkFilter.fromId', '=', $value['id'])
										->andWhere('linkFilter.fromEntityTypeId', '=', $fromEntityTypeId)
								);
								return;
							}

							$on = 'search.entityId = link.toId AND search.entityTypeId = link . toEntityTypeId';

							$query->join('core_link', 'link', $on);

							$criteria->where('fromId', '=', $value['id'])
											->andWhere('fromEntityTypeId', '=', $fromEntityTypeId);
						})
						->add('entityId', function (Criteria $criteria, $value){
							$criteria->where(['entityId' => $value]);		
						})
						->add('entities', function (Criteria $criteria, $value){
							// Entity filter consist out of name => "Contact" and an optional "filter" => "isOrganization"
							if(empty($value)) {
								return;
							}
							
							$sub = (new Criteria);

							foreach($value as $e) {
								if(is_string($e)) {
									$e = ['name' => $e];
								}
								$w = ['entityTypeId' =>  EntityType::findByName($e['name'])->getId()];
								if(isset($e['filter'])) {
									$w['filter'] = $e['filter'];
								}

								$sub->orWhere($w);
							}

							$criteria->where($sub);		
							
						})
						->add('text', function(Criteria $criteria, $value, Query $query) {
							Search::addCriteria( $criteria, $query, $value);
						});					
	}

	/**
	 * Find the entity this comment belongs to.
	 *
	 * @return Entity|ActiveRecord
	 */
	public function findEntity() {
		$e = EntityType::findById($this->entityTypeId);
		if(!$e) {
			throw new NotFound("Can't find entity type ID: " . $this->entityTypeId);
		}
		$cls = $e->getClassName();
		if(is_a($cls, ActiveRecord::class, true)) {
			return $cls::model()->findByPk($this->entityId);
		} else {
			return $cls::findById($this->entityId);
		}
	}
}
