/*	Wikidébats — NS0 view (idle) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;
	var $D = $( D );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function latestChangesCall() {
		if ( !WK.wkOnce( 'wkLatestInit' ) ) return;

		$D.on( 'click.wkLatest', '.latest-changes-button', function () {

			var $btn = jQuery( '.latest-changes-button.mw-ui-button' );
			var btnEl = $btn.get( 0 );

			$btn.hide();

			WK.wkWarmI18nCaches();

			var ds = btnEl && btnEl.dataset ? btnEl.dataset : null;
			var page = ds && ds.page ? ds.page : $btn.data( 'page' );

			var $wrapper = $btn.parent().find( '.latest-changes-wrapper' );
			var query =
				'{{#recentdebatechanges: page=' + page +
				'|limit=100' +
				'}}';

			if ( typeof WK.wkParseWikitext !== 'function' || typeof WK.wkReplaceHtml !== 'function' ) return;

			WK.wkParseWikitext( query, 'latest' ).then( function ( html ) {
				WK.wkReplaceHtml(
					$wrapper,
					'<div class="latest-changes-wrapper"><div class="latest-changes-drop show"></div>' + html + '</div>'
				);
			} ).catch( function () {} );

		} );
	}

	function loadReadingUiForSkin() {
		try {
			var skin = mw && mw.config ? mw.config.get( 'skin' ) : '';
			if ( skin === 'minerva' ) {
				mw.loader.load( 'ext.wikidebates.reading.ui.minerva' );
				return;
			}
			if ( skin === 'vector' || skin === 'vector-2022' ) {
				mw.loader.load( 'ext.wikidebates.reading.ui.vector' );
				return;
			}
		} catch ( e ) {}
	}

	function bindBoutonAjouterNavCapture() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:navcapture' ) ) return;
		}

		D.addEventListener( 'click', function ( e ) {
			var btn = e && e.target && e.target.closest ? e.target.closest( '.bouton-ajouter' ) : null;
			if ( !btn ) return;

			if ( e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1 ) return;

			var a = btn.querySelector( 'a.wk-js-nav' ) || btn.querySelector( 'a[href]' );
			if ( !a ) return;

			var url = a.getAttribute( 'data-href' ) || a.getAttribute( 'href' ) || '';
			if ( !url || url === 'javascript:void(0)' ) return;

			e.preventDefault();
			e.stopPropagation();

			W.location.assign( url );
		}, true );
	}

	function init() {
		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' ) {
				if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;
			}
		} catch ( e ) {}

		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:view:ns0:idle:init' ) ) return;
		}

		try { latestChangesCall(); } catch ( e1 ) {}
		try { loadReadingUiForSkin(); } catch ( e2 ) {}
		try { bindBoutonAjouterNavCapture(); } catch ( e3 ) {}
		try {
			$D.on( 'click', 'ul.argument-list .bandeau-avertissement', function ( e ) {
				e.stopPropagation();
			} );
		} catch ( e4 ) {}

		/*	autoId est une dépendance de ce module : son IIFE s'exécute à l'import */
	}

	WK.latestChangesCall = latestChangesCall;

	init();

}() );
