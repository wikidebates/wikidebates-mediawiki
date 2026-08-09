<?php

namespace MediaWiki\Extension\Wikidebates;

use MediaWiki\MediaWikiServices;
use Parser;
use PPFrame;
use Title;

class RecentDebateChanges {

	private const DEFAULT_LIMIT = 100;
	private const MAX_LIMIT = 200;
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

			if ( $page === '' ) {
				$title = $parser->getTitle();
				$page = $title ? $title->getPrefixedText() : '';
			}

			if ( $page === '' ) {
				return self::makeError( 'wikidebates-recent-changes-error-no-page' );
			}

			if ( $limit < 1 ) {
				$limit = 1;
			} elseif ( $limit > self::MAX_LIMIT ) {
				$limit = self::MAX_LIMIT;
			}

			$items = self::fetchRecentChanges( $parser, $frame, $page, $limit );

			if ( is_string( $items ) ) {
				return $items;
			}

			if ( !$items ) {
				return '<div class="aucun-contenu">'
					. htmlspecialchars( self::msg( 'wikidebates-recent-changes-none' ) )
					. '</div>';
			}

			$out = [];
			$out[] = '<ul class="onglet-externe">';

			foreach ( $items as $item ) {
				$line = '<li>';
				$line .= self::makeWikiLink( $item['title'], $item['title'] );

				if ( $item['summary'] !== '' ) {
					$line .= ' : ' . htmlspecialchars( $item['summary'] );
				}

				$authorDate = self::msg(
					'wikidebates-recent-changes-author-date',
					self::makeWikiLink( $item['user_page'], $item['user_label'] ),
					$item['date_text']
				);
				$line .= ' (' . $authorDate . ')';

				$historyLabel = self::msg( 'wikidebates-recent-changes-history' );
				$line .= ' ([[Special:History/' . str_replace( ' ', '_', $item['title'] ) . '|' . $historyLabel . ']])';

				if ( $item['argument_concerne'] !== '' ) {
					$relatedArgument = self::msg(
						'wikidebates-recent-changes-related-argument',
						self::makeWikiLink( $item['argument_concerne'], $item['argument_concerne'] )
					);
					$line .= ' (' . $relatedArgument . ')';
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

	private static function fetchRecentChanges( Parser $parser, PPFrame $frame, string $debatePage, int $limit ): array|string {
		$title = Title::newFromText( $debatePage );

		if ( !$title ) {
			return self::makeError( 'wikidebates-recent-changes-error-invalid-title' );
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
			return self::makeError( 'wikidebates-recent-changes-error-no-debate-id' );
		}

		$parentPropertyLabel = self::msg( 'wikidebates-recent-changes-parent-property' );
		$breadcrumbPropertyLabel = self::msg( 'wikidebates-recent-changes-breadcrumb-property' );

		$parentPropertyIds = self::findPropertyIds(
			$dbr,
			[ $parentPropertyLabel ]
		);

		$breadcrumbPropertyIds = self::findPropertyIds(
			$dbr,
			[ $breadcrumbPropertyLabel ]
		);

		if ( !$parentPropertyIds ) {
			return self::makeError(
				'wikidebates-recent-changes-error-no-semantic-property',
				$parentPropertyLabel
			);
		}

		$rows = [];
		$childIds = [];
		$botStatusByUserId = [];
		$batchSize = max( 100, $limit );
		$offset = 0;

		do {
			$res = $dbr->newSelectQueryBuilder()
				->select( [
					'child_id'		=> 'child_ids.smw_id',
					'child_title'	=> 'child_ids.smw_title',
					'child_ns'		=> 'child_ids.smw_namespace',
					'rev_timestamp'	=> 'rev.rev_timestamp',
					'actor_user'	=> 'actor.actor_user',
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
				->orderBy( 'child_ids.smw_id', 'ASC' )
				->limit( $batchSize )
				->offset( $offset )
				->fetchResultSet();

			$batchCount = 0;

			foreach ( $res as $row ) {
				$batchCount++;

				$childId = (int)( $row->child_id ?? 0 );
				$userId = (int)( $row->actor_user ?? 0 );

				if ( !$childId || self::isBotUser( $userId, $botStatusByUserId ) ) {
					continue;
				}

				$rows[] = $row;
				$childIds[] = $childId;

				if ( count( $rows ) >= $limit ) {
					break;
				}
			}

			$offset += $batchCount;
		} while ( count( $rows ) < $limit && $batchCount === $batchSize );

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

	private static function isBotUser( int $userId, array &$botStatusByUserId ): bool {
		if ( $userId <= 0 ) {
			return false;
		}

		if ( array_key_exists( $userId, $botStatusByUserId ) ) {
			return $botStatusByUserId[$userId];
		}

		$services = MediaWikiServices::getInstance();
		$user = $services->getUserFactory()->newFromId( $userId );
		$groups = $services->getUserGroupManager()->getUserGroups( $user );

		$botStatusByUserId[$userId] = in_array( 'bot', $groups, true );

		return $botStatusByUserId[$userId];
	}

	private static function normalizeUserPage( string $userName ): string {
		$userLabel = self::normalizeUserLabel( $userName );
		$userTitle = Title::makeTitleSafe( NS_USER, $userLabel );

		return $userTitle ? $userTitle->getPrefixedText() : $userLabel;
	}

	private static function normalizeUserLabel( string $userName ): string {
		return preg_replace( '/^(Utilisateur:|User:)/u', '', trim( $userName ) );
	}

	private static function msg( string $key, ...$params ): string {
		return wfMessage( $key, ...$params )
			->inLanguage( MediaWikiServices::getInstance()->getContentLanguage() )
			->text();
	}

	private static function makeError( string $key, ...$params ): string {
		return '<div class="error">'
			. htmlspecialchars( self::msg( $key, ...$params ) )
			. '</div>';
	}

	private static function makeWikiLink( string $target, string $label ): string {
		return '[[' . $target . '|' . $label . ']]';
	}
}
