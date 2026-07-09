<?php
/**
 * Copyright © 2006 Yuri Astrakhan "<Firstname><Lastname>@gmail.com"
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 * http://www.gnu.org/copyleft/gpl.html
 *
 * @file
 */

use MediaWiki\MediaWikiServices;

/**
 * A query module to list all langlinks (links to corresponding foreign language pages).
 *
 * @ingroup API
 */
class ApiQueryLangLinks extends ApiQueryBase {

	protected $wikirougeForeignDb;

	protected $selectedLang = [];

	public function __construct( ApiQuery $query, $moduleName ) {
		parent::__construct( $query, $moduleName, 'll' );
	}

	/**
	 * @param array $pageId
	 * @param array $params
	 * @param array $prop
	 * @param Title[] $goodTitles
	 */
	private function addResultByPageId( $pageId, $params, $prop, $goodTitles ) {
		global $wgInterlanguageExtensionInterwiki;

		if ( !$pageId || !$wgInterlanguageExtensionInterwiki ) {
			return;
		}

		$llLang = substr( $wgInterlanguageExtensionInterwiki, 0, -1 );
		$gt = current( $goodTitles );

		$db = $this->getDB();
		$res = $db->select(
			'page',
			[ 'page_id', 'page_namespace', 'page_title' ],
			[ 'page_id' => $pageId ],
			__METHOD__
		);
		foreach ( $res as $row ) {
			$title = Title::makeTitle( $row->page_namespace, $row->page_title );
			$obj = [
				'll_lang' => $llLang,
				'll_title' => InterlanguageExtension::getCanonicalTitleText( $title ),
				'll_from' => $gt->getArticleID(),
			];
			$this->addResult( (object)$obj, $params, $prop );
		}
	}

	private function addResult( $row, $params, $prop ) {
		$entry = [ 'lang' => $row->ll_lang ];
		if ( isset( $prop['url'] ) ) {
			$title = Title::newFromText( "{$row->ll_lang}:{$row->ll_title}" );
			if ( $title ) {
				$entry['url'] = wfExpandUrl( $title->getFullURL(), PROTO_CURRENT );
			}
		}
		if ( isset( $prop['langname'] ) ) {
			$entry['langname'] = Language::fetchLanguageName( $row->ll_lang, $params['inlanguagecode'] );
		}
		if ( isset( $prop['autonym'] ) ) {
			$entry['autonym'] = Language::fetchLanguageName( $row->ll_lang );
		}
		ApiResult::setContentValue( $entry, 'title', $row->ll_title );
		return $this->addPageSubItem( $row->ll_from, $entry );
	}

