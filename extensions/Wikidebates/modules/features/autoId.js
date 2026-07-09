/*	Wikidébats — auto-id (commun) */
( function () {
	'use strict';

	var D = document;
	var W = window;

	if ( typeof W.wkIsNs === 'function' && !W.wkIsNs( 0 ) ) return;
	if ( !D.querySelector( '.wk-auto-id' ) ) return;

	function pad2( n ) { return ( n < 10 ? '0' : '' ) + n; }

	function makeId() {
		var d = new Date();
		return (
			d.getFullYear().toString() +
			pad2( d.getMonth() + 1 ) +
			pad2( d.getDate() ) +
			pad2( d.getHours() ) +
			pad2( d.getMinutes() ) +
			pad2( d.getSeconds() )
		);
	}

	function hasPlaceholder( href ) {
		return href && ( href.indexOf( '(ID)' ) !== -1 || href.indexOf( '%28ID%29' ) !== -1 );
	}

	function replacePlaceholder( href, id ) {
		href = href.replace( '(ID)', '(' + id + ')' );
		href = href.replace( '%28ID%29', '%28' + id + '%29' );
		return href;
	}

	D.addEventListener( 'click', function ( e ) {
		var wrap = e.target.closest( '.wk-auto-id' );
		if ( !wrap ) return;

		var a = wrap.querySelector( 'a[href]' );
		if ( !a ) return;

		var rawHref = a.getAttribute( 'href' ) || '';
		var resolvedHref = a.href || rawHref;

		var hrefToCheck = rawHref || resolvedHref;
		if ( !hasPlaceholder( hrefToCheck ) ) return;

		e.preventDefault();
		e.stopImmediatePropagation();

		var id = makeId();
		var newHref = replacePlaceholder( rawHref || resolvedHref, id );

		a.setAttribute( 'href', newHref );
		try { a.href = newHref; } catch ( err ) {}

		var wantsNewTab =
			( a.target && a.target.toLowerCase() === '_blank' ) ||
			e.ctrlKey || e.metaKey || e.button === 1;

		if ( wantsNewTab ) W.open( a.href, '_blank', 'noopener' );
		else W.location.href = a.href;

	}, true );

}() );
