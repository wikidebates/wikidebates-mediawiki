<?php

namespace MediaWiki\Extension\Wikidebates;

use MediaWiki\MediaWikiServices;
use Parser;
use PPFrame;
use Title;

class RecentDebateChanges {

	private const DEFAULT_LIMIT = 100;
	private const MAX_LIMIT = 200;
	private const PARENT_PROPERTY_FR = 'Débat parent';
	private const PARENT_PROPERTY_EN = 'Debate parent';
	private const BREADCRUMB_SEPARATOR = '⟭';

	public static function register( Parser $parser ): void {
		$parser->setFunctionHook(
			'recentdebatechanges',
			[ self::class, 'render' ],
			Parser::SFH_OBJECT_ARGS
		);
	}

	public static function render( Parser $parser, PPFrame $frame, array $args ): string {
		try {
			$params = self::parseArgs( $frame, $args );

			$page = trim( (string)( $params['page'] ?? '' ) );
			$limit = (int)( $params['limit'] ?? self::DEFAULT_LIMIT );
			$skipUser = trim( (string)( $params['skipuser'] ?? '' ) );

			if ( $page === '' ) {
				$title = $parser->getTitle();
				$page = $title ? $title->getPrefixedText() : '';
			}

			if ( $page === '' ) {
				return '';
			}

			if ( $limit < 1 ) {
				$limit = 1;
			} elseif ( $limit > self::MAX_LIMIT ) {
				$limit = self::MAX_LIMIT;
			}

			$items = self::fetchRecentChanges( $parser, $frame, $page, $limit, $skipUser );

			if ( !$items ) {
				return '<ul class="onglet-externe"></ul>';
			}

			$out = [];
			$out[] = '<ul class="onglet-externe">';

			foreach ( $items as $item ) {
				$line = '<li>';
				$line .= self::makeWikiLink( $item['title'], $item['title'] );

				if ( $item['summary'] !== '' ) {
					$line .= ' : ' . htmlspecialchars( $item['summary'] );
				}

				$line .= ' (par ' . self::makeWikiLink( $item['user_page'], $item['user_label'] ) . ', le ' . htmlspecialchars( $item['date_text'] ) . ')';
				$line .= ' ([[Special:History/' . str_replace( ' ', '_', $item['title'] ) . '|historique]])';

				if ( $item['argument_concerne'] !== '' ) {
					$line .= ' (argument concerné : ' . self::makeWikiLink( $item['argument_concerne'], $item['argument_concerne'] ) . ')';
				}

				$line .= '</li>';
				$out[] = $line;
			}

			$out[] = '</ul>';

			return implode( "\n", $out );

		} catch ( \Throwable $e ) {
			return '<pre style="color:red;">'
				. htmlspecialchars( get_class( $e ) . ': ' . $e->getMessage() )
				. '</pre>';
		}
	}

	private static function parseArgs( PPFrame $frame, array $args ): array {
		$out = [];

		foreach ( $args as $key => $value ) {
			if ( is_string( $key ) ) {
				$out[strtolower( trim( $key ) )] = trim( (string)$frame->expand( $value ) );
				continue;
			}

			$expanded = trim( (string)$frame->expand( $value ) );

			if ( $expanded === '' ) {
				continue;
			}

			$pos = strpos( $expanded, '=' );

			if ( $pos === false ) {
				continue;
			}

			$name = strtolower( trim( substr( $expanded, 0, $pos ) ) );
			$val = trim( substr( $expanded, $pos + 1 ) );

			if ( $name !== '' ) {
				$out[$name] = $val;
			}
		}

		return $out;
	}

