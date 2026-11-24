<?php
/**
 * Copyright Intermesh BV.
 *
 * This file is part of Group-Office. You should have received a copy of the
 * Group-Office license along with Group-Office. See the file /LICENSE.TXT
 *
 * If you have questions write an e-mail to info@intermesh.nl
 *
 * @package GO.modules.Site
 * @version $Id: MenuItemController.php 16757 2014-01-30 10:54:43Z mschering $
 * @copyright Copyright Intermesh BV.
 * @author Wesley Smits wsmits@intermesh.nl
 */
 
/**
 * The MenuItem controller object
 *
 * @package GO.modules.Site
 * @version $Id: MenuItemController.php 16757 2014-01-30 10:54:43Z mschering $
 * @copyright Copyright Intermesh BV.
 * @author Wesley Smits wsmits@intermesh.nl
 * 
 */

namespace GO\Site\Controller;

use GO\Base\Exception\AccessDenied;
use GO\Base\Model\Acl;
use GO\Site\Model\Content;
use GO\Site\Model\Menu;
use GO\Site\Model\MenuItem;
use GO\Site\Model\Site;


class MenuItemController extends \GO\Base\Controller\AbstractJsonController {
	
	/**
	 * Loads a store of menu items that can be a parent of the given menu item.
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionParentStore($id, $menu_id){
		$this->_requireMenuPermission($menu_id, Acl::READ_PERMISSION);
		
		$findCriteria = \GO\Base\Db\FindCriteria::newInstance()->addCondition('menu_id', $menu_id);
		$findCriteria->addCondition('id', $id,'<>');
		$findParams = \GO\Base\Db\FindParams::newInstance()->criteria($findCriteria);
		
		// without delete_keys: DbStore deletes those records before it lists
		$store = new \GO\Base\Data\DbStore('GO\Site\Model\MenuItem', new \GO\Base\Data\ColumnModel('GO\Site\Model\MenuItem'), Site::listParams($_REQUEST),$findParams);

		// nosemgrep
		echo $this->renderStore($store);
	}
	
	/**
	 * Loads a menu item
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionLoad($id, $menu_id){
		$remoteComboFields = array();
		
		$model = $this->_loadModel($menu_id,$id);
		$this->_checkItem($model, Acl::READ_PERMISSION);
		
		if(!empty($model->content_id))
			$remoteComboFields['content_id']=var_export($model->content->title, true);
		
		echo $this->renderForm($model,$remoteComboFields);
	}
	
	/**
	 * Create a new menu item
	 * 
	 * @param int $site_id
	 */
	public function actionCreate($menu_id){
		$remoteComboFields = array();
		
		$model = $this->_loadModel($menu_id);
		
		if(\GO\Base\Util\Http::isPostRequest()){
			$model->setAttributes($this->_editableParams($_POST));
			$this->_checkItem($model, Acl::WRITE_PERMISSION);
			if(!$model->save()) {
				echo $this->renderSubmit($model);
				return;
			}
		} else {
			$this->_checkItem($model, Acl::READ_PERMISSION);
		}
		
		echo $this->renderForm($model,$remoteComboFields);
	}
	
	/**
	 * Create a new menu item
	 * 
	 * @param int $site_id
	 */
	public function actionCreateFromContent($target,$content){
		
		if(\GO\Base\Util\Http::isPostRequest()){
			
			$target = json_decode($target);
			$content = json_decode($content);

			// a menu item is created in a menu or below a menu item, for a content item
			if(!is_object($target) || !is_object($content) || !in_array($target->type ?? null, ['menu', 'menuitem'], true)
				|| ($content->type ?? null) !== 'content' || empty($target->modelId) || empty($content->modelId)) {
				throw new \GO\Base\Exception\NotFound();
			}
			
			$targetModelName = \GO\Site\SiteModule::getModelNameFromTreeNodeType($target->type);
			$contentModelName = \GO\Site\SiteModule::getModelNameFromTreeNodeType($content->type);
			
			$targetModel = $targetModelName::model()->findByPk($target->modelId);
			$contentModel = $contentModelName::model()->findByPk($content->modelId);
			if(!$targetModel || !$contentModel) {
				throw new \GO\Base\Exception\NotFound();
			}
			if($targetModel instanceof \GO\Site\Model\MenuItem){
				$menuId = $targetModel->menu_id;
			}else{
				$menuId = $targetModel->id;
			}

			$model = $this->_loadModel($menuId);
			// dropped on a menu: a top level item
			$model->parent_id = $targetModel instanceof \GO\Site\Model\MenuItem ? $targetModel->id : null;
			$model->content_id = $contentModel->id;
			$model->label = $contentModel->title;
			$this->_checkItem($model, Acl::WRITE_PERMISSION);
			
	
// * @property int $menu_id The menu_id of this menu
// * @property int $id The id of this menu item
// * @property int $parent_id Optional: The parent menuItem of this current item.
// * @property int $content_id Optional: The content_id where this menu items links to
// * @property String $label The label of the menu item
// * @property String $url Optional: url field to create menu items that link to a page that you can fill in manually
// * @property Boolean $display_children Only usable when content_id is set. When true this will load the child items of the current content_id.
// * @property int $sort_order The sort order for the menu items at the same level
// * @property String $target The target for the url in this menu item
//				
//			$model->setAttributes($_POST);
			if(!$model->save()) {
				echo $this->renderSubmit($model);
				return;
			}
		}
		
		echo $this->renderJson(array('success'=>true));
	}
	
