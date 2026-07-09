<?php

namespace MediaWiki\Extension\Wikidebates;

use MediaWiki\Auth\AuthManager;
use OutputPage;
use Parser;
use Skin;

class Hooks {

	public static function onBeforePageDisplay( OutputPage $out, Skin $skin ): void {
		$skinName = $skin->getSkinName();

		if ( in_array( $skinName, [ 'minerva', 'minervaneue', 'minervaNeue' ], true ) ) {
			$out->addModules( [ 'ext.wikidebates.boot.minerva' ] );
			return;
		}

		if ( $skinName === 'vector-2022' || $skinName === 'vector' ) {
			$out->addModules( [ 'ext.wikidebates.boot.vector' ] );
			return;
		}
	}

	public static function onParserFirstCallInit( Parser $parser ): void {
		RecentDebateChanges::register( $parser );
	}

	public static function onPageSaveComplete(
		$wikiPage,
		$user,
		$summary,
		$flags,
		$revisionRecord,
		$editResult
	): void {
		AutoParentLink::onPageSaveComplete(
			$wikiPage,
			$user,
			$summary,
			$flags,
			$revisionRecord,
			$editResult
		);
	}
	
	public static function onAuthChangeFormFields(
		$requests,
		$fieldInfo,
		&$formDescriptor,
		$action
	): void {
		if ( $action !== AuthManager::ACTION_CREATE ) {
			return;
		}

		if ( isset( $formDescriptor['email'] ) ) {
			$formDescriptor['email']['required'] = true;
		}
	}
}
