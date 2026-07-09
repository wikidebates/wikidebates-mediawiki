/*	Wikidébats — boot Vector */
( function () {
	'use strict';

	try {
		var skin = mw && mw.config ? mw.config.get( 'skin' ) : '';
		if ( skin !== 'vector-2022' && skin !== 'vector' ) return;
	} catch ( e ) {}

	var D = document;
	var W = window;
	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function wkLoadOnce( key, moduleName ) {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( key ) ) return;
		}
		try { mw.loader.load( moduleName ); } catch ( e ) {}
	}

	function wkLoadIdleOnce( key, moduleName ) {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( key ) ) return;
		}
		( WK.wkIdle || function ( fn ) { setTimeout( fn, 0 ); } )( function () {
			try { mw.loader.load( moduleName ); } catch ( e ) {}
		} );
	}

	function wkRemoveSomeTooltipsIn( root ) {
		var el = root && root.nodeType ? root : D;
		var nodes, i;

		try {
			nodes = el.querySelectorAll( '.hover-map a[title]' );
		} catch ( e ) {
			return;
		}

		for ( i = 0; i < nodes.length; i++ ) {
			nodes[ i ].removeAttribute( 'title' );
		}
	}

	function hasIn( root, selector ) {
		try { return !!( root && root.querySelector && root.querySelector( selector ) ); } catch ( e ) {}
		return false;
	}

	function onContent( root ) {
		var el = root && root.nodeType ? root : D;
		var hasHover = hasIn( el, '.hover-map, .hover-wikipedia, .hover-link' );
		var hasRef = hasIn( el, '.reference' );

		/*	Hover (Vector only) */
		if ( hasHover ) {
			wkLoadIdleOnce( 'wk:vector:load:hover', 'ext.wikidebates.features.hover' );
			( WK.wkIdle || function ( fn ) { setTimeout( fn, 0 ); } )( function () {
				try { wkRemoveSomeTooltipsIn( el ); } catch ( e ) {}
			} );
		}

		/*	Ref tooltips (Vector only) */
		if ( hasRef ) {
			wkLoadIdleOnce( 'wk:vector:load:refTooltips', 'ext.wikidebates.vector.refTooltips' );
		}

		/*	NS0 view : Vector UI */
		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' && WK.wkIsNs( 0 ) && WK.wkIsView() ) {
				wkLoadOnce( 'wk:vector:load:headerButtons', 'ext.wikidebates.vector.headerButtons' );
				wkLoadIdleOnce( 'wk:vector:load:ns0IdleTooltips', 'ext.wikidebates.vector.ns0.idleTooltips' );
			}
		} catch ( e2 ) {}
	}

	function bootAfterI18n() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:vector:booted' ) ) return;
		}

		mw.hook( 'wikipage.ready' ).add( function () { onContent( D ); } );

		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			var root = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			onContent( root );
		} );

		onContent( D );
	}

	function boot() {
		function afterI18n() {
			try { bootAfterI18n(); } catch ( e ) { console.error( 'WK Vector boot failed', e ); }
		}

		if ( typeof WK.wkLoadI18n === 'function' ) {
			try {
				jQuery.when( WK.wkLoadI18n() ).always( afterI18n );
			} catch ( e2 ) {
				afterI18n();
			}
		} else {
			afterI18n();
		}
	}

	if ( D.readyState === 'loading' ) D.addEventListener( 'DOMContentLoaded', boot, { once: true } );
	else boot();

}() );
