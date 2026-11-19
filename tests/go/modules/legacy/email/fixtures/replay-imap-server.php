<?php
/**
 * An IMAP server for tests that answers with a recorded session. A command (without its tag) gets the recorded
 * response, with the recorded tag replaced by the client's; unknown commands get "OK". The client lines are written
 * to the log file.
 *
 * Usage: php replay-imap-server.php <session.json> <logfile>
 * session.json: {"greeting": "* OK …\r\n", "commands": [{"command": "SELECT \"INBOX\"", "response": "* … {TAG} OK …\r\n"}]}
 * Prints the port it listens on and stops after 30 seconds or when stdin is closed.
 */
$session = json_decode(file_get_contents($argv[1]), true);
$responses = [];
foreach ($session['commands'] as $command) {
	$responses[$command['command']] = $command['response'];
}
$log = fopen($argv[2], 'a');
$server = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
if (!$server) {
	fwrite(STDERR, $errstr);
	exit(1);
}
$name = stream_socket_get_name($server, false);
echo substr($name, strrpos($name, ':') + 1) . "\n";
fflush(STDOUT);
stream_set_blocking(STDIN, false);

$clients = [];
$end = time() + 30;
while (time() < $end) {
	$read = array_merge([$server, STDIN], $clients);
	$write = $except = null;
	if (!stream_select($read, $write, $except, 1)) {
		continue;
	}
	foreach ($read as $stream) {
		if ($stream === STDIN) {
			if (feof(STDIN)) {
				exit(0);
			}
			fgets(STDIN);
		} else if ($stream === $server) {
			$client = stream_socket_accept($server);
			fwrite($client, $session['greeting']);
			$clients[] = $client;
		} else {
			$line = fgets($stream);
			if ($line === false) {
				fclose($stream);
				$clients = array_values(array_filter($clients, fn($c) => $c !== $stream));
				continue;
			}
			fwrite($log, $line);
			fflush($log);
			[$tag, $command] = array_pad(explode(' ', rtrim($line, "\r\n"), 2), 2, '');
			fwrite($stream, isset($responses[$command]) ? str_replace('{TAG}', $tag, $responses[$command]) : "$tag OK done\r\n");
		}
	}
}
