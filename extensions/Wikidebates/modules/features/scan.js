/*	Wikidébats — scan/dispatch (commun) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function bindOngletExterne() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:ongletExterne' ) ) return;
		}

		$( D ).on( 'click', '.onglet-externe a', function () {
			var a = this;

			if ( a.getAttribute( 'target' ) !== '_blank' ) {
				a.setAttribute( 'target', '_blank' );
			}

			if ( a.relList && a.relList.add ) {
				a.relList.add( 'noopener' );
			} else {
				var rel = ( a.getAttribute( 'rel' ) || '' );
				if ( !/\bnoopener\b/.test( rel ) ) {
					a.setAttribute( 'rel', ( rel ? rel + ' ' : '' ) + 'noopener' );
				}
			}
		} );
	}

	function wkLoadOnce( onceKey, moduleName ) {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( onceKey ) ) return;
		}
		try { mw.loader.load( moduleName ); } catch ( e ) {}
	}

	function wkLoadIdleOnce( onceKey, moduleName ) {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( onceKey ) ) return;
		}
		( WK.wkIdle || function ( fn ) { setTimeout( fn, 0 ); } )( function () {
			try { mw.loader.load( moduleName ); } catch ( e ) {}
		} );
	}

	function hasIn( root, selector ) {
		var el = ( WK.wkRootNode ? WK.wkRootNode( root ) : ( root || D ) );
		try { return !!( el && el.querySelector && el.querySelector( selector ) ); } catch ( e ) {}
		return false;
	}

	function scanAndDispatch( root ) {
		var el = ( WK.wkRootNode ? WK.wkRootNode( root ) : ( root || D ) );

		/*	Commun : fr-collapsible */
		if ( hasIn( el, '.fr-collapsible' ) ) {
			wkLoadIdleOnce( 'wk:load:frCollapsible', 'ext.wikidebates.features.frCollapsible' );
		}

		/*	Commun : more-content */
		if ( hasIn( el, '.more-content-button' ) ) {
			wkLoadIdleOnce( 'wk:load:moreContent', 'ext.wikidebates.features.moreContent' );
		}

		/*	Commun : SMW tooltips (lazy) */
		if ( hasIn( el, '.smw-highlighter' ) || hasIn( D, '.smw-highlighter' ) ) {
			wkLoadIdleOnce( 'wk:load:smwTooltips', 'ext.wikidebates.features.smwTooltips' );
		}

		/*	FormEdit (module séparé) */
		try {
			if ( typeof WK.wkIsFormEdit === 'function' && WK.wkIsFormEdit() ) {
				wkLoadOnce( 'wk:load:editForm', 'ext.wikidebates.features.editForm' );
			}
		} catch ( e2 ) {}

		/*	NS0 view : features communes (contenu) */
		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' && WK.wkIsNs( 0 ) && WK.wkIsView() ) {
				wkLoadOnce( 'wk:load:view:ns0', 'ext.wikidebates.view.ns0' );
				wkLoadIdleOnce( 'wk:load:view:ns0:idle', 'ext.wikidebates.view.ns0.idle' );
			}
		} catch ( e3 ) {}
	}

	function boot() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:scan:booted' ) ) return;
		}

		bindOngletExterne();

		mw.hook( 'wikipage.ready' ).add( function () {
			scanAndDispatch( D );
		} );

		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			var root = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			scanAndDispatch( root );
		} );

		scanAndDispatch( D );
	}

	if ( D.readyState === 'loading' ) D.addEventListener( 'DOMContentLoaded', boot, { once: true } );
	else boot();
	
}() );
