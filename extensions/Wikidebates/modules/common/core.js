/*	Wikidébats — core commun (MW 1.43) */
( function () {
	'use strict';

	var D = document;
	var W = window;

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	var WK_ONCE = Object.create( null );

	function wkOnce( key ) {
		if ( WK_ONCE[ key ] ) return false;
		WK_ONCE[ key ] = true;
		return true;
	}

	function wkIdle( fn ) {
		if ( W.requestIdleCallback ) W.requestIdleCallback( fn, { timeout: 500 } );
		else setTimeout( fn, 0 );
	}

	function wkWaitFor( test, done, timeout, interval ) {
		var start = Date.now();
		var delay = ( typeof interval === 'number' && interval > 0 ) ? interval : 50;
		var t = null;

		function tick() {
			var r = null;

			try { r = test(); } catch ( e ) {}

			if ( r ) {
				if ( t ) clearInterval( t );
				try { done( r ); } catch ( e2 ) {}
				return;
			}

			if ( timeout && Date.now() - start >= timeout ) {
				if ( t ) clearInterval( t );
			}
		}

		t = setInterval( tick, delay );
		tick();
	}

	function wkRootNode( root ) {
		if ( !root ) return D;
		if ( root.jquery && root.length ) return root[ 0 ];
		if ( root.nodeType ) return root;
		return D;
	}

	function wkIsNs( ns ) {
		try { return mw.config.get( 'wgNamespaceNumber' ) === ns; } catch ( e ) { return false; }
	}

	function wkIsView() {
		return D.body && D.body.classList.contains( 'action-view' );
	}

	function wkIsFormEdit() {
		return !!D.querySelector( '.mw-special-FormEdit, .mw-editable.action-formedit' );
	}

	function wkReplaceHtml( $target, html ) {
		if ( !$target || !$target.length ) return;

		var tmp = D.createElement( 'div' );
		tmp.innerHTML = html;

		var frag = D.createDocumentFragment();
		while ( tmp.firstChild ) frag.appendChild( tmp.firstChild );

		$target[ 0 ].replaceWith( frag );
	}

	/*	hrefToPageTitle — version robuste (Minerva) */
	function hrefToPageTitle( href ) {
		if ( !href ) return '';
		try {
			var url = new URL( href, W.location.origin );

			var t = url.searchParams.get( 'title' );
			if ( t ) return decodeURIComponent( t ).replace( /_/g, ' ' );

			var path = url.pathname || '';
			var articlePath = mw.config.get( 'wgArticlePath' ) || '/wiki/$1';
			var prefix = articlePath.replace( '$1', '' );

			if ( path.indexOf( prefix ) === 0 ) {
				return decodeURIComponent( path.slice( prefix.length ) ).replace( /_/g, ' ' );
			}
		} catch ( e ) {}
		return '';
	}

	WK.D = D;
	WK.W = W;

	WK.wkOnce = wkOnce;
	WK.wkIdle = wkIdle;
	WK.wkWaitFor = wkWaitFor;
	WK.wkRootNode = wkRootNode;

	WK.wkIsNs = wkIsNs;
	WK.wkIsView = wkIsView;
	WK.wkIsFormEdit = wkIsFormEdit;

	WK.wkReplaceHtml = wkReplaceHtml;
	WK.hrefToPageTitle = hrefToPageTitle;

	/*	Alias legacy (pour limiter les changements immédiats) */
	W.wkOnce = wkOnce;
	W.wkIdle = wkIdle;
	W.wkWaitFor = wkWaitFor;
	W.wkRootNode = wkRootNode;
	W.wkIsNs = wkIsNs;
	W.wkIsView = wkIsView;
	W.wkIsFormEdit = wkIsFormEdit;
	W.wkReplaceHtml = wkReplaceHtml;
	W.hrefToPageTitle = hrefToPageTitle;

}() );