	public function execute() {
		global $wgLanguageCode;

		if ( $this->getPageSet()->getGoodTitleCount() == 0 ) {
			return;
		}

		$params = $this->extractRequestParams();
		$prop = array_flip( (array)$params['prop'] );

		if ( isset( $params['title'] ) && !isset( $params['lang'] ) ) {
			$this->dieWithError(
				[
					'apierror-invalidparammix-mustusewith',
					$this->encodeParamName( 'title' ),
					$this->encodeParamName( 'lang' ),
				],
				'invalidparammix'
			);
		}

		// Handle deprecated param
		$this->requireMaxOneParameter( $params, 'url', 'prop' );
		if ( $params['url'] ) {
			$prop = [ 'url' => 1 ];
		}

		$this->addFields( [
			'll_from',
			'll_lang',
			'll_title'
		] );

		$this->addTables( 'langlinks' );

		$goodTitles = $this->getPageSet()->getGoodTitles();
		if ( self::getInterlanguageExtensionDB() ) {
			$canonicalTitleText = [];
			foreach ( $goodTitles as $t ) {
				$canonicalTitleText[] = InterlanguageExtension::getCanonicalTitleText( $t );
			}

			$db = $this->getDB();
			$llFrom = $db->selectFieldValues(
				'langlinks',
				'll_from',
				[
					'll_title' => $canonicalTitleText,
					'll_lang' => $wgLanguageCode,
				],
				__METHOD__
			);
			$this->addResultByPageId( $llFrom, $params, $prop, $goodTitles );
		} else {
			$llFrom = array_keys( $goodTitles );
		}
		if ( !$llFrom ) {
			$this->execute_wikirouge( $params, $prop );
			return;
		}
		$this->addWhereFld( 'll_from', $llFrom );

		if ( !is_null( $params['continue'] ) ) {
			$cont = explode( '|', $params['continue'] );
			$this->dieContinueUsageIf( count( $cont ) != 2 );
			$op = $params['dir'] == 'descending' ? '<' : '>';
			$llFrom = (int)$cont[0];
			$lllang = $this->getDB()->addQuotes( $cont[1] );
			$this->addWhere(
				"ll_from $op $llFrom OR " .
				"(ll_from = $llFrom AND " .
				"ll_lang $op= $lllang)"
			);
		}

		// FIXME: (follow-up) To allow extensions to add to the language links, we need
		//       to load them all, add the extra links, then apply paging.
		//       Should not be terrible, it's not going to be more than a few hundred links.

		// Note that, since (ll_from, ll_lang) is a unique key, we don't need
		// to sort by ll_title to ensure deterministic ordering.
		$sort = ( $params['dir'] == 'descending' ? ' DESC' : '' );
		if ( isset( $params['lang'] ) ) {
			$this->addWhereFld( 'll_lang', $params['lang'] );
			if ( isset( $params['title'] ) ) {
				$this->addWhereFld( 'll_title', $params['title'] );
			}
			$this->addOption( 'ORDER BY', 'll_from' . $sort );
		} else {
			// Don't order by ll_from if it's constant in the WHERE clause
			if ( count( $this->getPageSet()->getGoodTitles() ) == 1 ) {
				$this->addOption( 'ORDER BY', 'll_lang' . $sort );
			} else {
				$this->addOption( 'ORDER BY', [
					'll_from' . $sort,
					'll_lang' . $sort
				] );
			}
		}

		$this->addOption( 'LIMIT', $params['limit'] + 1 );

		$db = $this->getDB();
		$extraQuery = [
			'where' =>  'll_lang != ' . $db->addQuotes( $wgLanguageCode ),
		];
		$res = $this->select( __METHOD__, $extraQuery );

		$count = 0;
		$fit = true;
		foreach ( $res as $row ) {
			if ( ++$count > $params['limit'] ) {
				// We've reached the one extra which shows that
				// there are additional pages to be had. Stop here...
				$this->setContinueEnumParameter( 'continue', "{$row->ll_from}|{$row->ll_lang}" );
				break;
			}
			$this->selectedLang[$row->ll_lang] = true;
			$fit = $this->addResult( $row, $params, $prop );
			if ( !$fit ) {
				$this->setContinueEnumParameter( 'continue', "{$row->ll_from}|{$row->ll_lang}" );
				break;
			}
		}

		if ( $count <= $params['limit'] && $fit ) {
			$this->execute_wikirouge( $params, $prop );
		} elseif ( $this->selectedLang ) {
			$this->selectedLang = [];
		}
	}

