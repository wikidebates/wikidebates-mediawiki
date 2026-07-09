/*	Wikidébats — SMW tooltips (lazy) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function wkHasSmwTooltips( root ) {
		var el = root && root.nodeType ? root : ( root && root[ 0 ] ? root[ 0 ] : D );
		try { return !!( el && el.querySelector && el.querySelector( '.smw-highlighter' ) ); } catch ( e ) {}
		return false;
	}

	function wkReinitSMWTooltips( root ) {
		var el = root && root.nodeType ? root : ( root && root[ 0 ] ? root[ 0 ] : D );
		var $root = root && root.jquery ? root : $( el || D );

		if ( !wkHasSmwTooltips( el ) ) return;

		mw.loader.using( 'ext.smw.tooltip' ).then( function () {
			try {
				if ( W.smw && smw.tooltip && smw.tooltip.init ) smw.tooltip.init( $root );
			} catch ( e ) {}
		} );
	}

	function init() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:smwTooltips:init' ) ) return;
		}

		wkReinitSMWTooltips( D );

		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			var root = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			wkReinitSMWTooltips( root );
		} );
	}

	WK.wkHasSmwTooltips = wkHasSmwTooltips;
	WK.wkReinitSMWTooltips = wkReinitSMWTooltips;

	try { init(); } catch ( e ) {}

}() );
