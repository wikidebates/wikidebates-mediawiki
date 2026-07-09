<?php

use MediaWiki\MediaWikiServices;
use MediaWiki\Parser\Parser;
use MediaWiki\Parser\ParserOutput;
use MediaWiki\Title\Title;

class InterlanguageCentralExtension {

	/**
	 * Register parser function
	 */
	public static function onParserFirstCallInit( Parser $parser ) {
		$parser->setFunctionHook(
			'languagelink',
			[ self::class, 'languagelink' ],
			Parser::SFH_NO_HASH
		);
		return true;
	}

	/**
	 * Parser function {{#languagelink:lang|title}}
	 */
	public static function languagelink( Parser $parser, $lang, $title = "" ) {
		if ( strlen( $lang ) && strlen( $title ) ) {
			return "[[$lang:$title]][[:$lang:$title]]";
		}
		return "";
	}

	/**
	 * Trigger purge job when interlanguage links change
	 */
	public static function onLinksUpdate( $linksUpdate ) {

		$title = $linksUpdate->getTitle();
		if ( !$title instanceof Title ) {
			return true;
		}

		$oldILL = self::getILL( DB_REPLICA, $title );

		if ( method_exists( $linksUpdate, 'getInterlanguageLinks' ) ) {
			$newILL = $linksUpdate->getInterlanguageLinks();
		} else {
			$parserOutput = $linksUpdate->getParserOutput();
			$newILL = $parserOutput instanceof ParserOutput
				? $parserOutput->getLanguageLinks()
				: [];
		}

		if ( !is_array( $newILL ) ) {
			$newILL = [];
		}

		foreach ( $newILL as $k => $v ) {
			if ( !is_array( $v ) ) {
				$newILL[$k] = [ $v => true ];
			}
		}

		if (
			count( array_udiff_assoc( $oldILL, $newILL, [ self::class, 'arrayCompareKeys' ] ) ) ||
			count( array_udiff_assoc( $newILL, $oldILL, [ self::class, 'arrayCompareKeys' ] ) )
		) {
			$ill = array_merge_recursive( $oldILL, $newILL );
			$job = new InterlanguageCentralExtensionPurgeJob( $title, [ 'ill' => $ill ] );
			MediaWikiServices::getInstance()
				->getJobQueueGroup()
				->push( $job );
		}

		return true;
	}

	/**
	 * Get language links stored in DB
	 */
	public static function getILL( int $db, Title $title ) {

		$dbr = wfGetDB( $db );

		$res = $dbr->select(
			'langlinks',
			[ 'll_lang', 'll_title' ],
			[ 'll_from' => $title->getArticleID() ],
			__METHOD__
		);

		$a = [];

		foreach ( $res as $row ) {
			if ( !isset( $a[$row->ll_lang] ) ) {
				$a[$row->ll_lang] = [];
			}
			$a[$row->ll_lang][$row->ll_title] = true;
		}

		return $a;
	}

	/**
	 * Compare arrays
	 */
	public static function arrayCompareKeys( $a, $b ) {
		return count( array_diff_key( $a, $b ) )
			? 1
			: ( count( array_diff_key( $b, $a ) ) ? -1 : 0 );
	}

	/**
	 * Inject central interlanguage links
	 */
	public static function onLanguageLinks( Title $title, &$links, &$linkFlags ) {

		$pageId = $title->getArticleID();
		if ( !$pageId ) {
			return true;
		}

		$a = [];

		foreach ( $links as $l ) {
			[ $lang, $titleText ] = explode( ':', $l );
			$a[$lang] = $titleText;
		}

		$dbr = wfGetDB( DB_REPLICA );

		$conds = [ 'ill_from' => $pageId ];

		if ( $a ) {
			$conds[] = 'ill_lang NOT IN (' . $dbr->makeList( array_keys( $a ) ) . ')';
		}

		$res = $dbr->select(
			'interlanguage_links',
			[ 'ill_lang', 'ill_title' ],
			$conds,
			__METHOD__
		);

		foreach ( $res as $row ) {
			if ( isset( $a[$row->ill_lang] ) ) {
				continue;
			}

			$a[$row->ill_lang] = true;
			$links[] = $row->ill_lang . ':' . $row->ill_title;
		}

		return true;
	}
}
