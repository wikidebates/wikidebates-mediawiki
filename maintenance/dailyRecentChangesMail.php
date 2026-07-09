<?php

use MediaWiki\Maintenance\Maintenance;
use MediaWiki\MediaWikiServices;

require_once __DIR__ . '/Maintenance.php';

class DailyRecentChangesMail extends Maintenance {
	public function __construct() {
		parent::__construct();

		$this->addDescription( 'Envoie par mail la liste des modifications récentes de la veille.' );
	}

	public function execute() {
		$wiki = $this->getOption( 'wiki', 'fr' );
		$wikiBase = 'https://' . $wiki . '.wikidebates.org/wiki/';
		$from = 'noreply@wikidebats.org';

		$mainRecipients = [
			'recentchanges@wikidebats.org',
		];

		$frOnlyRecipients = [
			'emmanuel.duits0697@orange.fr',
		];

		$recipients = $mainRecipients;

		if ( $wiki === 'fr' ) {
			$recipients = array_merge( $recipients, $frOnlyRecipients );
		}

		$timezone = new DateTimeZone( 'Europe/Paris' );

		$start = new DateTime( 'yesterday 00:00:00', $timezone );
		$end = new DateTime( 'today 00:00:00', $timezone );

		$startUtc = clone $start;
		$startUtc->setTimezone( new DateTimeZone( 'UTC' ) );

		$endUtc = clone $end;
		$endUtc->setTimezone( new DateTimeZone( 'UTC' ) );

		$startMw = $startUtc->format( 'YmdHis' );
		$endMw = $endUtc->format( 'YmdHis' );

		$services = MediaWikiServices::getInstance();
		$dbr = $services->getConnectionProvider()->getReplicaDatabase();
		$titleFactory = $services->getTitleFactory();

		$rows = $dbr->newSelectQueryBuilder()
			->select( [
				'rc_timestamp',
				'rc_namespace',
				'rc_title',
				'rc_type',
				'rc_log_type',
				'rc_log_action',
				'rc_bot',
				'rc_old_len',
				'rc_new_len',
				'actor_name',
				'comment_text',
			] )
			->from( 'recentchanges' )
			->join( 'actor', null, 'actor_id = rc_actor' )
			->leftJoin( 'comment', null, 'comment_id = rc_comment_id' )
			->where( [
				'rc_bot' => 0,
			] )
			->andWhere( $dbr->expr( 'rc_timestamp', '>=', $startMw ) )
			->andWhere( $dbr->expr( 'rc_timestamp', '<', $endMw ) )
			->orderBy( 'rc_timestamp', 'ASC' )
			->limit( 1000 )
			->caller( __METHOD__ )
			->fetchResultSet();

		$changes = [];

		foreach ( $rows as $row ) {
			$title = $titleFactory->makeTitleSafe(
				(int)$row->rc_namespace,
				$row->rc_title
			);

			if ( !$title ) {
				continue;
			}

			if ( !in_array( (int)$row->rc_namespace, [ NS_MAIN, NS_USER ], true ) ) {
				continue;
			}

			$changes[] = [
				'timestamp' => $row->rc_timestamp,
				'namespace' => (int)$row->rc_namespace,
				'title' => $title->getPrefixedText(),
				'url' => $wikiBase . str_replace( '%2F', '/', rawurlencode( str_replace( ' ', '_', $title->getPrefixedText() ) ) ),
				'user' => $row->actor_name,
				'comment' => $row->comment_text ?? '',
				'type' => $row->rc_type,
				'log_type' => $row->rc_log_type,
				'log_action' => $row->rc_log_action,
				'oldlen' => $row->rc_old_len,
				'newlen' => $row->rc_new_len,
			];
		}

		$dateLabel = $start->format( 'd/m/Y' );

		if ( !$changes ) {
			$this->output( "Aucune modification récente le $dateLabel : aucun mail envoyé.\n" );

			return;
		}

		$changeCount = count( $changes );
		$changeLabel = $changeCount > 1 ? 'modifications' : 'modification';
		$subjectPrefix = $wiki === 'fr' ? 'Résumé quotidien' : 'Daily summary (' . $wiki . ')';
		$subject = $subjectPrefix . ' — ' . $changeCount . " $changeLabel le $dateLabel";

		$body = "Modifications récentes du $dateLabel\n";
		$body .= str_repeat( '=', 40 ) . "\n\n";

			$groupTitles = [
				'page-deletions' => 'Suppressions de pages',
				'content-deletions' => 'Suppressions de contenus',
				'page-creations' => 'Créations de pages',
				'page-edits' => 'Modifications de contenus',
				'user-creations' => 'Créations de comptes utilisateurs',
				'user-blocks' => 'Blocages d’utilisateurs',
				'page-restorations' => 'Restaurations de pages',
				'page-moves' => 'Renommages de pages',
				'page-protections' => 'Protections de pages',
				'file-uploads' => 'Imports de fichiers',
				'user-rights' => 'Modifications des droits utilisateur',
				'other-logs' => 'Autres entrées de journal',
				'other' => 'Autres modifications',
			];

			$groupedChanges = array_fill_keys( array_keys( $groupTitles ), [] );

			foreach ( $changes as $change ) {
				$date = DateTime::createFromFormat(
					'YmdHis',
					$change['timestamp'],
					new DateTimeZone( 'UTC' )
				);

				$date->setTimezone( $timezone );

				$time = $date->format( 'H:i' );
				$title = $change['title'];
				$user = $change['user'];
				$comment = $change['comment'];
				$url = $change['url'];
				$type = (int)$change['type'];
				$logType = $change['log_type'] ?? '';
				$logAction = $change['log_action'] ?? '';
				$pageTitle = preg_replace( '/^Utilisateur:/', '', $title );

				$displayTitle = $title;
				$groupKey = 'other';
				$showUser = true;
				$showComment = $comment !== '';
				$showDiff = false;

				$diff = '';
				$delta = null;

				if ( $change['oldlen'] !== null && $change['newlen'] !== null ) {
					$delta = (int)$change['newlen'] - (int)$change['oldlen'];
					$diff = $delta >= 0 ? "+$delta" : (string)$delta;
					$diff .= ' octets';
					$showDiff = true;
				}

				if ( $type === 3 ) {
					$showDiff = false;

					if ( $logType === 'newusers' ) {
						$displayTitle = 'Création du compte utilisateur : ' . $pageTitle;
						$groupKey = 'user-creations';
						$showUser = false;
						$showComment = false;
					} elseif ( $logType === 'delete' && $logAction === 'delete' ) {
						$displayTitle = 'Suppression de la page : ' . $title;
						$groupKey = 'page-deletions';
					} elseif ( $logType === 'delete' && $logAction === 'restore' ) {
						$displayTitle = 'Restauration de la page : ' . $title;
						$groupKey = 'page-restorations';
					} elseif ( $logType === 'block' ) {
						$displayTitle = 'Blocage de l\'utilisateur : ' . $pageTitle;
						$groupKey = 'user-blocks';
						$showUser = false;
					} elseif ( $logType === 'move' ) {
						$displayTitle = 'Renommage de la page : ' . $title;
						$groupKey = 'page-moves';
					} elseif ( $logType === 'protect' ) {
						$displayTitle = 'Protection de la page : ' . $title;
						$groupKey = 'page-protections';
					} elseif ( $logType === 'upload' ) {
						$displayTitle = 'Import du fichier : ' . $title;
						$groupKey = 'file-uploads';
					} elseif ( $logType === 'rights' ) {
						$displayTitle = 'Modification des droits de l\'utilisateur : ' . $pageTitle;
						$groupKey = 'user-rights';
					} else {
						$displayTitle = 'Entrée de journal (' . $logType . '/' . $logAction . ') : ' . $title;
						$groupKey = 'other-logs';
					}
				} elseif ( $type === 1 || $type === 2 ) {
					$displayTitle = 'Création de la page : ' . $title;
					$groupKey = 'page-creations';

					if ( $comment === 'Création de la page' ) {
						$showComment = false;
					}
				} elseif ( $type === 0 ) {
					if ( $delta !== null && $delta <= -100 ) {
						$displayTitle = 'Suppression de contenu sur la page : ' . $title;
						$groupKey = 'content-deletions';
					} else {
						$displayTitle = 'Modification de la page : ' . $title;
						$groupKey = 'page-edits';
					}
				} else {
					$displayTitle = 'Modification de la page : ' . $title;
				}

				$entry = "[$time] $displayTitle\n";

				if ( $showUser ) {
					$entry .= "Par l'utilisateur : $user\n";
				}

				if ( $showDiff && $diff !== '' ) {
					$entry .= "Différence : $diff\n";
				}

				if ( $showComment ) {
					$entry .= "Résumé : $comment\n";
				}

				$entry .= "Lien : $url\n";

				$groupedChanges[$groupKey][] = $entry;
			}

			foreach ( $groupTitles as $groupKey => $groupTitle ) {
				if ( !$groupedChanges[$groupKey] ) {
					continue;
				}

				$count = count( $groupedChanges[$groupKey] );
				$body .= "\n$groupTitle ($count)\n";
				$body .= str_repeat( '-', mb_strlen( $groupTitle . " ($count)" ) ) . "\n\n";
				$body .= implode( "\n", $groupedChanges[$groupKey] );
				$body .= "\n";
			}

		foreach ( $recipients as $recipient ) {
			$status = \UserMailer::send(
				new \MailAddress( $recipient ),
				new \MailAddress( $from, 'Wikidébats' ),
				$subject,
				$body
			);

			if ( !$status->isOK() ) {
				$this->fatalError( "Erreur lors de l'envoi du mail à $recipient : " . $status->getWikiText() . "\n" );
			}

			$this->output( "Mail envoyé à $recipient\n" );
		}
	}
}

$maintClass = DailyRecentChangesMail::class;
require_once RUN_MAINTENANCE_IF_MAIN;