	/**
	 * Update a new menu item
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionUpdate($id,$menu_id){
		$remoteComboFields = array();
		
		$model = $this->_loadModel($menu_id,$id);
		$isPost = \GO\Base\Util\Http::isPostRequest();
		$this->_checkItem($model, $isPost ? Acl::WRITE_PERMISSION : Acl::READ_PERMISSION);
		
		if(!empty($model->content_id))
			$remoteComboFields['content_id']=var_export($model->content->title, true);
		
		if($isPost){
			// the menu of an item doesn't change; its new parent and content are checked
			$model->setAttributes($this->_editableParams($_POST));
			$this->_checkItem($model, Acl::WRITE_PERMISSION);
			if(!$model->save()) {
				echo $this->renderSubmit($model);
				return;
			}
		}

		echo $this->renderForm($model,$remoteComboFields);
	}
	
	/**
	 * Delete a new menu item
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionDelete($id,$menu_id){
		
		$model = $this->_loadModel($menu_id,$id);
		$this->_checkItem($model, Acl::DELETE_PERMISSION);
		$model->delete();
		
		echo $this->renderForm($model);
	}
	
	/**
	 * The posted attributes a user may change; the menu is the request's menu_id (create) or
	 * the item's (update)
	 *
	 * @param array $params
	 * @return array
	 */
	private function _editableParams(array $params): array
	{
		return array_intersect_key($params, array_flip(['label', 'url', 'display_children', 'parent_id', 'content_id', 'target']));
	}

	/**
	 * Checks the level on the site of a menu
	 *
	 * @param int|string|null $menuId
	 * @param int $level
	 * @return Menu
	 */
	private function _requireMenuPermission($menuId, int $level): Menu
	{
		$menu = empty($menuId) ? false : Menu::model()->findByPk($menuId);
		if(!$menu) {
			throw new \GO\Base\Exception\NotFound();
		}
		Site::requirePermission($menu->site_id, $level);
		return $menu;
	}

	/**
	 * Checks the level on the menu item's site, and that its parent item and content belong
	 * to its menu and site (menu items have no ACL of their own)
	 *
	 * @param MenuItem $model
	 * @param int $level
	 * @throws AccessDenied
	 */
	private function _checkItem(MenuItem $model, int $level): void
	{
		$menu = $this->_requireMenuPermission($model->menu_id, $level);

		// only links that are set now: an item whose content was deleted stays editable
		$isNew = $model->isNew;

		if(!empty($model->parent_id) && ($isNew || $model->isModified('parent_id'))) {
			$parent = MenuItem::model()->findByPk($model->parent_id);
			if(!$parent || (string) $parent->menu_id !== (string) $model->menu_id) {
				throw new AccessDenied();
			}
			// not below itself or one of its own items
			for($ancestor = $parent; $ancestor; $ancestor = empty($ancestor->parent_id) ? null : MenuItem::model()->findByPk($ancestor->parent_id)) {
				if(!$isNew && (string) $ancestor->id === (string) $model->id) {
					throw new AccessDenied();
				}
			}
		}

		if(!empty($model->content_id) && ($isNew || $model->isModified('content_id'))) {
			$content = Content::model()->findByPk($model->content_id);
			if(!$content || (string) $content->site_id !== (string) $menu->site_id) {
				throw new AccessDenied();
			}
		}
	}

	/**
	 * Load the model menu object
	 * 
	 * @param int $siteId
	 * @param int $id
	 * @return \GO\Site\Model\Menu
	 * @throws Exception
	 */
	private function _loadModel($menu_id, $id = false){
		
		if(!empty($id)){
			$model = \GO\Site\Model\MenuItem::model()->findByPk($id);
		}else{
			$model = new \GO\Site\Model\MenuItem();
			$model->menu_id = $menu_id;
		}
		
		if(!$model)
			Throw new \Exception('Model with id: '.$id.' not found.');
		
		return $model;
	}
	
}
	
