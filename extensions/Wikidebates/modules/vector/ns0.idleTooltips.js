/*	Wikidébats — Vector tooltips fixes (idle) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;
	var $D = $( D );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function wkFixAddDataAndRenameTooltipsOn( root ) {
		var el = WK.wkRootNode ? WK.wkRootNode( root ) : ( root || D );
		if ( !el || !el.querySelectorAll ) return;

		var nodes = el.querySelectorAll( 'span.wk-adddata-link[data-wk-tooltip]' );
		for ( var i = 0; i < nodes.length; i++ ) {
			var wrap = nodes[ i ];
			var tt = wrap.getAttribute( 'data-wk-tooltip' );
			if ( !tt ) continue;

			var a = wrap.querySelector( 'a' );
			if ( !a ) continue;

			if ( a.getAttribute( 'title' ) !== tt ) a.setAttribute( 'title', tt );
			if ( a.getAttribute( 'data-tooltip' ) !== tt ) a.setAttribute( 'data-tooltip', tt );
			if ( wrap.hasAttribute( 'title' ) ) wrap.removeAttribute( 'title' );
		}

		var a2 = D.querySelector( '#bouton-renommer a' );
		if ( a2 && typeof WK.wkMsg === 'function' ) {
			var tt2 = WK.wkMsg( 'wk-rename-page' );
			if ( a2.getAttribute( 'title' ) !== tt2 ) a2.setAttribute( 'title', tt2 );
			if ( a2.getAttribute( 'data-tooltip' ) !== tt2 ) a2.setAttribute( 'data-tooltip', tt2 );
			if ( a2.getAttribute( 'aria-label' ) !== tt2 ) a2.setAttribute( 'aria-label', tt2 );
		}
	}

	function init() {
		try {
			var skin = mw && mw.config ? mw.config.get( 'skin' ) : '';
			if ( skin !== 'vector' && skin !== 'vector-2022' ) return;
		} catch ( e ) {}

		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' ) {
				if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;
			}
		} catch ( e2 ) {}

		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:vector:ns0:idleTooltips' ) ) return;
		}

		try { wkFixAddDataAndRenameTooltipsOn( D ); } catch ( e3 ) {}

		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			var root = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			try { wkFixAddDataAndRenameTooltipsOn( root ); } catch ( e4 ) {}
		} );
	}

	( WK.wkIdle || function ( fn ) { setTimeout( fn, 0 ); } )( function () {
		try { init(); } catch ( e ) {}
	} );

}() );
