/*	Wikidébats — NS0 view (commun : contenu) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;
	var $D = $( D );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function argumentMapContentCall() {
		if ( WK.wkOnce && !WK.wkOnce( 'wk:mapOpenInit' ) ) return;
		if ( !WK.wkIsNs || !WK.wkIsView ) return;

		// NS0 + view uniquement
		if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;

		$( D ).on( 'click.wkMapOpen', '#Argument_map .argument-title--map', function ( e ) {
			// laisser passer nouvel onglet / intentions nav
			if ( e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1 ) return;

			e.preventDefault();
			e.stopPropagation();

			var id = $( this ).attr( 'id' );
			id = id ? id.slice( 0, -4 ) : ''; // "..._map"
			if ( !id ) return;

			var raw = D.getElementById( id );
			if ( !raw ) return;

			var titleEl = null;
			if ( raw.classList && raw.classList.contains( 'argument-title' ) ) titleEl = raw;
			else titleEl = raw.querySelector( '.argument-title' );

			if ( !titleEl ) return;

			if ( typeof WK.wkOpenReadingModeFromTitleEl === 'function' ) {
				WK.wkOpenReadingModeFromTitleEl( titleEl );
			}

			// visité
			$( this ).addClass( 'visited' );
		} );
	}

	function wkFixTitleSpace() {
		if ( WK.wkOnce && !WK.wkOnce( 'wkTitleSpaceInit' ) ) return;

		function fixTitleSpace() {
			var el = D.querySelector( '#firstHeading .mw-page-title-main' ) || D.querySelector( '#firstHeading' );
			if ( !el ) return;

			var walker = D.createTreeWalker( el, NodeFilter.SHOW_TEXT );
			var t, last = null;
			while ( ( t = walker.nextNode() ) ) last = t;
			if ( !last ) return;

			var s = last.nodeValue;
			if ( /\u00A0\?$/.test( s ) || /\u202F\?$/.test( s ) ) return;

			var r = s.replace( / (?=\?$)/, '\u00A0' );
			if ( r !== s ) last.nodeValue = r;
		}

		mw.hook( 'wikipage.ready' ).add( fixTitleSpace );

		var h = D.getElementById( 'firstHeading' );
		if ( h && W.MutationObserver ) {
			new MutationObserver( fixTitleSpace ).observe( h, { childList: true, subtree: true, characterData: true } );
		}
	}

	function bindArgumentOpen() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:ns0:argumentOpen' ) ) return;
		}
		$D.on( 'click.wkArgOpen', '.argument-title', function ( e ) {
			if ( e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1 ) return;

			e.preventDefault();
			e.stopPropagation();

			if ( typeof WK.wkOpenReadingModeFromTitleEl === 'function' ) {
				WK.wkOpenReadingModeFromTitleEl( this );
			}

			try {
				var arg = this.closest( '.argument.level-1[id]' );
				if ( arg ) {
					var id = arg.getAttribute( 'id' ) || '';
					var mapEl = id ? D.getElementById( id + '_map' ) : null;
					if ( mapEl ) mapEl.classList.add( 'visited' );
				}
			} catch ( e2 ) {}
		} );
	}

	function init() {
		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' ) {
				if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;
			}
		} catch ( e ) {}

		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:view:ns0:init' ) ) return;
		}

		try { argumentMapContentCall(); } catch ( e1 ) {}
		try { wkFixTitleSpace(); } catch ( e2 ) {}
		try { bindArgumentOpen(); } catch ( e3 ) {}
	}

	WK.argumentMapContentCall = argumentMapContentCall;
	WK.wkFixTitleSpace = wkFixTitleSpace;

	init();

}() );
