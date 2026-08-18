<?php

use MediaWiki\Maintenance\Maintenance;

// Dans une ferme MediaWiki, les scripts de maintenance ont besoin d'un wiki
// de configuration. KeyHelp, en mode « Exécuter un script PHP », ne permet
// pas de passer --wiki ; on utilise donc FR par défaut si l'option est absente.
if ( PHP_SAPI === 'cli' ) {
	$cliArgs = $_SERVER['argv'] ?? [];
	$hasWikiOption = false;

	foreach ( $cliArgs as $arg ) {
		if ( $arg === '--wiki' || str_starts_with( $arg, '--wiki=' ) ) {
			$hasWikiOption = true;
			break;
		}
	}

	if ( !$hasWikiOption ) {
		$cliArgs[] = '--wiki';
		$cliArgs[] = 'fr';
		$_SERVER['argv'] = $cliArgs;
		$GLOBALS['argv'] = $cliArgs;
		$GLOBALS['argc'] = count( $cliArgs );
	}
}

require_once __DIR__ . '/Maintenance.php';

class ServerHealthMail extends Maintenance {
	private const RECIPIENT = 'alertecrawler@wikidebats.org';
	private const FROM = 'noreply@wikidebats.org';
	private const FROM_NAME = 'Wikidébats';

	private const APACHE_ALERT_THRESHOLD = 100;
	private const HTTPS_ALERT_THRESHOLD = 200;
	private const PHP_FPM_ALERT_THRESHOLD = 16;

	private const UA_SUSPICIOUS_REQUEST_THRESHOLD = 15;
	private const UA_SUSPICIOUS_IP_THRESHOLD = 10;
	private const UA_DYNAMIC_REQUEST_THRESHOLD = 80;
	private const UA_DYNAMIC_IP_THRESHOLD = 40;

	private const WIKI_SUSPICIOUS_REQUEST_THRESHOLD = 25;
	private const WIKI_SUSPICIOUS_IP_THRESHOLD = 20;

	private const STATE_FILE = '/home/users/webmaster/.cache/wikidebates-server-health.json';

	private array $wikis = [
		'FR' => '/home/users/webmaster/logs/fr.wikidebates.org/access.log',
		'EN' => '/home/users/webmaster/logs/en.wikidebates.org/access.log',
		'DE' => '/home/users/webmaster/logs/de.wikidebates.org/access.log',
		'ES' => '/home/users/webmaster/logs/es.wikidebates.org/access.log',
		'IT' => '/home/users/webmaster/logs/it.wikidebates.org/access.log',
		'PT' => '/home/users/webmaster/logs/pt.wikidebates.org/access.log',
		'DEV' => '/home/users/webmaster/logs/dev.wikidebates.org/access.log',
		'FARM' => '/home/users/webmaster/logs/farm.wikidebates.org/access.log',
		'MILITOTHÈQUE' => '/home/users/webmaster/logs/militotheque.org/access.log',
	];

	public function __construct() {
		parent::__construct();

		$this->addDescription(
			'Surveille Apache, HTTPS, PHP-FPM et les crawlers furtifs, puis envoie un mail en cas d’anomalie.'
		);

		$this->addOption(
			'window',
			'Fenêtre d’analyse des logs, en minutes. Valeur par défaut : 5.',
			false,
			true
		);

		$this->addOption(
			'test-mail',
			'Envoie immédiatement un mail de test, sans modifier l’état des alertes.',
			false,
			false
		);
	}