	private static function fetchRecentChanges( Parser $parser, PPFrame $frame, string $debatePage, int $limit, string $skipUser ): array {
		$title = Title::newFromText( $debatePage );

		if ( !$title ) {
			return [];
		}

		$dbr = MediaWikiServices::getInstance()
			->getDBLoadBalancerFactory()
			->getReplicaDatabase();

		$debateId = self::findSmwObjectId(
			$dbr,
			$title->getDBkey(),
			$title->getNamespace()
		);

		if ( !$debateId ) {
			return [];
		}

		$parentPropertyIds = self::findPropertyIds(
			$dbr,
			[
				self::PARENT_PROPERTY_FR,
				self::PARENT_PROPERTY_EN
			]
		);

		if ( !$parentPropertyIds ) {
			return [];
		}

		$res = $dbr->newSelectQueryBuilder()
			->select( [
				'child_title'	=> 'child_ids.smw_title',
				'child_ns'		=> 'child_ids.smw_namespace',
				'rev_timestamp'	=> 'rev.rev_timestamp',
				'actor_name'	=> 'actor.actor_name',
				'comment_text'	=> 'comment_store.comment_text'
			] )
			->from( 'smw_di_wikipage' )
			->join(
				'smw_object_ids',
				'child_ids',
				'child_ids.smw_id = s_id'
			)
			->join(
				'page',
				'page',
				'page.page_namespace = child_ids.smw_namespace AND page.page_title = child_ids.smw_title'
			)
			->leftJoin(
				'revision',
				'rev',
				'rev.rev_id = page.page_latest'
			)
			->leftJoin(
				'actor',
				'actor',
				'actor.actor_id = rev.rev_actor'
			)
			->leftJoin(
				'comment',
				'comment_store',
				'comment_store.comment_id = rev.rev_comment_id'
			)
			->where( [
				'o_id' => $debateId,
				'p_id' => $parentPropertyIds
			] )
			->orderBy( 'rev.rev_timestamp', 'DESC' )
			->limit( $limit + 10 )
			->fetchResultSet();

		$lang = MediaWikiServices::getInstance()->getContentLanguage();
		$items = [];

		foreach ( $res as $row ) {
			$childTitle = Title::makeTitleSafe(
				(int)$row->child_ns,
				(string)$row->child_title
			);

			if ( !$childTitle ) {
				continue;
			}

			$userName = trim( (string)( $row->actor_name ?? '' ) );

			if ( self::shouldSkipUser( $skipUser, $userName ) ) {
				continue;
			}

			$breadcrumb = self::getBreadcrumbViaShow( $parser, $frame, $childTitle->getPrefixedText() );
			$argumentConcerne = self::extractArgumentConcerne( $breadcrumb );

			$timestamp = (string)( $row->rev_timestamp ?? '' );
			$dateText = $timestamp !== ''
				? $lang->date( $timestamp, false )
				: '';

			$items[] = [
				'title'				=> $childTitle->getPrefixedText(),
				'user_page'			=> self::normalizeUserPage( $userName ),
				'user_label'		=> self::normalizeUserLabel( $userName ),
				'date_text'			=> $dateText,
				'summary'			=> trim( (string)( $row->comment_text ?? '' ) ),
				'argument_concerne'	=> $argumentConcerne
			];

			if ( count( $items ) >= $limit ) {
				break;
			}
		}

		return $items;
	}

	private static function findSmwObjectId( $dbr, string $dbKey, int $namespace ): ?int {
		$row = $dbr->newSelectQueryBuilder()
			->select( [ 'smw_id' ] )
			->from( 'smw_object_ids' )
			->where( [
				'smw_title' => $dbKey,
				'smw_namespace' => $namespace
			] )
			->fetchRow();

		if ( !$row || !isset( $row->smw_id ) ) {
			return null;
		}

		return (int)$row->smw_id;
	}

	private static function findPropertyIds( $dbr, array $labels ): array {
		$dbKeys = [];

		foreach ( $labels as $label ) {
			$propertyTitle = Title::newFromText( $label, SMW_NS_PROPERTY );

			if ( !$propertyTitle ) {
				continue;
			}

			$dbKeys[] = $propertyTitle->getDBkey();
		}

		if ( !$dbKeys ) {
			return [];
		}

		$res = $dbr->newSelectQueryBuilder()
			->select( [ 'smw_id' ] )
			->from( 'smw_object_ids' )
			->where( [
				'smw_namespace' => SMW_NS_PROPERTY,
				'smw_title' => $dbKeys
			] )
			->fetchResultSet();

		$ids = [];

		foreach ( $res as $row ) {
			$ids[] = (int)$row->smw_id;
		}

		return $ids;
	}

	private static function getBreadcrumbViaShow( Parser $parser, PPFrame $frame, string $pageTitle ): string {
		$pageTitle = str_replace( '|', '{{!}}', $pageTitle );

		$wikitext =
			'{{#show: ' . $pageTitle
			. ' | ?Fil d\'Ariane'
			. ' | format=plainlist'
			. ' | sep='
			. '}}';

		$raw = trim( (string)$parser->recursivePreprocess( $wikitext, $frame ) );

		if ( $raw === '' ) {
			return '';
		}

		$raw = trim( strip_tags( $raw ) );

		return $raw;
	}

	private static function extractArgumentConcerne( string $breadcrumb ): string {
		if ( $breadcrumb === '' ) {
			return '';
		}

		$parts = array_map(
			static function ( $part ) {
				return trim( $part );
			},
			explode( self::BREADCRUMB_SEPARATOR, $breadcrumb )
		);

		if ( count( $parts ) > 2 && $parts[1] !== '' ) {
			return $parts[1];
		}

		return '';
	}

	private static function shouldSkipUser( string $skipUser, string $userName ): bool {
		$skipUser = trim( $skipUser );
		$userName = trim( $userName );

		if ( $skipUser === '' || $userName === '' ) {
			return false;
		}

		$normalizedSkip = preg_replace( '/^(Utilisateur:|User:)/u', '', $skipUser );
		$normalizedUser = preg_replace( '/^(Utilisateur:|User:)/u', '', $userName );

		return $normalizedSkip === $normalizedUser;
	}

	private static function normalizeUserPage( string $userName ): string {
		$userName = preg_replace( '/^(Utilisateur:|User:)/u', '', trim( $userName ) );
		return 'Utilisateur:' . $userName;
	}

	private static function normalizeUserLabel( string $userName ): string {
		return preg_replace( '/^(Utilisateur:|User:)/u', '', trim( $userName ) );
	}

	private static function makeWikiLink( string $target, string $label ): string {
		return '[[' . $target . '|' . $label . ']]';
	}
}
