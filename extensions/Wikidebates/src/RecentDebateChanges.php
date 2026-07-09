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
	private const PARENT_PROPERTY_EN = 'Parent debate';
	private const BREADCRUMB_PROPERTY_FR = "Fil d'Ariane";
	private const BREADCRUMB_PROPERTY_EN = 'Breadcrumb';
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
				return '<div class="error">No debate page given</div>';
			}

			if ( $limit < 1 ) {
				$limit = 1;
			} elseif ( $limit > self::MAX_LIMIT ) {
				$limit = self::MAX_LIMIT;
			}

			$items = self::fetchRecentChanges( $parser, $frame, $page, $limit, $skipUser );

			if ( !$items ) {
				return '<div class="aucun-contenu">Aucune contribution récente n\'a été enregistrée.</div>';
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
			return '<div class="error">No title given</div>';
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
			return '<div class="error">No debate ID</div>';
		}

		$parentPropertyIds = self::findPropertyIds(
			$dbr,
			[ self::getParentPropertyLabel() ]
		);

		$breadcrumbPropertyIds = self::findPropertyIds(
			$dbr,
			[ self::getBreadcrumbPropertyLabel() ]
		);

		if ( !$parentPropertyIds ) {
			return '<div class="error">No semantic property given</div>';
		}

		$res = $dbr->newSelectQueryBuilder()
			->select( [
				'child_id'		=> 'child_ids.smw_id',
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
				'child_ids.smw_id = smw_di_wikipage.s_id'
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
				'smw_di_wikipage.o_id' => $debateId,
				'smw_di_wikipage.p_id' => $parentPropertyIds
			] )
			->orderBy( 'rev.rev_timestamp', 'DESC' )
			->limit( $limit + 10 )
			->fetchResultSet();

		$rows = [];
		$childIds = [];

		foreach ( $res as $row ) {
			$childId = (int)( $row->child_id ?? 0 );

			if ( !$childId ) {
				continue;
			}

			$rows[] = $row;
			$childIds[] = $childId;
		}

		if ( !$rows ) {
			return [];
		}

		$breadcrumbsById = self::fetchBreadcrumbsBySubjectIds(
			$dbr,
			$childIds,
			$breadcrumbPropertyIds
		);

		$lang = MediaWikiServices::getInstance()->getContentLanguage();
		$items = [];

		foreach ( $rows as $row ) {
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

			$timestamp = (string)( $row->rev_timestamp ?? '' );
			$dateText = $timestamp !== ''
				? $lang->date( $timestamp, false )
				: '';

			$childId = (int)( $row->child_id ?? 0 );
			$breadcrumb = trim( (string)( $breadcrumbsById[$childId] ?? '' ) );
			$argumentConcerne = self::extractArgumentConcerne( $breadcrumb );

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

	private static function fetchBreadcrumbsBySubjectIds( $dbr, array $subjectIds, array $breadcrumbPropertyIds ): array {
		$subjectIds = array_values(
			array_unique(
				array_map(
					'intval',
					$subjectIds
				)
			)
		);

		$breadcrumbPropertyIds = array_values(
			array_unique(
				array_map(
					'intval',
					$breadcrumbPropertyIds
				)
			)
		);

		if ( !$subjectIds || !$breadcrumbPropertyIds ) {
			return [];
		}

		$res = $dbr->newSelectQueryBuilder()
			->select( [
				's_id',
				'o_blob',
				'o_hash'
			] )
			->from( 'smw_di_blob' )
			->where( [
				's_id' => $subjectIds,
				'p_id' => $breadcrumbPropertyIds
			] )
			->fetchResultSet();

		$out = [];

		foreach ( $res as $row ) {
			$sid = (int)( $row->s_id ?? 0 );

			if ( !$sid ) {
				continue;
			}

			$value = '';

			if ( isset( $row->o_blob ) && $row->o_blob !== null && $row->o_blob !== '' ) {
				$value = (string)$row->o_blob;
			} elseif ( isset( $row->o_hash ) && $row->o_hash !== null && $row->o_hash !== '' ) {
				$value = (string)$row->o_hash;
			}

			$value = trim( $value );

			if ( $value !== '' ) {
				$out[$sid] = $value;
			}
		}

		return $out;
	}

	private static function getWikiLangCode(): string {
		$lang = MediaWikiServices::getInstance()->getContentLanguage();
		return strtolower( $lang->getCode() );
	}

	private static function getParentPropertyLabel(): string {
		return self::getWikiLangCode() === 'en'
			? self::PARENT_PROPERTY_EN
			: self::PARENT_PROPERTY_FR;
	}

	private static function getBreadcrumbPropertyLabel(): string {
		return self::getWikiLangCode() === 'en'
			? self::BREADCRUMB_PROPERTY_EN
			: self::BREADCRUMB_PROPERTY_FR;
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