	public function execute() {
		$windowMinutes = max( 1, (int)$this->getOption( 'window', 5 ) );
		$configWiki = strtoupper( (string)$this->getOption( 'wiki', 'fr' ) );

		if ( $this->hasOption( 'test-mail' ) ) {
			$this->sendTestMail( $configWiki );
			return;
		}

		$now = new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) );
		$since = $now->sub( new DateInterval( 'PT' . $windowMinutes . 'M' ) );

		$server = $this->collectServerMetrics();
		$logs = $this->analyseLogs( $since );

		$issues = [];
		$affectedWikis = [];

		if ( $server['apache'] >= self::APACHE_ALERT_THRESHOLD ) {
			$issues[] = [
				'type' => 'apache',
				'label' => 'Nombre élevé de processus Apache',
				'value' => $server['apache'],
				'threshold' => self::APACHE_ALERT_THRESHOLD,
			];
		}

		if ( $server['https'] >= self::HTTPS_ALERT_THRESHOLD ) {
			$issues[] = [
				'type' => 'https',
				'label' => 'Nombre élevé de connexions HTTPS établies',
				'value' => $server['https'],
				'threshold' => self::HTTPS_ALERT_THRESHOLD,
			];
		}

		if ( $server['phpFpm'] >= self::PHP_FPM_ALERT_THRESHOLD ) {
			$issues[] = [
				'type' => 'php-fpm',
				'label' => 'Nombre élevé de workers PHP-FPM',
				'value' => $server['phpFpm'],
				'threshold' => self::PHP_FPM_ALERT_THRESHOLD,
			];
		}

		$crawlerIssues = $this->detectCrawlerIssues( $logs );

		foreach ( $crawlerIssues as $issue ) {
			$issues[] = $issue;
			$affectedWikis[$issue['wiki']] = true;
		}

		if (
			$server['apache'] >= self::APACHE_ALERT_THRESHOLD
			|| $server['https'] >= self::HTTPS_ALERT_THRESHOLD
			|| $server['phpFpm'] >= self::PHP_FPM_ALERT_THRESHOLD
		) {
			foreach ( $this->getBusiestWikis( $logs, 3 ) as $wiki ) {
				$affectedWikis[$wiki] = true;
			}
		}

		$affectedWikiCodes = array_keys( $affectedWikis );
		sort( $affectedWikiCodes, SORT_STRING );

		$state = $this->loadState();

		if ( $issues ) {
			$signature = $this->buildIssueSignature( $issues, $affectedWikiCodes );

			if ( empty( $state['active'] ) || ( $state['signature'] ?? '' ) !== $signature ) {
				$subject = $this->buildAlertSubject( $affectedWikiCodes );
				$body = $this->buildAlertBody(
					$affectedWikiCodes,
					$issues,
					$server,
					$logs,
					$windowMinutes
				);

				$this->sendMail( $subject, $body );

				$this->saveState( [
					'active' => true,
					'signature' => $signature,
					'affectedWikis' => $affectedWikiCodes,
					'startedAt' => !empty( $state['active'] )
						? ( $state['startedAt'] ?? $now->format( DATE_ATOM ) )
						: $now->format( DATE_ATOM ),
					'lastAlertAt' => $now->format( DATE_ATOM ),
				] );

				$this->output( "Alerte envoyée : $subject\n" );
			} else {
				$this->output( "Alerte toujours active : aucun nouveau mail envoyé.\n" );
			}

			return;
		}

		if ( !empty( $state['active'] ) ) {
			$previousWikis = $state['affectedWikis'] ?? [];
			$subject = $this->buildRecoverySubject( $previousWikis );
			$body = $this->buildRecoveryBody(
				$previousWikis,
				$server,
				$logs,
				$windowMinutes,
				$state
			);

			$this->sendMail( $subject, $body );
			$this->saveState( [
				'active' => false,
				'signature' => '',
				'affectedWikis' => [],
				'recoveredAt' => $now->format( DATE_ATOM ),
			] );

			$this->output( "Mail de retour à la normale envoyé.\n" );
			return;
		}

		$this->output(
			"OK — Apache {$server['apache']}, HTTPS {$server['https']}, PHP-FPM {$server['phpFpm']}.\n"
		);
	}

	private function collectServerMetrics(): array {
		return [
			'apache' => $this->commandToInt( "pgrep -c apache2 2>/dev/null" ),
			'https' => $this->commandToInt(
				"ss -Htan state established '( sport = :443 )' 2>/dev/null | wc -l"
			),
			'phpFpm' => $this->commandToInt(
				"pgrep -fc '^php-fpm: pool webmaster_php' 2>/dev/null"
			),
		];
	}

	private function commandToInt( string $command ): int {
		$output = shell_exec( $command );

		if ( $output === null ) {
			return 0;
		}

		return max( 0, (int)trim( $output ) );
	}

	private function analyseLogs( DateTimeImmutable $since ): array {
		$result = [];

		foreach ( $this->wikis as $wiki => $logPath ) {
			$result[$wiki] = [
				'totalRequests' => 0,
				'pageRequests' => 0,
				'dynamicRequests' => 0,
				'suspiciousRequests' => 0,
				'suspiciousIps' => [],
				'ua' => [],
			];

			if ( !is_readable( $logPath ) ) {
				continue;
			}

			$command = 'tac ' . escapeshellarg( $logPath ) . ' 2>/dev/null';
			$handle = popen( $command, 'r' );

			if ( !$handle ) {
				continue;
			}

			while ( ( $line = fgets( $handle ) ) !== false ) {
				$parsed = $this->parseLogLine( $line );

				if ( !$parsed ) {
					continue;
				}

				if ( $parsed['time'] < $since ) {
					break;
				}

				$result[$wiki]['totalRequests']++;

				$class = $this->classifyRequest( $parsed['url'] );

				if ( !$class['pageLike'] ) {
					continue;
				}

				$result[$wiki]['pageRequests']++;

				if ( $class['dynamic'] ) {
					$result[$wiki]['dynamicRequests']++;
				}

				if ( $class['suspicious'] ) {
					$result[$wiki]['suspiciousRequests']++;
					$result[$wiki]['suspiciousIps'][$parsed['ip']] = true;
				}

				$ua = $parsed['ua'] !== '' ? $parsed['ua'] : '(User-Agent vide)';

				if ( !isset( $result[$wiki]['ua'][$ua] ) ) {
					$result[$wiki]['ua'][$ua] = [
						'requests' => 0,
						'dynamic' => 0,
						'suspicious' => 0,
						'ips' => [],
						'examples' => [],
					];
				}

				$result[$wiki]['ua'][$ua]['requests']++;
				$result[$wiki]['ua'][$ua]['ips'][$parsed['ip']] = true;

				if ( $class['dynamic'] ) {
					$result[$wiki]['ua'][$ua]['dynamic']++;
				}

				if ( $class['suspicious'] ) {
					$result[$wiki]['ua'][$ua]['suspicious']++;

					if ( count( $result[$wiki]['ua'][$ua]['examples'] ) < 5 ) {
						$result[$wiki]['ua'][$ua]['examples'][] = $parsed['url'];
					}
				}
			}

			pclose( $handle );
		}

		return $result;
	}

	private function parseLogLine( string $line ): ?array {
		$parts = explode( '"', rtrim( $line ) );

		if ( count( $parts ) < 6 ) {
			return null;
		}

		if ( !preg_match( '/^(\S+).*?\[([^\]]+)\]/', $parts[0], $matches ) ) {
			return null;
		}

		$time = DateTimeImmutable::createFromFormat(
			'd/M/Y:H:i:s O',
			$matches[2]
		);

		if ( !$time ) {
			return null;
		}

		$requestParts = explode( ' ', $parts[1], 3 );

		if ( count( $requestParts ) < 2 ) {
			return null;
		}

		return [
			'ip' => $matches[1],
			'time' => $time,
			'url' => $requestParts[1],
			'ua' => $parts[5] ?? '',
		];
	}

	private function classifyRequest( string $url ): array {
		$parsed = parse_url( $url );

		if ( $parsed === false ) {
			return [
				'pageLike' => false,
				'dynamic' => false,
				'suspicious' => false,
			];
		}

		$path = strtolower( $parsed['path'] ?? '' );
		$query = $parsed['query'] ?? '';

		parse_str( $query, $args );

		$argNames = [];

		foreach ( array_keys( $args ) as $name ) {
			$argNames[strtolower( (string)$name )] = true;
		}

		$action = '';

		if ( isset( $args['action'] ) ) {
			$value = $args['action'];
			$action = strtolower( is_array( $value ) ? (string)reset( $value ) : (string)$value );
		}

		$isSpecial = $this->isSpecialPath( $path );

		$pageLike = (
			str_starts_with( $path, '/wiki/' )
			|| $path === '/w/index.php'
			|| $path === '/w/api.php'
		);

		$dynamic = (
			$path === '/w/index.php'
			|| $path === '/w/api.php'
			|| $isSpecial
		);

		$suspicious = false;

		if ( $path === '/w/index.php' ) {
			if (
				$action === 'edit'
				&& ( isset( $argNames['undo'] ) || isset( $argNames['undoafter'] ) )
			) {
				$suspicious = true;
			}

			if (
				$action === 'history'
				&& (
					isset( $argNames['offset'] )
					|| isset( $argNames['dir'] )
					|| isset( $argNames['feed'] )
				)
			) {
				$suspicious = true;
			}

			foreach ( [ 'diff', 'oldid', 'mobileaction', 'redirect', 'topic_showpostid' ] as $name ) {
				if ( isset( $argNames[$name] ) ) {
					$suspicious = true;
					break;
				}
			}
		}

		return [
			'pageLike' => $pageLike,
			'dynamic' => $dynamic,
			'suspicious' => $suspicious,
		];
	}

	private function isSpecialPath( string $path ): bool {
		$markers = [
			'/wiki/special:',
			'/wiki/special%3a',
			'/wiki/sp%c3%a9cial:',
			'/wiki/sp%c3%a9cial%3a',
			'/wiki/especial:',
			'/wiki/especial%3a',
			'/wiki/speciale:',
			'/wiki/speciale%3a',
			'/wiki/spezial:',
			'/wiki/spezial%3a',
		];

		foreach ( $markers as $marker ) {
			if ( str_contains( $path, $marker ) ) {
				return true;
			}
		}

		return false;
	}

	private function detectCrawlerIssues( array $logs ): array {
		$issues = [];

		foreach ( $logs as $wiki => $data ) {
			$wikiSuspiciousIps = count( $data['suspiciousIps'] );

			if (
				$data['suspiciousRequests'] >= self::WIKI_SUSPICIOUS_REQUEST_THRESHOLD
				&& $wikiSuspiciousIps >= self::WIKI_SUSPICIOUS_IP_THRESHOLD
			) {
				$issues[] = [
					'type' => 'crawler-rotating-ua',
					'label' => 'Crawler furtif possible avec User-Agent tournants',
					'wiki' => $wiki,
					'requests' => $data['suspiciousRequests'],
					'ips' => $wikiSuspiciousIps,
				];
			}

			foreach ( $data['ua'] as $ua => $stats ) {
				$ipCount = count( $stats['ips'] );

				$isSuspiciousPattern = (
					$stats['suspicious'] >= self::UA_SUSPICIOUS_REQUEST_THRESHOLD
					&& $ipCount >= self::UA_SUSPICIOUS_IP_THRESHOLD
				);

				$isDynamicBurst = (
					$stats['dynamic'] >= self::UA_DYNAMIC_REQUEST_THRESHOLD
					&& $ipCount >= self::UA_DYNAMIC_IP_THRESHOLD
				);

				if ( !$isSuspiciousPattern && !$isDynamicBurst ) {
					continue;
				}

				$issues[] = [
					'type' => 'crawler-ua',
					'label' => 'Crawler distribué possible',
					'wiki' => $wiki,
					'ua' => $ua,
					'requests' => $stats['requests'],
					'dynamic' => $stats['dynamic'],
					'suspicious' => $stats['suspicious'],
					'ips' => $ipCount,
					'examples' => $stats['examples'],
				];
			}
		}

		return $issues;
	}

	private function getBusiestWikis( array $logs, int $limit ): array {
		$counts = [];

		foreach ( $logs as $wiki => $data ) {
			if ( $data['totalRequests'] > 0 ) {
				$counts[$wiki] = $data['totalRequests'];
			}
		}

		arsort( $counts, SORT_NUMERIC );

		return array_slice( array_keys( $counts ), 0, $limit );
	}

	private function buildIssueSignature( array $issues, array $affectedWikis ): string {
		$signatureData = [
			'wikis' => $affectedWikis,
			'issues' => [],
		];

		foreach ( $issues as $issue ) {
			$signatureData['issues'][] = [
				'type' => $issue['type'] ?? '',
				'wiki' => $issue['wiki'] ?? '',
				'ua' => $issue['ua'] ?? '',
			];
		}

		return sha1( json_encode( $signatureData, JSON_UNESCAPED_UNICODE ) );
	}

	private function buildAlertSubject( array $affectedWikis ): string {
		$wikiLabel = $affectedWikis ? implode( ', ', $affectedWikis ) : 'GLOBAL';

		return "[Alerte serveur][$wikiLabel] Charge ou crawler anormal";
	}

	private function buildRecoverySubject( array $affectedWikis ): string {
		$wikiLabel = $affectedWikis ? implode( ', ', $affectedWikis ) : 'GLOBAL';

		return "[Retour à la normale][$wikiLabel] Serveur Wikidébats";
	}

	private function buildAlertBody(
		array $affectedWikis,
		array $issues,
		array $server,
		array $logs,
		int $windowMinutes
	): string {
		$timezone = new DateTimeZone( 'Europe/Paris' );
		$now = new DateTimeImmutable( 'now', $timezone );
		$wikiLabel = $affectedWikis ? implode( ', ', $affectedWikis ) : 'GLOBAL';

		$body = "Alerte serveur Wikidébats\n";
		$body .= "========================\n\n";
		$body .= "Wiki(s) touché(s) : $wikiLabel\n";
		$body .= 'Date : ' . $now->format( 'd/m/Y H:i:s T' ) . "\n";
		$body .= "Fenêtre d’analyse : $windowMinutes minutes\n\n";

		$body .= "État du serveur\n";
		$body .= "---------------\n\n";
		$body .= "Apache : {$server['apache']} processus";
		$body .= ' (alerte à partir de ' . self::APACHE_ALERT_THRESHOLD . ")\n";
		$body .= "Connexions HTTPS établies : {$server['https']}";
		$body .= ' (alerte à partir de ' . self::HTTPS_ALERT_THRESHOLD . ")\n";
		$body .= "PHP-FPM webmaster_php : {$server['phpFpm']} workers";
		$body .= ' (alerte à partir de ' . self::PHP_FPM_ALERT_THRESHOLD . ")\n\n";

		$body .= "Anomalies détectées\n";
		$body .= "-------------------\n\n";

		foreach ( $issues as $issue ) {
			$body .= '- ' . $issue['label'];

			if ( isset( $issue['wiki'] ) ) {
				$body .= ' [' . $issue['wiki'] . ']';
			}

			$body .= "\n";

			if ( isset( $issue['value'] ) ) {
				$body .= "\tValeur : {$issue['value']} / seuil : {$issue['threshold']}\n";
			}

			if ( isset( $issue['requests'] ) ) {
				$body .= "\tRequêtes : {$issue['requests']}\n";
			}

			if ( isset( $issue['dynamic'] ) ) {
				$body .= "\tRequêtes dynamiques : {$issue['dynamic']}\n";
			}

			if ( isset( $issue['suspicious'] ) ) {
				$body .= "\tRequêtes très suspectes : {$issue['suspicious']}\n";
			}

			if ( isset( $issue['ips'] ) ) {
				$body .= "\tIP différentes : {$issue['ips']}\n";
			}

			if ( isset( $issue['ua'] ) ) {
				$body .= "\tUser-Agent : {$issue['ua']}\n";
			}

			if ( !empty( $issue['examples'] ) ) {
				$body .= "\tExemples :\n";

				foreach ( $issue['examples'] as $example ) {
					$body .= "\t\t$example\n";
				}
			}

			$body .= "\n";
		}

		$body .= "Trafic récent par wiki\n";
		$body .= "----------------------\n\n";

		$traffic = [];

		foreach ( $logs as $wiki => $data ) {
			$traffic[$wiki] = $data['totalRequests'];
		}

		arsort( $traffic, SORT_NUMERIC );

		foreach ( $traffic as $wiki => $count ) {
			$body .= "$wiki : $count requêtes\n";
		}

		return $body;
	}

	private function buildRecoveryBody(
		array $previousWikis,
		array $server,
		array $logs,
		int $windowMinutes,
		array $state
	): string {
		$timezone = new DateTimeZone( 'Europe/Paris' );
		$now = new DateTimeImmutable( 'now', $timezone );
		$wikiLabel = $previousWikis ? implode( ', ', $previousWikis ) : 'GLOBAL';

		$body = "Retour à la normale — serveur Wikidébats\n";
		$body .= "========================================\n\n";
		$body .= "Wiki(s) précédemment touché(s) : $wikiLabel\n";
		$body .= 'Date : ' . $now->format( 'd/m/Y H:i:s T' ) . "\n";

		if ( !empty( $state['startedAt'] ) ) {
			$body .= 'Début de l’alerte : ' . $state['startedAt'] . "\n";
		}

		$body .= "\nÉtat actuel\n";
		$body .= "-----------\n\n";
		$body .= "Apache : {$server['apache']} processus\n";
		$body .= "Connexions HTTPS établies : {$server['https']}\n";
		$body .= "PHP-FPM webmaster_php : {$server['phpFpm']} workers\n\n";

		$body .= "Trafic des $windowMinutes dernières minutes\n";
		$body .= str_repeat( '-', 36 ) . "\n\n";

		$traffic = [];

		foreach ( $logs as $wiki => $data ) {
			$traffic[$wiki] = $data['totalRequests'];
		}

		arsort( $traffic, SORT_NUMERIC );

		foreach ( $traffic as $wiki => $count ) {
			$body .= "$wiki : $count requêtes\n";
		}

		return $body;
	}

	private function loadState(): array {
		if ( !is_readable( self::STATE_FILE ) ) {
			return [
				'active' => false,
			];
		}

		$json = file_get_contents( self::STATE_FILE );

		if ( $json === false ) {
			return [
				'active' => false,
			];
		}

		$state = json_decode( $json, true );

		return is_array( $state ) ? $state : [ 'active' => false ];
	}

	private function saveState( array $state ): void {
		$directory = dirname( self::STATE_FILE );

		if ( !is_dir( $directory ) ) {
			if ( !mkdir( $directory, 0770, true ) && !is_dir( $directory ) ) {
				$this->fatalError( "Impossible de créer le répertoire d’état : $directory\n" );
			}
		}

		$json = json_encode(
			$state,
			JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
		);

		if ( $json === false || file_put_contents( self::STATE_FILE, $json . "\n", LOCK_EX ) === false ) {
			$this->fatalError( "Impossible d’enregistrer l’état dans " . self::STATE_FILE . "\n" );
		}
	}

	private function sendTestMail( string $configWiki ): void {
		$subject = "[Test alerte][$configWiki] Surveillance serveur Wikidébats";
		$body = "Test du système d’alerte serveur Wikidébats\n";
		$body .= "==========================================\n\n";
		$body .= "Wiki de configuration MediaWiki utilisé pour l’envoi : $configWiki\n";
		$body .= "Destinataire : " . self::RECIPIENT . "\n\n";
		$body .= "Si vous recevez ce message, l’envoi via UserMailer fonctionne.\n";

		$this->sendMail( $subject, $body );
		$this->output( "Mail de test envoyé à " . self::RECIPIENT . "\n" );
	}

	private function sendMail( string $subject, string $body ): void {
		$status = \UserMailer::send(
			new \MailAddress( self::RECIPIENT ),
			new \MailAddress( self::FROM, self::FROM_NAME ),
			$subject,
			$body
		);

		if ( !$status->isOK() ) {
			$this->fatalError(
				"Erreur lors de l’envoi du mail à "
				. self::RECIPIENT
				. ' : '
				. $status->getWikiText()
				. "\n"
			);
		}
	}
}

$maintClass = ServerHealthMail::class;
require_once RUN_MAINTENANCE_IF_MAIN;