	public function execute_wikirouge( $params, $prop ) {
		global $wgLanguageCode;

		$this->resetQueryParams();
		$this->addFields( [ 'ill_from', 'ill_lang', 'ill_title' ] );

		$this->addTables( 'interlanguage_links' );

		$goodTitles = $this->getPageSet()->getGoodTitles();
		if ( self::getInterlanguageExtensionDB() ) {
			$canonicalTitleText = [];
			foreach ( $goodTitles as $t ) {
				$canonicalTitleText[] = InterlanguageExtension::getCanonicalTitleText( $t );
			}

			$db = $this->getDB();
			$llFrom = $db->selectFieldValues(
				'interlanguage_links',
				'ill_from',
				[
					'ill_title' => $canonicalTitleText,
					'ill_lang' => $wgLanguageCode,
				],
				__METHOD__
			);
			$this->addResultByPageId( $llFrom, $params, $prop, $goodTitles );
		} else {
			$llFrom = array_keys( $goodTitles );
		}
		if ( !$llFrom ) {
			return;
		}
		$this->addWhereFld( 'ill_from', $llFrom );

		// FIXME: (follow-up) To allow extensions to add to the language links, we need
		//       to load them all, add the extra links, then apply paging.
		//       Should not be terrible, it's not going to be more than a few hundred links.

		// Note that, since (ll_from, ll_lang) is a unique key, we don't need
		// to sort by ll_title to ensure deterministic ordering.
		$sort = ( $params['dir'] == 'descending' ? ' DESC' : '' );
		if ( isset( $params['lang'] ) ) {
			$this->addWhereFld( 'ill_lang', $params['lang'] );
			if ( isset( $params['title'] ) ) {
				$this->addWhereFld( 'ill_title', $params['title'] );
			}
			$this->addOption( 'ORDER BY', 'ill_from' . $sort );
		} else {
			// Don't order by ll_from if it's constant in the WHERE clause
			if ( count( $this->getPageSet()->getGoodTitles() ) == 1 ) {
				$this->addOption( 'ORDER BY', 'ill_lang' . $sort );
			} else {
				$this->addOption( 'ORDER BY', [ 'ill_from' . $sort, 'ill_lang' . $sort ] );
			}
		}

//		$this->addOption( 'LIMIT', $params['limit'] + 1 );

		$this->selectedLang[$wgLanguageCode] = true;
		$db = $this->getDB();
		$extraQuery = [
			'where' => 'ill_lang NOT IN (' . $db->makeList( array_keys( $this->selectedLang ) ) . ')',
		];
		$res = $this->select( __METHOD__, $extraQuery );

		foreach ( $res as $row ) {
			$obj = [
				'll_lang' => $row->ill_lang,
				'll_title' => $row->ill_title,
				'll_from' => $row->ill_from,
			];
			$this->addResult( (object)$obj, $params, $prop );
		}
	}

	public static function getInterlanguageExtensionDB() {
		global $wgInterlanguageExtensionDB;

		if ( !isset( $wgInterlanguageExtensionDB ) || !$wgInterlanguageExtensionDB ) {
			return false;
		}
		return $wgInterlanguageExtensionDB;
	}

	/**
	 * Get the Query database connection (read-only)
	 * @return IDatabase
	 */
	public function getDB() {
		$interlanguageExtensionDB = self::getInterlanguageExtensionDB();

		if ( !$interlanguageExtensionDB ) {
			return parent::getDB();
		}

		if ( is_null( $this->wikirougeForeignDb ) ) {
			$this->wikirougeForeignDb = wfGetDB( DB_REPLICA, [], $interlanguageExtensionDB );
		}

		return $this->wikirougeForeignDb;
	}

	public function getCacheMode( $params ) {
		return 'public';
	}

	public function getAllowedParams() {
		return [
			'prop' => [
				ApiBase::PARAM_ISMULTI => true,
				ApiBase::PARAM_TYPE => [
					'url',
					'langname',
					'autonym',
				],
				ApiBase::PARAM_HELP_MSG_PER_VALUE => [],
			],
			'lang' => null,
			'title' => null,
			'dir' => [
				ApiBase::PARAM_DFLT => 'ascending',
				ApiBase::PARAM_TYPE => [
					'ascending',
					'descending'
				]
			],
			'inlanguagecode' => MediaWikiServices::getInstance()->getContentLanguage()->getCode(),
			'limit' => [
				ApiBase::PARAM_DFLT => 10,
				ApiBase::PARAM_TYPE => 'limit',
				ApiBase::PARAM_MIN => 1,
				ApiBase::PARAM_MAX => ApiBase::LIMIT_BIG1,
				ApiBase::PARAM_MAX2 => ApiBase::LIMIT_BIG2
			],
			'continue' => [
				ApiBase::PARAM_HELP_MSG => 'api-help-param-continue',
			],
			'url' => [
				ApiBase::PARAM_DFLT => false,
				ApiBase::PARAM_DEPRECATED => true,
			],
		];
	}

	protected function getExamplesMessages() {
		return [
			'action=query&prop=langlinks&titles=Main%20Page&redirects='
				=> 'apihelp-query+langlinks-example-simple',
		];
	}

	public function getHelpUrls() {
		return 'https://www.mediawiki.org/wiki/Special:MyLanguage/API:Langlinks';
	}
}
