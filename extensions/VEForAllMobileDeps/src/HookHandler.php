<?php

namespace VEForAllMobileDeps;

use MediaWiki\Hook\BeforePageDisplayHook;
use OutputPage;
use Skin;

class HookHandler implements BeforePageDisplayHook {

	public function onBeforePageDisplay( $out, $skin ): void {
		//	Ne rien faire si ce n'est pas Minerva (mobile)
		if ( $skin->getSkinName() !== 'minerva' ) {
			return;
		}

		//	Charger les modules VisualEditor (ton bloc existant)
		$out->addModules( [
			'ext.visualEditor.targetLoader',
			'ext.visualEditor.core',
			'ext.visualEditor.mobile',			//	s’il n’existe pas dans ta 1.43, pas grave
			'ext.visualEditor.mwcore',
			'ext.visualEditor.mediawiki',
			'ext.visualEditor.base'
		] );

		//	➕ Styles correctifs pour la toolbar mobile (notre module ci-dessous)
		$out->addModuleStyles( [ 'ext.veforall.mobileToolbarFix' ] );
	}
}

