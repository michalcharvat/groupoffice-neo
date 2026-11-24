<?php


namespace GO\Site\Controller;

use GO;
use GO\Base\Exception\AccessDenied;
use GO\Base\Model\Acl;
use GO\Site\Model\Content;
use GO\Site\Model\Site;



class ContentController extends \GO\Base\Controller\AbstractJsonController {
	
	
	/**
	 * Redirect to the homepage
	 * 
	 * @param array $params
	 */
	protected function actionRedirect($content_id){
		
		$content = $this->_loadModel($content_id);
		Site::requirePermission($content->site_id, Acl::READ_PERMISSION);
		
		header("Location: ".GO::config()->host.'modules/site/index.php?site_id='.$content->site_id.'&slug='.$content->slug);
		exit();
	}
	
//	/**
//	 * 
//	 * 
//	 * @param array $params
//	 * @return array
//	 */
//	protected function actionDefaultSlug($params){
//		
//		$response = array();
//		$response['defaultslug']=false;
//		$response['success'] = false;
//		
//		if(empty($params['parentId']))
//			Throw new \Exception('No Parent ID given!');
//		
//		$parent = \GO\Site\Model\Content::model()->findByPk($params['parentId']);
//		
//		if(!$parent)
//			Throw new \Exception('No content item found with the following id: '.$params['parentId']);
//		
//		$response['defaultslug']=$parent->slug.'/';
//		$response['success'] = true;
//		
//		return $response;
//	}
	
	protected function actionTemplateStore($params){
		
		if(empty($params['siteId']))
			Throw new \Exception('No Site ID given!');
		
		$site = Site::model()->findByPk($params['siteId']);
		
		if(!$site)
			Throw new \Exception('No site found with the following id: '.$params['siteId']);
		
		$templateFiles = array();
		
		$config = new \GO\Site\Components\Config($site);

		if($config->templates){			
			// Read config items and convert to json
			foreach($config->templates as $path=>$name)
				$templateFiles[] = array('path'=>$path,'name'=>$name);
		}
		
		$response = array(
				"success" => true,
				"results" => $templateFiles,
				'total' => count($templateFiles)
		);
		
		echo $this->renderJson($response);
	}
	
//	protected function actionLoad($params){
//
//		$model= \GO\Site\Model\Content::model()->createOrFindByParams($params);
//		
//		
//		echo $this->renderForm($model, $remoteComboFields, $extraFields);
//	}
	
	protected function actionUpdate($params){
		
		if(empty($params['id']))
			Throw new \Exception('No ID given!');
		
		$model = $this->_loadModel($params['id']);
		$isPost = \GO\Base\Util\Http::isPostRequest();
		// before setAttributes(): the user must have access to the item's current site
		Site::requirePermission($model->site_id, $isPost ? Acl::WRITE_PERMISSION : Acl::READ_PERMISSION);
			
		if($isPost){
			// the site and the parent change only by sorting in the tree (site/site/treeSort)
			$model->setAttributes($this->_editableParams($params));
			$model->save();
			echo $this->renderSubmit($model);
		}  else {
			$remoteComboFields = array();
		
			echo $this->renderForm($model, $remoteComboFields, array(
					'baseslug'=>$model->baseslug, 
					'parentslug'=>$model->parentslug));
		}
	}
	
	protected function actionCreate($params) {
		$model = new \GO\Site\Model\Content();
		// site and parent first: the slug is built from the parent's
		$model->setAttributes(array_intersect_key($params, array_flip(['site_id', 'parent_id'])));
		$model->setAttributes($this->_editableParams($params));
		$isPost = \GO\Base\Util\Http::isPostRequest();
		$this->_checkSiteAndParent($model, $isPost ? Acl::WRITE_PERMISSION : Acl::READ_PERMISSION);
				
		$model->setDefaultTemplate();

		if($isPost){
			$model->save();
			echo $this->renderSubmit($model);
		}  else {
			echo $this->renderForm($model, array() , array(
					'baseslug'=>$model->baseslug, 
					'parentslug'=>$model->parentslug));
		}
  }
		
	protected function actionDelete($params) {
		if(empty($params['id']))
			Throw new \Exception('No ID given!');
		
		$model = $this->_loadModel($params['id']);
		Site::requirePermission($model->site_id, Acl::DELETE_PERMISSION);
		
		$response = array();
		
		$response['success'] = $model->delete();
		
		echo $this->renderJson($response);
	}
	
	/**
	 * The posted attributes a user may change (not the site, parent, author or times)
	 *
	 * @param array $params
	 * @return array
	 */
	private function _editableParams(array $params): array
	{
		return array_intersect_key($params, array_flip(['title', 'baseslug', 'content', 'status', 'template',
			'default_child_template', 'meta_title', 'meta_keywords', 'meta_description', 'customFieldsJSON']));
	}

	/**
	 * Checks the level on the content item's site, and that its parent belongs to that site
	 *
	 * @param Content $model
	 * @param int $level
	 * @throws AccessDenied
	 */
	private function _checkSiteAndParent(Content $model, int $level): void
	{
		Site::requirePermission($model->site_id, $level);

		if(!empty($model->parent_id)) {
			$parent = Content::model()->findByPk($model->parent_id);
			if(!$parent || (string) $parent->site_id !== (string) $model->site_id) {
				throw new AccessDenied();
			}
		}
	}

	private function _loadModel($id){
		$model = \GO\Site\Model\Content::model()->findByPk($id);
		
		if(!$model)
			Throw new \Exception('No content item found with the following id: '.$id);

		return $model;
	}
	
	public function actionContentTree($params){
		$response=array();
	
		if(empty($params['site_id']))
			Throw new \Exception('No Site ID given!');
				
		if(!isset($params['node']))
			return $response;
		
		$site = Site::requirePermission($params['site_id'], Acl::READ_PERMISSION);
		
		$args = explode('_', $params['node']);
		
		$siteId = $args[0];
		
		if(!isset($args[1]))
			$type = 'root';
		else
			$type = $args[1];
		
		if(isset($args[2]))
			$parentId = $args[2];
		else
			$parentId = null;
		
		switch($type){
			case 'content':
				if($parentId === null){
					$response = $site->loadContentNodes();
				} else {
					$parentNode = \GO\Site\Model\Content::model()->findByPk($parentId);
					if($parentNode && (string) $parentNode->site_id === (string) $site->id)
						$response = $parentNode->getChildrenTree();
				}
				break;
//			case 'news':
//				$response = \GO\Site\Model\News::getTreeNodes($site);
//				break;
		}
		
		echo $this->renderJson($response);
	}

	
	
}
