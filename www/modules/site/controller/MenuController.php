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
 * @version $Id: MenuController.php 16757 2014-01-30 10:54:43Z mschering $
 * @copyright Copyright Intermesh BV.
 * @author Wesley Smits wsmits@intermesh.nl
 */
 
/**
 * The Menu controller object
 *
 * @package GO.modules.Site
 * @version $Id: MenuController.php 16757 2014-01-30 10:54:43Z mschering $
 * @copyright Copyright Intermesh BV.
 * @author Wesley Smits wsmits@intermesh.nl
 * 
 */

namespace GO\Site\Controller;

use GO\Base\Model\Acl;
use GO\Site\Model\Site;


class MenuController extends \GO\Base\Controller\AbstractJsonController {
		
	/**
	 * Loads a store of content items of the current website
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionContentStore($menu_id){
		
		$menu = \GO\Site\Model\Menu::model()->findByPk($menu_id);
		if(!$menu) {
			throw new \GO\Base\Exception\NotFound();
		}
		Site::requirePermission($menu->site_id, Acl::READ_PERMISSION);
		
		$findCriteria = \GO\Base\Db\FindCriteria::newInstance()->addCondition('site_id', $menu->site_id);
		$findParams = \GO\Base\Db\FindParams::newInstance()->criteria($findCriteria);
		
		// without delete_keys: DbStore deletes those records before it lists
		$store = new \GO\Base\Data\DbStore('GO\Site\Model\Content', new \GO\Base\Data\ColumnModel('GO\Site\Model\Content'), Site::listParams($_REQUEST),$findParams);

		// nosemgrep
		echo $this->renderStore($store);
	}
	
	
	/**
	 * Loads a menu item
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionLoad($id, $site_id){
		$remoteComboFields = array();
		
		$model = $this->_loadModel($site_id,$id);
		Site::requirePermission($model->site_id, Acl::READ_PERMISSION);
		
		if(!empty($model->content_id))
			$remoteComboFields['content_id']=var_export($model->content->title, true);
		
		echo $this->renderForm($model,$remoteComboFields);
	}
	
	/**
	 * Create a new menu item
	 * 
	 * @param int $site_id
	 */
	public function actionCreate($site_id){
		$remoteComboFields = array();
		
		$model = $this->_loadModel($site_id);
		
		if(\GO\Base\Util\Http::isPostRequest()){
			Site::requirePermission($model->site_id, Acl::WRITE_PERMISSION);
			$model->setAttributes($this->_editableParams($_POST));
			if(!$model->save()) {
				echo $this->renderSubmit($model);
				return;
			}
		} else {
			Site::requirePermission($model->site_id, Acl::READ_PERMISSION);
		}
		
		echo $this->renderForm($model,$remoteComboFields);
	}
	
	/**
	 * Update a new menu item
	 * 
	 * @param int $id
	 * @param int $site_id
	 */
	public function actionUpdate($id,$site_id){
		$remoteComboFields = array();
		
		$model = $this->_loadModel($site_id,$id);
		$isPost = \GO\Base\Util\Http::isPostRequest();
		Site::requirePermission($model->site_id, $isPost ? Acl::WRITE_PERMISSION : Acl::READ_PERMISSION);
		
		if(!empty($model->content_id))
			$remoteComboFields['content_id']=var_export($model->content->title, true);
		
		if($isPost){
			// the site of a menu doesn't change
			$model->setAttributes($this->_editableParams($_POST));
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
	public function actionDelete($id,$site_id){
		
		$model = $this->_loadModel($site_id,$id);
		Site::requirePermission($model->site_id, Acl::DELETE_PERMISSION);
		$model->delete();
		
		echo $this->renderForm($model);
	}
	
	/**
	 * The posted attributes a user may change; the site is the request's site_id (create) or
	 * the menu's (update)
	 *
	 * @param array $params
	 * @return array
	 */
	private function _editableParams(array $params): array
	{
		return array_intersect_key($params, array_flip(['label', 'menu_slug']));
	}

	/**
	 * Load the model menu object
	 * 
	 * @param int $siteId
	 * @param int $id
	 * @return \GO\Site\Model\Menu
	 * @throws Exception
	 */
	private function _loadModel($siteId, $id = false){
		
		if(!empty($id)){
			$model = \GO\Site\Model\Menu::model()->findByPk($id);
		}else{
			$model = new \GO\Site\Model\Menu();
			$model->site_id = $siteId;
		}
		
		if(!$model)
			Throw new \Exception('Model with id: '.$id.' not found.');
		
		return $model;
	}
	
}
	
