<?php


namespace GO\Site\Controller;

use GO\Base\Exception\AccessDenied;
use GO\Base\Model\Acl;
use GO\Site\Model\Content;
use GO\Site\Model\Menu;
use GO\Site\Model\MenuItem;
use GO\Site\Model\Site;
use GO\Site\SiteModule;


class SiteController extends \GO\Base\Controller\AbstractJsonController {
	
	/**
	 * Redirect to the homepage
	 * 
	 * @param array $params
	 */
	protected function actionRedirectToFront($params){
		
		$site = Site::requirePermission($params['id'] ?? null, Acl::READ_PERMISSION);
		
		// the site's front page, like "View" in the tree
		header("Location: ".\GO::config()->host.'modules/site/index.php?site_id='.urlencode((string) $site->id));
		exit();
	}
	
	protected function actionLoad($params) {
		$model = \GO\Site\Model\Site::model()->createOrFindByParams($params);
		
		echo $this->renderForm($model);
	}
	
	protected function actionSubmit($params) {
		// not createOrFindByParams(): it sets every posted attribute of a new site
		if(empty($params['id'])) {
			$model = new Site();
		} else {
			$model = Site::model()->findByPk($params['id']);
			if(!$model) {
				throw new \GO\Base\Exception\NotFound();
			}
		}
		// only what the site dialog edits: not the owner, ACL or files folder
		$editable = ['name', 'domain', 'base_path', 'language', 'ssl', 'mod_rewrite', 'mod_rewrite_base_path', 'customFieldsJSON'];
		if($model->isNew) {
			$editable[] = 'module';
		}
		$model->setAttributes(array_intersect_key($params, array_flip($editable)));
		$model->save();
		echo $this->renderSubmit($model);
	}
	
		
	/**
	 * Build the tree for the backend
	 * 
	 * @param array $params
	 * @return array
	 */
	protected function actionTree($params){
		$response=array();
	
		if(!isset($params['node']))
			return $response;
		
		$extractedNode = \GO\Site\SiteModule::extractTreeNode($params['node']);
		
		// 1_menuitem_6 = array('siteId' => '1','type' =>'menuitem','modelId' => '6');
		// 1_root = array('siteId' => '1','type' =>'root','modelId' => false);
		// 1_content = array('siteId' => '1','type' =>'content','modelId' => false);
		// 1_menu = array('siteId' => '1','type' =>'menu','modelId' => false);
		// 1_menu_1 = array('siteId' => '1','type' =>'menu','modelId' => '1');
				
		switch($extractedNode['type']){
			case 'root':
				$response = \GO\Site\Model\Site::getTreeNodes();
				break;
			case 'content':
				if(empty($extractedNode['modelId'])){
					$response = \GO\Site\Model\Site::getTreeNodes();
				} else {
					$content = \GO\Site\Model\Content::model()->findByPk($extractedNode['modelId']);
					if($content) {
						Site::requirePermission($content->site_id, Acl::READ_PERMISSION);
						$response = $content->getChildrenTree();
					}
				}
				break;
			case 'menu':
				$menu = \GO\Site\Model\Menu::model()->findByPk($extractedNode['modelId']);
					if($menu) {
						Site::requirePermission($menu->site_id, Acl::READ_PERMISSION);
						$response = $menu->getMenuChildrenTree();
					}
				break;
			case 'menuitem':
				$menuitem = \GO\Site\Model\MenuItem::model()->findByPk($extractedNode['modelId']);
					if($menuitem) {
						Site::requirePermission($menuitem->menu->site_id, Acl::READ_PERMISSION);
						$response = $menuitem->getChildrenTree();
					}
				break;
		}
		
		echo $this->renderJson($response);
	}
	
	
	/**
	 * Rearrange the tree based on the given sorting
	 * 
	 * @param array $params
	 * @return array
	 */
	protected function actionTreeSort($sortOrder, $parent){
//		EXAMPLE INPUT
//		parent:1_menu_11
//		sortOrder:["1_menuitem_30","1_menuitem_31","1_menuitem_33","1_menuitem_8"]
			$sortOrder = json_decode($sortOrder, true);
			$extractedParentNode = \GO\Site\SiteModule::extractTreeNode($parent);

			// the items are moved below the parent: the user must be able to write its site,
			// and may only sort items of that site
			if(!is_array($sortOrder) || !is_array($extractedParentNode)) {
				throw new \GO\Base\Exception\NotFound();
			}
			$siteId = $this->siteIdOfNode($extractedParentNode);
			Site::requirePermission($siteId, Acl::WRITE_PERMISSION);
			$ancestors = $this->ancestorsOfNode($extractedParentNode);
			$menuId = $this->menuIdOfNode($extractedParentNode);
			foreach($sortOrder as $sortItem) {
				$child = SiteModule::extractTreeNode((string) $sortItem);
				if(!is_array($child) || !ctype_digit((string) $child['modelId']) || (string) $this->siteIdOfNode($child) !== (string) $siteId) {
					throw new AccessDenied();
				}
				// not below itself or one of its own children
				if(in_array($child['type'] . '_' . (int) $child['modelId'], $ancestors, true)) {
					throw new AccessDenied();
				}
				// menu items stay in their menu
				if($child['type'] === 'menuitem') {
					$item = MenuItem::model()->findByPk($child['modelId']);
					if(!$item || $menuId === null || (string) $item->menu_id !== (string) $menuId) {
						throw new AccessDenied();
					}
				}
			}
			
			switch($extractedParentNode['type']){
				case 'content':
					$allowedTypes = array('content');
					return \GO\Site\Model\Content::setTreeSort($extractedParentNode, $sortOrder, $allowedTypes);
					break;
//				case 'site':
//					$allowedTypes = array('content');
//					return \GO\Site\Model\Site::setTreeSort($extractedParentNode, $sortOrder, $allowedTypes);
//					break;
				case 'menu':
					$allowedTypes = array('menuitem');
					return \GO\Site\Model\Menu::setTreeSort($extractedParentNode, $sortOrder, $allowedTypes);
					break;
				case 'menuitem':
					$allowedTypes = array('menuitem');
					return \GO\Site\Model\MenuItem::setTreeSort($extractedParentNode, $sortOrder, $allowedTypes);
					break;
			}
	}
	
