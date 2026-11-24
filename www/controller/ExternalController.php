<?php


namespace GO\Core\Controller;


class ExternalController extends \GO\Base\Controller\AbstractController {
	protected function allowGuests() {
		return array('index');
	}
	protected function actionIndex($params) {

		// the "external" view launches a function of the classic client: without it (a build without
		// views/Extjs3) open the webclient instead of answering with the decoded parameters
		if(!\go\core\webclient\Webclient::classicAvailable()) {
			header('Location: ' . \go\core\webclient\Extjs3::get()->getRelativeUrl());
			exit();
		}
		
		//$funcParams = \GO\Base\Util\Crypt::decrypt($params['f']);
		
		if(substr($_REQUEST['f'],0,9)=='{GOCRYPT}')
			$funcParams = \GO\Base\Util\Crypt::decrypt($_REQUEST['f']);
		else
			$funcParams = json_decode(base64_decode($_REQUEST['f']),true);
		
		$this->render('external', $funcParams);		
	}
}
