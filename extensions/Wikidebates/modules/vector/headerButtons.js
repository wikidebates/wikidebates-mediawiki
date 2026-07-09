/*	Wikidébats — Vector header buttons (NS0) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function isVector() {
		try {
			var skin = mw && mw.config ? mw.config.get( 'skin' ) : '';
			return ( skin === 'vector' || skin === 'vector-2022' );
		} catch ( e ) {}
		return false;
	}

	function vectorHeaderButtons() {
		if ( !isVector() ) return;
		if ( !WK.wkIsNs || !WK.wkIsView ) return;
		if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;

		try {
			var span = D.getElementById( 'bouton-renommer' );
			var heading = D.querySelector( '.firstHeading' ) || D.getElementById( 'firstHeading' );
			if ( span && heading ) {
				span.style.display = 'inline';
				if ( span.parentNode !== heading ) heading.appendChild( span );
				var a = span.querySelector( 'a' );
				if ( a ) a.textContent = '';
			}

			var bouton = D.getElementById( 'bouton-modifier-sujet' );
			var contentSub = D.getElementById( 'contentSub' );
			if ( bouton && contentSub ) {
				if ( bouton.parentNode !== contentSub ) contentSub.appendChild( bouton );
				bouton.style.display = 'inline-flex';
				bouton.style.verticalAlign = 'middle';
			}

			var boutonCat = D.getElementById( 'bouton-modifier-categories' );
			var categories = D.getElementById( 'mw-normal-catlinks' );
			if ( boutonCat && categories ) {
				var ul = categories.querySelector( 'ul' );
				var lastLi = ul ? ul.querySelector( 'li:last-child' ) : null;
				if ( lastLi && boutonCat.parentElement !== lastLi ) lastLi.appendChild( boutonCat );
				if ( boutonCat ) boutonCat.style.display = 'inline';
			}

			var marker = D.querySelector( '#bouton-modifier-interlangue' );
			var container = D.querySelector( '#p-lang-btn .vector-dropdown-content' );
			var NEW_ID = 'modifier-langues-lien';

			if ( marker && container && !D.getElementById( NEW_ID ) ) {
				var sourceLink = marker.querySelector( 'a' );
				if ( sourceLink && sourceLink.href ) {
					var wantedTooltip = ( marker.getAttribute( 'data-wk-tooltip' ) || '' ).trim();

					var newLink = D.createElement( 'a' );
					newLink.id = NEW_ID;
					newLink.href = sourceLink.href;
					newLink.textContent = ( sourceLink.textContent || '' ).trim() || 'Modifier';
					newLink.className = ( ( sourceLink.getAttribute( 'class' ) || '' ).trim() +
						' interlanguage-edit-link wk-icon-before wk-icon-edit' ).trim();
					newLink.setAttribute( 'rel', 'nofollow' );

					if ( wantedTooltip ) {
						newLink.setAttribute( 'title', wantedTooltip );
						newLink.setAttribute( 'data-tooltip', wantedTooltip );
						newLink.setAttribute( 'aria-label', wantedTooltip );
					}

					var wrap = D.createElement( 'div' );
					wrap.className = 'modifier-langues';
					wrap.appendChild( newLink );

					container.appendChild( wrap );
					marker.remove();
				}
			}
		} catch ( e ) {}
	}

	function init() {
		if ( !isVector() ) return;
		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' ) {
				if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;
			}
		} catch ( e ) {}

		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:vector:headerButtons' ) ) return;
		}

		var tries = 0;

		function tick() {
			tries++;
			try { vectorHeaderButtons(); } catch ( e2 ) {}

			if ( tries < 6 && !D.querySelector( '#p-lang-btn .vector-dropdown-content' ) ) {
				setTimeout( tick, 120 );
			}
		}

		tick();

		mw.hook( 'wikipage.content' ).add( function () {
			tries = 0;
			tick();
		} );
	}

	WK.vectorHeaderButtons = vectorHeaderButtons;

	try { init(); } catch ( e ) {}

}() );