	/**
	 * Save the state of the tree
	 * 
	 * @param array $params
	 * @return array
	 */
	protected function actionSaveTreeState($params) {
		$response['success'] = \GO::config()->save_setting("site_tree_state", $params['expandedNodes'], \GO::user()->id);
		return $response;
	}	
	
	
	
	/**
	 * The site a tree node belongs to, from its model (not from the site id in the node id,
	 * which the client sends)
	 *
	 * @param array $extractedNode SiteModule::extractTreeNode()
	 * @return int|null
	 */
	private function siteIdOfNode(array $extractedNode): ?int
	{
		if(empty($extractedNode['modelId'])) {
			// a root node: "<siteId>_content" or "<siteId>_menu"
			return ctype_digit((string) $extractedNode['siteId']) ? (int) $extractedNode['siteId'] : null;
		}

		switch($extractedNode['type']) {
			case 'content':
				$model = Content::model()->findByPk($extractedNode['modelId']);
				return $model ? (int) $model->site_id : null;
			case 'menu':
				$model = Menu::model()->findByPk($extractedNode['modelId']);
				return $model ? (int) $model->site_id : null;
			case 'menuitem':
				$model = MenuItem::model()->findByPk($extractedNode['modelId']);
				return $model && $model->menu ? (int) $model->menu->site_id : null;
		}
		return null;
	}

	/**
	 * The parent node and its ancestors as "<type>_<id>" (ids of the loaded records, so "01" is 1)
	 *
	 * @param array $extractedNode SiteModule::extractTreeNode()
	 * @return string[]
	 */
	private function ancestorsOfNode(array $extractedNode): array
	{
		$ids = [];
		$class = ['content' => Content::class, 'menuitem' => MenuItem::class][$extractedNode['type']] ?? null;
		$id = $extractedNode['modelId'] ?? null;
		// stops at a cycle that is already in the database
		while($class && !empty($id) && ($model = $class::model()->findByPk($id))) {
			$key = $extractedNode['type'] . '_' . (int) $model->id;
			if(in_array($key, $ids, true)) {
				break;
			}
			$ids[] = $key;
			$id = $model->parent_id;
		}
		return $ids;
	}

	/**
	 * The menu that the children of a menu or menu item node belong to
	 *
	 * @param array $extractedNode SiteModule::extractTreeNode()
	 * @return int|null
	 */
	private function menuIdOfNode(array $extractedNode): ?int
	{
		if(empty($extractedNode['modelId'])) {
			return null;
		}
		if($extractedNode['type'] === 'menu') {
			return (int) $extractedNode['modelId'];
		}
		if($extractedNode['type'] === 'menuitem') {
			$item = MenuItem::model()->findByPk($extractedNode['modelId']);
			return $item ? (int) $item->menu_id : null;
		}
		return null;
	}

	protected function actionCheatSheet(){
		echo  '<pre style="padding:10px; font-family: \'Lucida Console\', Monaco, monospace;">
			
Links:
1. Paste images from the clipboard to insert them.
Note: Supported in Chrome,Safari and IE 11. 
In Firefox make sure the editor has focus, then click 
anywhere OUTSIDE the editor and press CTRL+V.

2. Drag and drop images or files from the file manager 
   to the content editor to insert them.

3. Drag and drop content items from the tree to 
   link to those pages.

Markdown syntax:

# Header 1
## Header 2
### Header 3
#### Header 4
##### Header 5

## Markdown plus h2 with a custom ID ## {#id-goes-here}
[Link back to H2](#id-goes-here)

This is a paragraph, which is text surrounded by whitespace. 
Paragraphs can be on one line (or many), and can drone on 
for hours.  

Here is a Markdown link:

[Group-Office](https://www.group-office.com) 

Now some inline markup like *italics*,  **bold**, and 
`code()`.

![picture alt](/images/photo.jpeg "Title is optional")     

> Blockquotes are like quoted text in email replies
>> And, they can be nested

* Bullet lists are easy too
- Another one
+ Another one

1. A numbered list
2. Which is numbered
3. With periods and a space

And now some code:

    // Code is just text indented a bit
    which(is_easy) to_remember();

~~~

// Markdown extra adds un-indented code blocks too

if (this_is_more_code == true && !indented) {
    // tild wrapped code blocks, also not indented
}

~~~

Text with  
two trailing spaces  
(on the right)  
can be used  
for things like poems  

### Horizontal rules

* * * *
****
--------------------------

<div class="custom-class" markdown="1">
This is a div wrapping some Markdown plus.  
Without the DIV attribute,
it ignores the block. 
</div>

## Markdown plus tables ##

| Header | Header | Right  |
| ------ | ------ | -----: |
|  Cell  |  Cell  |   $10  |
|  Cell  |  Cell  |   $20  |

* Outer pipes on tables are optional
* Colon used for alignment (right versus left)

## Markdown plus definition lists ##

Bottled water
: $ 1.25
: $ 1.55 (Large)

Milk
Pop
: $ 1.75

* Multiple definitions and terms are possible
* Definitions can include multiple paragraphs too

*[ABBR]: Markdown plus abbreviations (produces an <abbr> tag)

</pre>';
	}
}
