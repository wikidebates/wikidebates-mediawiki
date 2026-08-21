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
	private const WIKI_DYNAMIC_REQUEST_THRESHOLD = 300;
	private const WIKI_DYNAMIC_IP_THRESHOLD = 200;

	private const API_POST_BURST_REQUEST_THRESHOLD = 20;
	private const API_POST_BURST_IP_THRESHOLD = 15;

	private const INTERNAL_BOT_UA_PREFIX = 'ChatGPT/wikidebia_update';
	private const INTERNAL_BOT_IPS = [
		'2a01:4f9:6b:29e3::2',
	];

	private const MAX_RECENT_DYNAMIC_LINES = 100;
	private const MAX_RECENT_SUSPICIOUS_LINES = 100;
	private const MAX_UA_LINES = 25;
	private const MAX_MAIL_LINES_PER_WIKI = 40;
	private const MAX_TOP_UAS = 10;
	private const MAX_TOP_URLS = 15;
	private const MAX_TOP_ALL_UAS = 10;
	private const MAX_TOP_PATHS = 15;
	private const MAX_TOP_IPS = 10;
	private const MAX_API_POST_UAS = 10;

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
			'Envoie immédiatement un mail de test avec un diagnostic des logs récents, sans modifier l’état des alertes.',
			false,
			false
		);
	}

	public function execute() {
		$windowMinutes = max( 1, (int)$this->getOption( 'window', 5 ) );
		$configWiki = strtoupper( (string)$this->getOption( 'wiki', 'fr' ) );

		$now = new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) );
		$since = $now->sub( new DateInterval( 'PT' . $windowMinutes . 'M' ) );

		$server = $this->collectServerMetrics();
		$logs = $this->analyseLogs( $since );

		if ( $this->hasOption( 'test-mail' ) ) {
			$this->sendTestMail( $configWiki, $server, $logs, $windowMinutes );
			return;
		}

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
				'rawTotalRequests' => 0,
				'internalRequests' => 0,
				'internalIps' => [],
				'totalRequests' => 0,
				'pageRequests' => 0,
				'dynamicRequests' => 0,
				'dynamicIps' => [],
				'suspiciousRequests' => 0,
				'allIps' => [],
				'ipRequestCounts' => [],
				'methods' => [],
				'statuses' => [],
				'allUa' => [],
				'paths' => [],
				'apiPostRequests' => 0,
				'apiPostIps' => [],
				'apiPostUa' => [],
				'recentApiPostLines' => [],
				'suspiciousIps' => [],
				'dynamicUrls' => [],
				'recentDynamicLines' => [],
				'recentSuspiciousLines' => [],
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

				$result[$wiki]['rawTotalRequests']++;

				if ( $this->isIgnoredInternalBot( $parsed['ua'], $parsed['ip'] ) ) {
					$result[$wiki]['internalRequests']++;
					$result[$wiki]['internalIps'][$parsed['ip']] = true;
					continue;
				}

				$result[$wiki]['totalRequests']++;
				$result[$wiki]['allIps'][$parsed['ip']] = true;
				$result[$wiki]['ipRequestCounts'][$parsed['ip']] = ( $result[$wiki]['ipRequestCounts'][$parsed['ip']] ?? 0 ) + 1;

				$method = strtoupper( (string)$parsed['method'] );
				$status = (string)$parsed['status'];
				$ua = $this->normalizeUserAgent( $parsed['ua'] );
				$safeUrl = $this->sanitizeUrl( $parsed['url'] );
				$safeReferrer = $this->sanitizeUrl( $parsed['referrer'] );
				$formattedLine = $this->formatLogLine(
					$parsed,
					$safeUrl,
					$safeReferrer
				);

				$result[$wiki]['methods'][$method] = ( $result[$wiki]['methods'][$method] ?? 0 ) + 1;
				$result[$wiki]['statuses'][$status] = ( $result[$wiki]['statuses'][$status] ?? 0 ) + 1;

				if ( !isset( $result[$wiki]['allUa'][$ua] ) ) {
					$result[$wiki]['allUa'][$ua] = [
						'requests' => 0,
						'ips' => [],
					];
				}

				$result[$wiki]['allUa'][$ua]['requests']++;
				$result[$wiki]['allUa'][$ua]['ips'][$parsed['ip']] = true;

				$urlParts = parse_url( $parsed['url'] );
				$path = is_array( $urlParts ) ? (string)( $urlParts['path'] ?? '' ) : '';
				$path = $path !== '' ? $path : '(chemin vide)';

				if ( !isset( $result[$wiki]['paths'][$path] ) ) {
					$result[$wiki]['paths'][$path] = [
						'count' => 0,
						'ips' => [],
					];
				}

				$result[$wiki]['paths'][$path]['count']++;
				$result[$wiki]['paths'][$path]['ips'][$parsed['ip']] = true;

				if ( $method === 'POST' && strtolower( $path ) === '/w/api.php' ) {
					$result[$wiki]['apiPostRequests']++;
					$result[$wiki]['apiPostIps'][$parsed['ip']] = true;

					if ( !isset( $result[$wiki]['apiPostUa'][$ua] ) ) {
						$result[$wiki]['apiPostUa'][$ua] = [
							'requests' => 0,
							'ips' => [],
							'lines' => [],
						];
					}

					$result[$wiki]['apiPostUa'][$ua]['requests']++;
					$result[$wiki]['apiPostUa'][$ua]['ips'][$parsed['ip']] = true;

					if ( count( $result[$wiki]['apiPostUa'][$ua]['lines'] ) < self::MAX_UA_LINES ) {
						$result[$wiki]['apiPostUa'][$ua]['lines'][] = $formattedLine;
					}

					if ( count( $result[$wiki]['recentApiPostLines'] ) < self::MAX_RECENT_DYNAMIC_LINES ) {
						$result[$wiki]['recentApiPostLines'][] = $formattedLine;
					}
				}

				$class = $this->classifyRequest( $parsed['url'] );

				if ( !$class['pageLike'] ) {
					continue;
				}

				$result[$wiki]['pageRequests']++;

				if ( $class['dynamic'] ) {
					$result[$wiki]['dynamicRequests']++;
					$result[$wiki]['dynamicIps'][$parsed['ip']] = true;

					if ( !isset( $result[$wiki]['dynamicUrls'][$safeUrl] ) ) {
						$result[$wiki]['dynamicUrls'][$safeUrl] = [
							'count' => 0,
							'ips' => [],
						];
					}

					$result[$wiki]['dynamicUrls'][$safeUrl]['count']++;
					$result[$wiki]['dynamicUrls'][$safeUrl]['ips'][$parsed['ip']] = true;

					if ( count( $result[$wiki]['recentDynamicLines'] ) < self::MAX_RECENT_DYNAMIC_LINES ) {
						$result[$wiki]['recentDynamicLines'][] = $formattedLine;
					}
				}

				if ( $class['suspicious'] ) {
					$result[$wiki]['suspiciousRequests']++;
					$result[$wiki]['suspiciousIps'][$parsed['ip']] = true;

					if ( count( $result[$wiki]['recentSuspiciousLines'] ) < self::MAX_RECENT_SUSPICIOUS_LINES ) {
						$result[$wiki]['recentSuspiciousLines'][] = $formattedLine;
					}
				}

				if ( !isset( $result[$wiki]['ua'][$ua] ) ) {
					$result[$wiki]['ua'][$ua] = [
						'requests' => 0,
						'dynamic' => 0,
						'suspicious' => 0,
						'ips' => [],
						'examples' => [],
						'lines' => [],
					];
				}

				$result[$wiki]['ua'][$ua]['requests']++;
				$result[$wiki]['ua'][$ua]['ips'][$parsed['ip']] = true;

				if ( $class['dynamic'] ) {
					$result[$wiki]['ua'][$ua]['dynamic']++;
				}

				if ( $class['suspicious'] ) {
					$result[$wiki]['ua'][$ua]['suspicious']++;
				}

				if (
					( $class['dynamic'] || $class['suspicious'] )
					&& count( $result[$wiki]['ua'][$ua]['lines'] ) < self::MAX_UA_LINES
				) {
					$result[$wiki]['ua'][$ua]['lines'][] = $formattedLine;
				}

				if (
					$class['suspicious']
					&& count( $result[$wiki]['ua'][$ua]['examples'] ) < 8
				) {
					$result[$wiki]['ua'][$ua]['examples'][] = $safeUrl;
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

		$statusAndBytes = preg_split( '/\s+/', trim( $parts[2] ) );

		return [
			'ip' => $matches[1],
			'time' => $time,
			'method' => $requestParts[0],
			'url' => $requestParts[1],
			'status' => $statusAndBytes[0] ?? '?',
			'bytes' => $statusAndBytes[1] ?? '?',
			'referrer' => $parts[3] ?? '',
			'ua' => $parts[5] ?? '',
		];
	}

	private function isIgnoredInternalBot( string $ua, string $ip ): bool {
		if ( !str_starts_with( $ua, self::INTERNAL_BOT_UA_PREFIX ) ) {
			return false;
		}

		return in_array( $ip, self::INTERNAL_BOT_IPS, true );
	}

	private function normalizeUserAgent( string $ua ): string {
		if ( $ua === '' ) {
			return '(User-Agent vide)';
		}

		$normalized = strtolower( $ua );

		if ( str_contains( $normalized, 'meta-webindexer/' ) ) {
			return 'Meta-WebIndexer';
		}

		return $ua;
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

		$isSpecial = $this->isSpecialPath( $path ) || $this->isSpecialTitleArgument( $args );

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

			foreach ( [ 'diff', 'oldid', 'redirect', 'topic_showpostid' ] as $name ) {
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

	private function isSpecialTitleArgument( array $args ): bool {
		if ( !isset( $args['title'] ) ) {
			return false;
		}

		$title = $args['title'];
		$title = strtolower( is_array( $title ) ? (string)reset( $title ) : (string)$title );

		foreach ( [ 'special:', 'spécial:', 'especial:', 'speciale:', 'spezial:' ] as $prefix ) {
			if ( str_starts_with( $title, $prefix ) ) {
				return true;
			}
		}

		return false;
	}

	private function sanitizeUrl( string $url ): string {
		if ( $url === '' || $url === '-' ) {
			return $url;
		}

		$parts = parse_url( $url );

		if ( $parts === false || !isset( $parts['query'] ) ) {
			return $url;
		}

		$sensitiveNames = [
			'token',
			'accesstoken',
			'access_token',
			'auth',
			'authorization',
			'password',
			'pass',
			'wppassword',
			'csrf',
			'csrftoken',
			'session',
			'sessionid',
			'secret',
			'key',
			'apikey',
			'api_key',
		];

		$queryParts = explode( '&', $parts['query'] );
		$sanitizedParts = [];

		foreach ( $queryParts as $queryPart ) {
			$pair = explode( '=', $queryPart, 2 );
			$name = strtolower( rawurldecode( $pair[0] ) );

			if ( in_array( $name, $sensitiveNames, true ) ) {
				$sanitizedParts[] = $pair[0] . '=[REDACTED]';
				continue;
			}

			$sanitizedParts[] = $queryPart;
		}

		$sanitizedQuery = implode( '&', $sanitizedParts );
		$beforeQuery = strstr( $url, '?', true );

		if ( $beforeQuery === false ) {
			return $url;
		}

		return $beforeQuery . '?' . $sanitizedQuery;
	}

	private function formatLogLine(
		array $parsed,
		string $safeUrl,
		string $safeReferrer
	): string {
		$time = $parsed['time']
			->setTimezone( new DateTimeZone( 'Europe/Paris' ) )
			->format( 'Y-m-d H:i:s T' );

		$line = $time;
		$line .= ' | IP=' . $parsed['ip'];
		$line .= ' | ' . $parsed['method'] . ' ' . $safeUrl;
		$line .= ' | HTTP=' . $parsed['status'];
		$line .= ' | bytes=' . $parsed['bytes'];

		if ( $safeReferrer !== '' && $safeReferrer !== '-' ) {
			$line .= ' | ref=' . $safeReferrer;
		}

		$line .= ' | UA=' . ( $parsed['ua'] !== '' ? $parsed['ua'] : '(vide)' );

		return $line;
	}

	private function detectCrawlerIssues( array $logs ): array {
		$issues = [];

		foreach ( $logs as $wiki => $data ) {
			$wikiSuspiciousIps = count( $data['suspiciousIps'] );
			$wikiDynamicIps = count( $data['dynamicIps'] );
			$isWikiDynamicDistributed = (
				$data['dynamicRequests'] >= self::WIKI_DYNAMIC_REQUEST_THRESHOLD
				&& $wikiDynamicIps >= self::WIKI_DYNAMIC_IP_THRESHOLD
			);

			if ( $isWikiDynamicDistributed ) {
				$issues[] = [
					'type' => 'crawler-wiki-dynamic-distributed',
					'label' => 'Crawler distribué massif avec User-Agent tournants',
					'wiki' => $wiki,
					'requests' => $data['totalRequests'],
					'dynamic' => $data['dynamicRequests'],
					'ips' => $wikiDynamicIps,
					'logLines' => array_slice(
						$data['recentDynamicLines'],
						0,
						self::MAX_MAIL_LINES_PER_WIKI
					),
				];
			}

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
					'logLines' => array_slice(
						$data['recentSuspiciousLines'],
						0,
						self::MAX_MAIL_LINES_PER_WIKI
					),
				];
			}

			foreach ( $data['apiPostUa'] as $ua => $stats ) {
				$ipCount = count( $stats['ips'] );

				if (
					$stats['requests'] >= self::API_POST_BURST_REQUEST_THRESHOLD
					&& $ipCount >= self::API_POST_BURST_IP_THRESHOLD
				) {
					$issues[] = [
						'type' => 'crawler-api-post-distributed',
						'label' => 'Burst distribué de POST vers /w/api.php',
						'wiki' => $wiki,
						'ua' => $ua,
						'requests' => $stats['requests'],
						'ips' => $ipCount,
						'logLines' => array_slice(
							$stats['lines'],
							0,
							self::MAX_MAIL_LINES_PER_WIKI
						),
					];
				}
			}

			if ( $isWikiDynamicDistributed ) {
				continue;
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
					'logLines' => array_slice(
						$stats['lines'],
						0,
						self::MAX_MAIL_LINES_PER_WIKI
					),
				];
			}
		}

		return $issues;
	}

	private function getBusiestWikis( array $logs, int $limit ): array {
		$counts = [];

		foreach ( $logs as $wiki => $data ) {
			if ( $data['rawTotalRequests'] > 0 ) {
				$counts[$wiki] = $data['rawTotalRequests'];
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
				$body .= "\tExemples d’URL :\n";

				foreach ( $issue['examples'] as $example ) {
					$body .= "\t\t$example\n";
				}
			}

			if ( !empty( $issue['logLines'] ) ) {
				$body .= "\tLignes de requêtes associées :\n";

				foreach ( $issue['logLines'] as $logLine ) {
					$body .= "\t\t$logLine\n";
				}
			}

			$body .= "\n";
		}

		$body .= $this->buildTrafficSummary( $logs );
		$body .= $this->buildWikiDiagnostics( $affectedWikis, $logs );

		$body .= "\nBloc à transmettre pour analyse\n";
		$body .= "===============================\n\n";
		$body .= "Le bloc « Diagnostic détaillé » ci-dessus contient les informations ";
		$body .= "nécessaires pour analyser le crawler et adapter les règles Cloudflare ";
		$body .= "sans devoir se reconnecter au serveur.\n";

		return $body;
	}

	private function buildTrafficSummary( array $logs ): string {
		$body = "Trafic récent par wiki\n";
		$body .= "----------------------\n\n";

		$traffic = [];

		foreach ( $logs as $wiki => $data ) {
			$traffic[$wiki] = $data['rawTotalRequests'];
		}

		arsort( $traffic, SORT_NUMERIC );

		foreach ( $traffic as $wiki => $rawCount ) {
			$data = $logs[$wiki];
			$body .= "$wiki : {$data['totalRequests']} requêtes analysées";
			$body .= " | brutes=$rawCount";
			$body .= " | internes ignorées={$data['internalRequests']}";
			$body .= ' | IP=' . count( $data['allIps'] );
			$body .= " | pages={$data['pageRequests']}";
			$body .= " | dynamiques={$data['dynamicRequests']}";
			$body .= ' | IP dynamiques=' . count( $data['dynamicIps'] );
			$body .= " | POST API={$data['apiPostRequests']}";
			$body .= " | très suspectes={$data['suspiciousRequests']}\n";
		}

		$body .= "\n";

		return $body;
	}

	private function buildWikiDiagnostics( array $affectedWikis, array $logs ): string {
		if ( !$affectedWikis ) {
			return '';
		}

		$body = "Diagnostic détaillé\n";
		$body .= "===================\n\n";

		foreach ( $affectedWikis as $wiki ) {
			if ( !isset( $logs[$wiki] ) ) {
				continue;
			}

			$data = $logs[$wiki];

			$body .= "### $wiki ###\n\n";
			$body .= "Requêtes brutes : {$data['rawTotalRequests']}\n";
			$body .= "Requêtes internes ignorées : {$data['internalRequests']}\n";
			$body .= "Requêtes analysées : {$data['totalRequests']}\n";
			$body .= 'IP distinctes sur le trafic analysé : ' . count( $data['allIps'] ) . "\n";
			$body .= "Requêtes de pages : {$data['pageRequests']}\n";
			$body .= "Requêtes dynamiques : {$data['dynamicRequests']}\n";
			$body .= 'IP distinctes sur requêtes dynamiques : ' . count( $data['dynamicIps'] ) . "\n";
			$body .= "POST vers /w/api.php : {$data['apiPostRequests']}\n";
			$body .= "Requêtes très suspectes : {$data['suspiciousRequests']}\n";
			$body .= 'IP distinctes sur requêtes très suspectes : ';
			$body .= count( $data['suspiciousIps'] ) . "\n\n";

			$body .= $this->buildAllTrafficDiagnostics( $data );
			$body .= $this->buildTopUserAgents( $data );
			$body .= $this->buildTopDynamicUrls( $data );
			$body .= $this->buildRelevantLogLines( $data );
		}

		return $body;
	}

	private function buildAllTrafficDiagnostics( array $data ): string {
		$body = "Méthodes HTTP\n";
		$body .= "-------------\n\n";

		$methods = $data['methods'];
		arsort( $methods, SORT_NUMERIC );

		if ( !$methods ) {
			$body .= "Aucune méthode HTTP disponible.\n\n";
		} else {
			foreach ( $methods as $method => $count ) {
				$body .= "$method : $count\n";
			}

			$body .= "\n";
		}

		$body .= "Codes HTTP\n";
		$body .= "----------\n\n";

		$statuses = $data['statuses'];
		arsort( $statuses, SORT_NUMERIC );

		if ( !$statuses ) {
			$body .= "Aucun code HTTP disponible.\n\n";
		} else {
			foreach ( $statuses as $status => $count ) {
				$body .= "$status : $count\n";
			}

			$body .= "\n";
		}

		$body .= $this->buildTopAllUserAgents( $data );
		$body .= $this->buildTopPaths( $data );
		$body .= $this->buildTopIps( $data );
		$body .= $this->buildApiPostDiagnostics( $data );

		return $body;
	}

	private function buildTopAllUserAgents( array $data ): string {
		$uas = $data['allUa'];

		uasort( $uas, static function ( array $a, array $b ): int {
			if ( $a['requests'] !== $b['requests'] ) {
				return $b['requests'] <=> $a['requests'];
			}

			return count( $b['ips'] ) <=> count( $a['ips'] );
		} );

		$body = "User-Agent les plus actifs — tout le trafic\n";
		$body .= "---------------------------------------------\n\n";
		$shown = 0;

		foreach ( $uas as $ua => $stats ) {
			$body .= 'UA : ' . $ua . "\n";
			$body .= "	Requêtes : {$stats['requests']}\n";
			$body .= "	IP différentes : " . count( $stats['ips'] ) . "\n\n";
			$shown++;

			if ( $shown >= self::MAX_TOP_ALL_UAS ) {
				break;
			}
		}

		if ( $shown === 0 ) {
			$body .= "Aucun User-Agent disponible.\n\n";
		}

		return $body;
	}

	private function buildTopPaths( array $data ): string {
		$paths = $data['paths'];

		uasort( $paths, static function ( array $a, array $b ): int {
			if ( $a['count'] !== $b['count'] ) {
				return $b['count'] <=> $a['count'];
			}

			return count( $b['ips'] ) <=> count( $a['ips'] );
		} );

		$body = "Chemins les plus demandés — tout le trafic\n";
		$body .= "-------------------------------------------\n\n";
		$shown = 0;

		foreach ( $paths as $path => $stats ) {
			$body .= $stats['count'] . ' requête(s)';
			$body .= ' | ' . count( $stats['ips'] ) . ' IP';
			$body .= ' | ' . $path . "\n";
			$shown++;

			if ( $shown >= self::MAX_TOP_PATHS ) {
				break;
			}
		}

		if ( $shown === 0 ) {
			$body .= "Aucun chemin disponible.\n";
		}

		$body .= "\n";

		return $body;
	}

	private function buildTopIps( array $data ): string {
		$ipCounts = [];

		foreach ( $data['allUa'] as $stats ) {
			foreach ( $stats['ips'] as $ip => $_ ) {
				$ipCounts[$ip] = 0;
			}
		}

		foreach ( $data['paths'] as $stats ) {
			foreach ( $stats['ips'] as $ip => $_ ) {
				if ( !isset( $ipCounts[$ip] ) ) {
					$ipCounts[$ip] = 0;
				}
			}
		}

		foreach ( $data['ipRequestCounts'] ?? [] as $ip => $count ) {
			$ipCounts[$ip] = $count;
		}

		arsort( $ipCounts, SORT_NUMERIC );

		$body = "IP les plus actives — tout le trafic\n";
		$body .= "------------------------------------\n\n";
		$shown = 0;

		foreach ( $ipCounts as $ip => $count ) {
			$body .= "$count requête(s) | $ip\n";
			$shown++;

			if ( $shown >= self::MAX_TOP_IPS ) {
				break;
			}
		}

		if ( $shown === 0 ) {
			$body .= "Aucune IP disponible.\n";
		}

		$body .= "\n";

		return $body;
	}

	private function buildApiPostDiagnostics( array $data ): string {
		$body = "POST vers /w/api.php\n";
		$body .= "--------------------\n\n";
		$body .= "Total : {$data['apiPostRequests']}\n";
		$body .= 'IP différentes : ' . count( $data['apiPostIps'] ) . "\n\n";

		if ( $data['apiPostRequests'] === 0 ) {
			$body .= "Aucun POST vers /w/api.php dans la fenêtre analysée.\n\n";
			return $body;
		}

		$uas = $data['apiPostUa'];
		uasort( $uas, static function ( array $a, array $b ): int {
			if ( $a['requests'] !== $b['requests'] ) {
				return $b['requests'] <=> $a['requests'];
			}

			return count( $b['ips'] ) <=> count( $a['ips'] );
		} );

		$body .= "User-Agent des POST API\n";
		$body .= "-----------------------\n\n";
		$shown = 0;

		foreach ( $uas as $ua => $stats ) {
			$body .= 'UA : ' . $ua . "\n";
			$body .= "	Requêtes : {$stats['requests']}\n";
			$body .= "	IP différentes : " . count( $stats['ips'] ) . "\n\n";
			$shown++;

			if ( $shown >= self::MAX_API_POST_UAS ) {
				break;
			}
		}

		$body .= "Requêtes POST API récentes\n";
		$body .= "---------------------------\n\n";

		foreach ( array_slice( $data['recentApiPostLines'], 0, self::MAX_MAIL_LINES_PER_WIKI ) as $line ) {
			$body .= $line . "\n";
		}

		$body .= "\n";

		return $body;
	}

	private function buildTopUserAgents( array $data ): string {
		$uas = $data['ua'];

		uasort( $uas, static function ( array $a, array $b ): int {
			if ( $a['suspicious'] !== $b['suspicious'] ) {
				return $b['suspicious'] <=> $a['suspicious'];
			}

			if ( $a['dynamic'] !== $b['dynamic'] ) {
				return $b['dynamic'] <=> $a['dynamic'];
			}

			return $b['requests'] <=> $a['requests'];
		} );

		$body = "User-Agent les plus pertinents\n";
		$body .= "------------------------------\n\n";

		$shown = 0;

		foreach ( $uas as $ua => $stats ) {
			if ( $stats['dynamic'] === 0 && $stats['suspicious'] === 0 ) {
				continue;
			}

			$body .= 'UA : ' . $ua . "\n";
			$body .= "\tRequêtes : {$stats['requests']}\n";
			$body .= "\tDynamiques : {$stats['dynamic']}\n";
			$body .= "\tTrès suspectes : {$stats['suspicious']}\n";
			$body .= "\tIP différentes : " . count( $stats['ips'] ) . "\n\n";

			$shown++;

			if ( $shown >= self::MAX_TOP_UAS ) {
				break;
			}
		}

		if ( $shown === 0 ) {
			$body .= "Aucun User-Agent dynamique pertinent.\n\n";
		}

		return $body;
	}

	private function buildTopDynamicUrls( array $data ): string {
		$urls = $data['dynamicUrls'];

		uasort( $urls, static function ( array $a, array $b ): int {
			if ( $a['count'] !== $b['count'] ) {
				return $b['count'] <=> $a['count'];
			}

			return count( $b['ips'] ) <=> count( $a['ips'] );
		} );

		$body = "URL dynamiques les plus demandées\n";
		$body .= "---------------------------------\n\n";

		$shown = 0;

		foreach ( $urls as $url => $stats ) {
			$body .= $stats['count'] . ' requête(s)';
			$body .= ' | ' . count( $stats['ips'] ) . ' IP';
			$body .= ' | ' . $url . "\n";

			$shown++;

			if ( $shown >= self::MAX_TOP_URLS ) {
				break;
			}
		}

		if ( $shown === 0 ) {
			$body .= "Aucune URL dynamique dans la fenêtre analysée.\n";
		}

		$body .= "\n";

		return $body;
	}

	private function buildRelevantLogLines( array $data ): string {
		$lines = $data['recentSuspiciousLines'];

		if ( count( $lines ) < self::MAX_MAIL_LINES_PER_WIKI ) {
			foreach ( $data['recentDynamicLines'] as $line ) {
				if ( in_array( $line, $lines, true ) ) {
					continue;
				}

				$lines[] = $line;

				if ( count( $lines ) >= self::MAX_MAIL_LINES_PER_WIKI ) {
					break;
				}
			}
		}

		$body = "Requêtes pertinentes récentes\n";
		$body .= "-----------------------------\n\n";

		if ( !$lines ) {
			$body .= "Aucune requête dynamique récente disponible.\n\n";
			return $body;
		}

		foreach ( $lines as $line ) {
			$body .= $line . "\n";
		}

		$body .= "\n";

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
			$traffic[$wiki] = $data['rawTotalRequests'];
		}

		arsort( $traffic, SORT_NUMERIC );

		foreach ( $traffic as $wiki => $rawCount ) {
			$data = $logs[$wiki];
			$body .= "$wiki : {$data['totalRequests']} analysées";
			$body .= " | brutes=$rawCount";
			$body .= " | internes ignorées={$data['internalRequests']}";
			$body .= " | dynamiques={$data['dynamicRequests']}";
			$body .= ' | IP dynamiques=' . count( $data['dynamicIps'] ) . "\n";
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

	private function sendTestMail(
		string $configWiki,
		array $server,
		array $logs,
		int $windowMinutes
	): void {
		$diagnosticWikis = $this->getBusiestWikis( $logs, 3 );
		$wikiLabel = $diagnosticWikis ? implode( ', ', $diagnosticWikis ) : $configWiki;

		$subject = "[Test alerte][$wikiLabel] Diagnostic crawler Wikidébats";
		$body = "Test du système d’alerte serveur Wikidébats\n";
		$body .= "==========================================\n\n";
		$body .= "Wiki de configuration MediaWiki utilisé pour l’envoi : $configWiki\n";
		$body .= "Destinataire : " . self::RECIPIENT . "\n";
		$body .= "Fenêtre d’analyse : $windowMinutes minutes\n\n";
		$body .= "Apache : {$server['apache']} processus\n";
		$body .= "Connexions HTTPS établies : {$server['https']}\n";
		$body .= "PHP-FPM webmaster_php : {$server['phpFpm']} workers\n\n";
		$body .= $this->buildTrafficSummary( $logs );
		$body .= $this->buildWikiDiagnostics( $diagnosticWikis, $logs );

		$this->sendMail( $subject, $body );
		$this->output( "Mail de test diagnostique envoyé à " . self::RECIPIENT . "\n" );
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
