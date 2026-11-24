<?php
/**
 * Child process of WorkspaceTest::testConcurrentFirstOpenCreatesOneDefault(): opens the workspaces of a user like a
 * window would, at the given time. Arguments: user id, start time (microtime).
 *
 * Not through bootstrap.php: that rebuilds the cache, which processes running at once can't do.
 */
use go\core\App;
use go\core\auth\TemporaryState;
use go\core\model\Workspace;
use go\core\util\ArrayObject;

$root = __DIR__ . '/../../../..'; // tests/
$autoLoader = require($root . "/../www/vendor/autoload.php");
$autoLoader->add('go\\', $root);

require($root . "/config.php");
$config['file_storage_path'] = '/tmp/phpunit';
$config['tmpdir'] = '/tmp/phpunit/tmp';

App::get();
$c = new ArrayObject(go()->getConfig());
$c->mergeRecursive($config);
go()->setConfig($c->getArray());

$userId = (int) $argv[1];
go()->setAuthState(new TemporaryState($userId));

time_sleep_until((float) $argv[2]);
echo "default:" . Workspace::ensureDefault($userId) . "\n";
