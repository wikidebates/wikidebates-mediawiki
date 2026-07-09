/*	Wikidébats — reading core (commun) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = W.jQuery;

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	var wkArgEmbedCache = new Map();

	var WK_READING = {
		enabled: true,
		state: {
			chain: [],
			siblingsByDepth: Object.create( null ),
			h1Links: { editHref: '#', detailHref: '' }
		}
	};

	var UI = {
		ensureUi: null,
		isClickInsideReading: null,
		updateH1Actions: null,
		prependH1: null,
		applyContentTypeClass: null,
		getParseParams: null,
		closeUi: null
	};

	function wkMsgD( key, fallback ) {
		try {
			if ( typeof WK.wkMsgD === 'function' ) return WK.wkMsgD( key, fallback );
			if ( typeof WK.wkMsg === 'function' ) return WK.wkMsg( key ) || fallback || key;
		} catch ( e ) {}
		return fallback || key;
	}

	function wkReadingSetAdapter( adapter ) {
		if ( !adapter ) return;

		UI.ensureUi = adapter.ensureUi || null;
		UI.isClickInsideReading = adapter.isClickInsideReading || null;
		UI.updateH1Actions = adapter.updateH1Actions || null;
		UI.prependH1 = adapter.prependH1 || null;
		UI.applyContentTypeClass = adapter.applyContentTypeClass || null;
		UI.getParseParams = adapter.getParseParams || null;
		UI.closeUi = adapter.closeUi || null;
	}

	function wkReadingSetActive( on ) {
		D.documentElement.classList.toggle( 'wk-reading-active', !!on );
		D.body.classList.toggle( 'wk-reading-active', !!on );
	}

	function wkGetDebateTitleFromHeading() {
		var el = D.querySelector( '#firstHeading .mw-page-title-main' )
			|| D.querySelector( '#firstHeading' )
			|| D.querySelector( 'h1#section_0' )
			|| D.querySelector( 'h1' );
		if ( !el ) return '';
		return ( el.textContent || '' ).replace( /\s+/g, ' ' ).trim();
	}

	function wkGetArgumentTitleFromNode( titleEl ) {
		if ( !titleEl ) return '';
		var a = titleEl.querySelector( 'a' );
		if ( !a ) return '';
		return ( a.textContent || '' ).replace( /\s+/g, ' ' ).trim();
	}

	function wkReadingGetTypeFromTitleEl( titleEl ) {
		var ul = titleEl ? titleEl.closest( 'ul.argument-list' ) : null;
		if ( !ul ) return '';
		if ( ul.classList.contains( 'contre' ) || ul.classList.contains( 'is-con' ) ) return 'contre';
		if ( ul.classList.contains( 'pour' ) || ul.classList.contains( 'is-pro' ) ) return 'pour';
		return 'pour';
	}

	function wkReadingTypeCombine( parentAbsType, relationToParent ) {
		if ( parentAbsType !== 'pour' && parentAbsType !== 'contre' ) parentAbsType = 'pour';
		if ( relationToParent !== 'pour' && relationToParent !== 'contre' ) relationToParent = 'pour';
		return ( parentAbsType === relationToParent ) ? 'pour' : 'contre';
	}

	function wkReadingGetArgPageFromTitleEl( titleEl ) {
		if ( !titleEl ) return '';

		var a = titleEl.querySelector( 'a[href]' );
		if ( a ) {
			var href = a.getAttribute( 'href' ) || '';
			var page = href ? WK.hrefToPageTitle( href ) : '';
			if ( page ) return page;
		}

		try {
			if ( titleEl.dataset && titleEl.dataset.page ) return titleEl.dataset.page;
		} catch ( e ) {}

		return '';
	}

	function wkReadingBuildChainFromDom( titleEl ) {
		var chain = [];
		var curTitle = titleEl;

		while ( curTitle ) {
			var page = wkReadingGetArgPageFromTitleEl( curTitle );
			var title = wkGetArgumentTitleFromNode( curTitle ) || ( curTitle.textContent || '' ).trim();
			var type = wkReadingGetTypeFromTitleEl( curTitle );

			chain.push( { page: page, title: title, type: type } );

			var ul = curTitle.closest( 'ul.argument-list' );
			var parentWrap = ul ? ul.closest( '.argument-wrapper' ) : null;

			if ( parentWrap ) {
				var prev = parentWrap.previousElementSibling;
				if ( prev && prev.classList && prev.classList.contains( 'argument-title' ) ) {
					curTitle = prev;
					continue;
				}
			}

			break;
		}

		chain.reverse();

		var acc = 'pour';
		for ( var i = 0; i < chain.length; i++ ) {
			if ( chain[ i ] && chain[ i ].type ) {
				acc = wkReadingTypeCombine( acc, chain[ i ].type );
				chain[ i ].type = acc;
			}
		}

		var debateTitle = wkGetDebateTitleFromHeading() || '';
		if ( debateTitle ) chain.unshift( { page: '', title: debateTitle, type: '' } );

		return chain;
	}

	function wkReadingGetLinkFromTitleEl( titleEl ) {
		var a = titleEl ? titleEl.querySelector( 'a[href]' ) : null;
		if ( !a ) return { page: '', href: '' };

		var href = a.getAttribute( 'href' ) || '';
		return { href: href, page: href ? WK.hrefToPageTitle( href ) : '' };
	}

	function wkReadingGetEditDisplayedTitleHrefFromTitleEl( titleEl ) {
		var lienModifierTitre = '#';
		if ( !titleEl ) return lienModifierTitre;

		var ulListe = titleEl.closest( 'ul.argument-list' );
		if ( !ulListe ) return lienModifierTitre;

		var precedent = ulListe.previousElementSibling;
		while ( precedent && precedent.tagName !== 'H2' ) precedent = precedent.previousElementSibling;

		if ( precedent ) {
			var a = precedent.querySelector( '.bouton-modifier a[href]' );
			if ( a && a.getAttribute( 'href' ) ) lienModifierTitre = a.getAttribute( 'href' );
		}

		return lienModifierTitre;
	}

	/* =========================
		Siblings snapshot / render
	   ========================= */

	function wkReadingSiblingsFromArgumentUl( ul ) {
		if ( !ul ) return [];

		var out = [];
		var links = ul.querySelectorAll( ':scope > li.argument > .argument-title > a[href]' );

		for ( var i = 0; i < links.length; i++ ) {
			var a = links[ i ];
			var page = WK.hrefToPageTitle( a.getAttribute( 'href' ) || '' );
			var title = ( a.textContent || '' ).replace( /\s+/g, ' ' ).trim();
			if ( page ) out.push( { page: page, title: title } );
		}

		return out;
	}

	function wkReadingGetDepthFromChain( chain ) {
		var n = 0;
		for ( var i = 0; i < ( chain ? chain.length : 0 ); i++ ) {
			if ( chain[ i ] && chain[ i ].page ) n++;
		}
		return n;
	}

	function wkReadingStoreSiblingsAtDepth( depth, items ) {
		if ( !depth || !items || !items.length ) return;

		if ( !WK_READING.state.siblingsByDepth ) {
			WK_READING.state.siblingsByDepth = Object.create( null );
		}

		var out = [];
		for ( var i = 0; i < items.length; i++ ) {
			if ( items[ i ] && items[ i ].page ) {
				out.push( { page: items[ i ].page, title: items[ i ].title } );
			}
		}

		if ( out.length ) WK_READING.state.siblingsByDepth[ depth ] = out;
	}

	function wkReadingStoreSiblingsSnapshotFromTitleEl( titleEl, chain ) {
		if ( !titleEl || !chain || !chain.length ) return;

		var ul = titleEl.closest( 'ul.argument-list' );
		var items = wkReadingSiblingsFromArgumentUl( ul );
		var depth = wkReadingGetDepthFromChain( chain );

		if ( items && items.length ) wkReadingStoreSiblingsAtDepth( depth, items );
	}

	function wkReadingRenderSiblingsFromSnapshot( ui, chain, stored ) {
		if ( !ui || !ui.siblings ) return;
		if ( !chain || !chain.length ) return;
		if ( !stored || !stored.length ) return;

		var current = null;
		for ( var i = chain.length - 1; i >= 0; i-- ) {
			if ( chain[ i ] && chain[ i ].page ) { current = chain[ i ]; break; }
		}
		if ( !current || !current.page ) return;

		ui.siblings.textContent = '';

		var sep = D.createElement( 'div' );
		sep.className = 'wk-reading-siblings__sep';
		ui.siblings.appendChild( sep );

		var h = D.createElement( 'div' );
		h.className = 'wk-reading-siblings__label';
		h.textContent = wkMsgD( 'wk-reading-siblings-label' );
		ui.siblings.appendChild( h );

		var ul = D.createElement( 'ul' );
		ul.className = 'wk-reading-siblings__list';

		var lastType = 'pour';
		for ( var k = chain.length - 1; k >= 0; k-- ) {
			if ( chain[ k ] && chain[ k ].page && chain[ k ].type ) { lastType = chain[ k ].type; break; }
		}

		if ( lastType === 'contre' ) ul.classList.add( 'is-con' );
		else ul.classList.add( 'is-pro' );

		ui.siblings.appendChild( ul );

		for ( var j = 0; j < stored.length; j++ ) {
			var it = stored[ j ];
			if ( !it || !it.page ) continue;

			var li = D.createElement( 'li' );
			li.className = 'wk-reading-siblings__item';

			var box = D.createElement( 'div' );
			box.className = 'wk-reading-siblings__title wk-icon-before wk-icon-argument';

			if ( it.page === current.page ) {
				box.classList.add( 'is-current' );

				var cur = D.createElement( 'div' );
				cur.className = 'wk-reading-siblings__current';
				cur.textContent = it.title || '';
				box.appendChild( cur );
			} else {
				var a = D.createElement( 'a' );
				a.className = 'wk-reading-siblings__link';
				a.dataset.page = it.page;
				a.href = mw.util.getUrl( it.page );
				a.textContent = it.title || '';
				box.appendChild( a );
			}

			li.appendChild( box );
			ul.appendChild( li );
		}
	}

	function wkReadingRenderSiblings( ui, chain ) {
		if ( !ui || !ui.siblings ) return;
		if ( !chain || !chain.length ) return;

		var depth = wkReadingGetDepthFromChain( chain );
		var stored = WK_READING.state.siblingsByDepth
			? WK_READING.state.siblingsByDepth[ depth ]
			: null;

		if ( !stored || !stored.length ) return;

		wkReadingRenderSiblingsFromSnapshot( ui, chain, stored );
	}

	/* =========================
		Stack render (commun)
	   ========================= */

	function wkReadingApplyContentTypeClass( ui, chain ) {
		if ( UI.applyContentTypeClass ) {
			UI.applyContentTypeClass( ui, chain );
			return;
		}
	}

	function wkReadingRenderStack( ui, chain ) {
		if ( !ui || !ui.stack || !chain || !chain.length ) return;

		wkReadingApplyContentTypeClass( ui, chain );

		ui.stack.textContent = '';

		for ( var i = 0; i < chain.length; i++ ) {
			var it = chain[ i ];
			var isLast = ( i === chain.length - 1 );

			var item = D.createElement( 'div' );
			item.className = 'wk-reading__item';

			if ( isLast ) item.classList.add( 'is-current' );

			if ( i === 0 && !it.page ) item.classList.add( 'is-root' );
			else item.classList.add( it.type === 'contre' ? 'is-con' : 'is-pro' );

			item.dataset.page = it.page || '';
			item.dataset.index = String( i );

			var title = D.createElement( 'div' );
			title.className = 'wk-reading__title wk-icon-before wk-icon-argument';
			title.textContent = it.title || '';
			item.appendChild( title );

			if ( !isLast ) {
				( function ( page, idx, isRoot ) {
					item.addEventListener( 'click', function () {
						if ( isRoot ) {
							wkCloseReadingMode();

							var topEl = D.getElementById( 'top' );
							if ( topEl && topEl.scrollIntoView ) {
								topEl.scrollIntoView( { block: 'start' } );
							} else if ( $ ) {
								$( 'html, body' ).stop( true ).animate( { scrollTop: 0 }, 120 );
							} else {
								W.scrollTo( 0, 0 );
							}
							return;
						}

						if ( !page ) return;

						if ( ui && ui.content ) ui.content.scrollTop = 0;

						var chain2 = chain.slice( 0, idx + 1 );
						WK_READING.state.chain = chain2;

						wkOpenReadingModeFromPageTitle( page, chain2 );
					} );
				} )( it.page, i, ( i === 0 && !it.page ) );
			}

			ui.stack.appendChild( item );
		}

		wkReadingRenderSiblings( ui, chain );
	}

	/* =========================
		Siblings click (commun)
	   ========================= */

	function wkReadingBindSiblingsDelegation( ui ) {
		if ( !ui || !ui.siblings ) return;

		if ( ui.siblings.dataset.wkSiblingsBound === '1' ) return;
		ui.siblings.dataset.wkSiblingsBound = '1';

		ui.siblings.addEventListener( 'click', function ( e ) {
			var a = e.target && e.target.closest ? e.target.closest( 'a.wk-reading-siblings__link' ) : null;
			if ( !a ) return;

			if ( e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1 ) return;

			e.preventDefault();
			e.stopPropagation();

			var page = '';
			var title = '';
			var href = a.getAttribute( 'href' ) || '';

			try { page = ( a.dataset && a.dataset.page ) ? a.dataset.page : ''; } catch ( e2 ) {}
			title = ( a.textContent || '' ).replace( /\s+/g, ' ' ).trim();

			if ( !page ) page = href ? WK.hrefToPageTitle( href ) : '';
			if ( !page ) return;

			if ( ui && ui.content ) ui.content.scrollTop = 0;

			var chain = ( WK_READING && WK_READING.state && WK_READING.state.chain )
				? WK_READING.state.chain.slice()
				: [];

			var idxLast = -1;
			for ( var i = chain.length - 1; i >= 0; i-- ) {
				if ( chain[ i ] && chain[ i ].page ) { idxLast = i; break; }
			}

			if ( idxLast !== -1 ) {
				chain[ idxLast ] = {
					page: page,
					title: title || chain[ idxLast ].title || '',
					type: chain[ idxLast ].type || 'pour'
				};
			} else {
				var debateTitle = wkGetDebateTitleFromHeading() || '';
				if ( debateTitle ) chain.push( { page: '', title: debateTitle, type: '' } );
				chain.push( { page: page, title: title || page, type: 'pour' } );
			}

			WK_READING.state.chain = chain;

			if ( !WK_READING.state.h1Links ) WK_READING.state.h1Links = { editHref: '#', detailHref: '' };
			WK_READING.state.h1Links.detailHref = href || mw.util.getUrl( page );
			if ( !WK_READING.state.h1Links.editHref ) WK_READING.state.h1Links.editHref = '#';

			if ( ui && ui.panel ) {
				ui.panel.dataset.wkEditTitleHref = WK_READING.state.h1Links.editHref;
				ui.panel.dataset.wkDetailHref = WK_READING.state.h1Links.detailHref;
			}

			wkOpenReadingModeFromPageTitle( page, chain );
		}, true );
	}

	/* =========================
		Fragment load / inject
	   ========================= */

	function wkReadingExtractFragment( html ) {
		function wkFindHeadingStartById( html2, id ) {
			var key = 'id="' + id + '"';
			var p = html2.indexOf( key );
			if ( p === -1 ) return -1;
			return html2.lastIndexOf( '<h2', p );
		}

		function wkExtractBetweenHeadingIds( html2, startId, endId ) {
			var a = wkFindHeadingStartById( html2, startId );
			if ( a === -1 ) return '';

			var key = 'id="' + endId + '"';
			var p = html2.indexOf( key, a + 1 );
			if ( p === -1 ) return '';

			var b = html2.lastIndexOf( '<h2', p );
			if ( b === -1 ) b = html2.lastIndexOf( '<div', p );
			if ( b === -1 || b <= a ) return '';

			return html2.slice( a, b );
		}

		return wkExtractBetweenHeadingIds( html, 'Summary', 'Parent_debates' );
	}

	function wkReadingLoadFragment( argPage ) {
		if ( wkArgEmbedCache.has( argPage ) ) return Promise.resolve( wkArgEmbedCache.get( argPage ) || '' );

		var base = {
			action: 'parse',
			formatversion: 2,
			page: argPage,
			prop: 'text',
			usearticle: 1,
			uselang: ( mw.config.get( 'wgUserLanguage' ) || 'fr' ).toLowerCase(),
			redirects: 1
		};

		var extra = ( UI.getParseParams ? UI.getParseParams() : null ) || {};
		for ( var k in extra ) base[ k ] = extra[ k ];

		return WK.wkGetApi().get( base ).then( function ( data ) {
			var html = ( data && data.parse && data.parse.text ) ? data.parse.text : '';
			if ( !html ) return '';
			return wkReadingExtractFragment( html ) || '';
		} );
	}

	function wkReadingInjectFragment( ui, argPage, fragment ) {
		if ( !ui || !ui.content || !fragment ) return;

		wkArgEmbedCache.set( argPage, fragment );

		ui.content.innerHTML = fragment;

		if ( UI.prependH1 ) UI.prependH1( ui, WK_READING.state.chain );

		if ( UI.updateH1Actions ) {
			try { UI.updateH1Actions( ui ); } catch ( e ) {}
		}

		ui.content.scrollTop = 0;

		requestAnimationFrame( function () {
			WK.wkIdle( function () {
				if ( typeof WK.wkOnContent === 'function' ) WK.wkOnContent( ui.content );
			} );
		} );
	}

	function wkReadingInjectMissingPageNotice( ui, argPage ) {
		if ( !ui || !ui.content ) return;

		var formName = wkMsgD( 'wk-reading-form-name' );
		var msgText = wkMsgD( 'wk-reading-missing-text' );
		var msgBtn = wkMsgD( 'wk-reading-missing-create' );

		var formUrl = mw.util.getUrl( 'Special:FormEdit/' + formName + '/' + argPage );

		ui.content.innerHTML =
			'<div class="wk-reading-missing cdx-message cdx-message--block cdx-message--warning" style="display: block;">' +
				'<b>' + msgText + '</b>' +
				'<p><a class="mw-ui-button mw-ui-progressive" href="' + formUrl + '">' + msgBtn + '</a></p>' +
			'</div>';

		if ( UI.prependH1 ) UI.prependH1( ui, WK_READING.state.chain );
		var more = ui.panel ? ui.panel.querySelector( '.wk-h1-more' ) : null;
		if ( more ) more.remove();

		ui.content.scrollTop = 0;
	}

	function wkReadingBindScrollTrap( ui ) {
		if ( !ui || !ui.content ) return;

		if ( ui.content.dataset.wkTrapBound === '1' ) return;
		ui.content.dataset.wkTrapBound = '1';

		function atTop() { return ui.content.scrollTop <= 0; }
		function atBottom() { return ui.content.scrollTop + ui.content.clientHeight >= ui.content.scrollHeight - 1; }

		ui.content.addEventListener( 'wheel', function ( e ) {
			if ( e.ctrlKey ) return;
			var dy = e.deltaY || 0;
			if ( ( dy > 0 && !atBottom() ) || ( dy < 0 && !atTop() ) ) return;
			e.preventDefault();
			e.stopPropagation();
		}, { passive: false } );

		var touchStartY = 0;

		ui.content.addEventListener( 'touchstart', function ( e ) {
			if ( !e.touches || !e.touches.length ) return;
			touchStartY = e.touches[ 0 ].clientY;
		}, { passive: true } );

		ui.content.addEventListener( 'touchmove', function ( e ) {
			if ( !e.touches || !e.touches.length ) return;
			var y = e.touches[ 0 ].clientY;
			var dy = touchStartY - y;
			if ( ( dy > 0 && !atBottom() ) || ( dy < 0 && !atTop() ) ) return;
			e.preventDefault();
			e.stopPropagation();
		}, { passive: false } );
	}

	/* =========================
		Open / close
	   ========================= */

	function wkReadingBuildChainForClick( titleEl, argPage ) {
		if ( !titleEl || !argPage ) return { chain: [], mode: '' };

		if ( UI.isClickInsideReading && UI.isClickInsideReading( titleEl ) ) {
			var chain2 = WK_READING.state.chain.slice();

			if ( !chain2.length ) {
				var debateTitle = wkGetDebateTitleFromHeading() || '';
				if ( debateTitle ) chain2.push( { page: '', title: debateTitle, type: '' } );
			} else if ( chain2[ 0 ] && chain2[ 0 ].page ) {
				var debateTitle2 = wkGetDebateTitleFromHeading() || '';
				if ( debateTitle2 ) chain2.unshift( { page: '', title: debateTitle2, type: '' } );
			}

			var parentType = 'pour';
			for ( var i = chain2.length - 1; i >= 0; i-- ) {
				if ( chain2[ i ] && chain2[ i ].page && chain2[ i ].type ) { parentType = chain2[ i ].type; break; }
			}

			var localType = wkReadingGetTypeFromTitleEl( titleEl );
			var combinedType = wkReadingTypeCombine( parentType, localType );

			chain2.push( {
				page: argPage,
				title: wkGetArgumentTitleFromNode( titleEl ) || ( titleEl.textContent || '' ).trim(),
				type: combinedType
			} );

			return { chain: chain2, mode: 'append' };
		}

		return { chain: wkReadingBuildChainFromDom( titleEl ), mode: 'rebuild' };
	}

	function wkReadingSetH1LinksFromTitleEl( titleEl ) {
		var editHref = wkReadingGetEditDisplayedTitleHrefFromTitleEl( titleEl );
		var link = wkReadingGetLinkFromTitleEl( titleEl );
		var detailHref = link ? link.href : '';

		WK_READING.state.h1Links.editHref = editHref || '#';
		WK_READING.state.h1Links.detailHref = detailHref || '';
	}

	function wkReadingHistoryIsOn() {
		try { return !!( W.history && W.history.pushState ); } catch ( e ) {}
		return false;
	}

	function wkReadingHistoryIsReadingState( st ) {
		try { return !!( st && st.wkReading === 1 ); } catch ( e ) {}
		return false;
	}

	function wkReadingHistoryPushState() {
		if ( !wkReadingHistoryIsOn() ) return;

		try {
			if ( WK_READING.state._wkHistoryPushed ) return;

			W.history.pushState(
				{ wkReading: 1, t: Date.now() },
				'',
				W.location.href
			);

			WK_READING.state._wkHistoryPushed = 1;
		} catch ( e ) {}
	}

	function wkReadingHistoryBindBack() {
		if ( typeof WK.wkOnce !== 'function' ) return;
		if ( !WK.wkOnce( 'wk:reading:back' ) ) return;

		W.addEventListener( 'popstate', function ( e ) {
			/*	Si on vient de fermer volontairement et qu’on "pop" notre state, ignorer	*/
			if ( WK_READING.state._wkClosingFromUi ) {
				WK_READING.state._wkClosingFromUi = 0;
				WK_READING.state._wkHistoryPushed = 0;
				return;
			}

			if ( !D.documentElement.classList.contains( 'wk-reading-active' ) ) return;

			/*	1) si le sommaire est ouvert => le fermer	*/
			try {
				if ( UI.ensureUi ) {
					var ui = UI.ensureUi();
					if ( ui && ui.root && ui.root.classList.contains( 'is-sheet-open' ) ) {
						if ( ui._wkLeftClose ) ui._wkLeftClose();
						return;
					}
				}
			} catch ( e2 ) {}

			/*	2) sinon fermer le mode lecture	*/
			WK_READING.state._wkClosingFromPop = 1;
			wkCloseReadingMode();
			WK_READING.state._wkClosingFromPop = 0;
		}, true );
	}

	function wkOpenReadingModeFromPageTitle( argPage, chainOpt ) {
		if ( !WK_READING.enabled ) return;
		if ( !UI.ensureUi ) return;

		var ui = UI.ensureUi();
		if ( !ui ) return;

		if ( ui.panel && !document.body.classList.contains( 'wk-reading-active' ) ) {
			ui.panel.classList.add( 'is-loading' );
		}

		wkReadingSetActive( true );
		wkReadingHistoryPushState();

		wkReadingBindScrollTrap( ui );
		wkReadingBindSiblingsDelegation( ui );

		if ( chainOpt && chainOpt.length ) WK_READING.state.chain = chainOpt.slice();

		wkReadingRenderStack( ui, WK_READING.state.chain );

		ui.content.scrollTop = 0;

		wkReadingLoadFragment( argPage )
			.then( function ( fragment ) {

				if ( !fragment ) {
					wkReadingInjectMissingPageNotice( ui, argPage );
					if ( ui.panel ) ui.panel.classList.remove( 'is-loading' );
					return;
				}

				wkReadingInjectFragment( ui, argPage, fragment );

				requestAnimationFrame( function () {
					if ( ui.panel ) ui.panel.classList.remove( 'is-loading' );
				} );
			} )
.catch( function ( err ) {
	if ( err === 'missingtitle' ) {
		wkReadingInjectMissingPageNotice( ui, argPage );
	}

	if ( ui.panel ) ui.panel.classList.remove( 'is-loading' );
} );
	}

	function wkOpenReadingModeFromTitleEl( titleEl ) {
		if ( !titleEl ) return;

		wkReadingSetH1LinksFromTitleEl( titleEl );

		if ( $ ) $( titleEl ).addClass( 'visited' );

		var link = wkReadingGetLinkFromTitleEl( titleEl );
		var argPage = link ? link.page : '';
		if ( !argPage ) return;

		var built = wkReadingBuildChainForClick( titleEl, argPage );
		var chain = built && built.chain ? built.chain : null;
		if ( !chain || !chain.length ) return;

		wkReadingStoreSiblingsSnapshotFromTitleEl( titleEl, chain );

		WK_READING.state.chain = chain;

		wkOpenReadingModeFromPageTitle( argPage, chain );
	}

	function wkReadingBindGlobalEsc() {
		if ( typeof WK.wkOnce !== 'function' ) return;
		if ( !WK.wkOnce( 'wk:reading:esc' ) ) return;

		D.addEventListener( 'keydown', function ( e ) {
			var key = e.key || '';
			var code = e.keyCode || 0;

			if ( key !== 'Escape' && key !== 'Esc' && code !== 27 ) return;
			if ( !D.documentElement.classList.contains( 'wk-reading-active' ) ) return;

			if ( typeof WK.wkCloseReadingMode === 'function' ) WK.wkCloseReadingMode();
		} );
	}
	
	wkReadingBindGlobalEsc();
	wkReadingHistoryBindBack();

	function wkCloseReadingMode() {
		/*	Back natif : si on a pushState pour le mode lecture, revenir en arrière	*/
		try {
			if ( !WK_READING.state._wkClosingFromPop && WK_READING.state._wkHistoryPushed && wkReadingHistoryIsOn() ) {
				var st = W.history.state;
				if ( wkReadingHistoryIsReadingState( st ) ) {
					WK_READING.state._wkClosingFromUi = 1;
					WK_READING.state._wkHistoryPushed = 0;
					W.history.back();
				}
			}
		} catch ( e ) {}

		wkReadingSetActive( false );

		try {
			if ( UI.closeUi ) {
				try {
					WK_READING.state._wkHistoryPushed = 0;
					WK_READING.state._wkClosingFromUi = 0;
				} catch ( e0 ) {}
				UI.closeUi();
				return;
			}
		} catch ( e ) {}

		var root = D.getElementById( 'wk-reading-mode' );
		if ( root && root.parentNode ) root.parentNode.removeChild( root );

		/*	Toujours réarmer l'historique pour une prochaine ouverture	*/
		try {
			WK_READING.state._wkHistoryPushed = 0;
			WK_READING.state._wkClosingFromUi = 0;
		} catch ( e0 ) {}
	}

	function wkReadingBuildParseRequestParams( argPage ) {
		var base = {
			action: 'parse',
			formatversion: 2,
			page: argPage,
			prop: 'text',
			usearticle: 1,
			uselang: ( mw.config.get( 'wgUserLanguage' ) || 'fr' ).toLowerCase(),
			redirects: 1
		};

		var extra = ( UI.getParseParams ? UI.getParseParams() : null ) || {};
		for ( var k in extra ) base[ k ] = extra[ k ];

		return base;
	}

	/* =========================
		Exports
	   ========================= */

	WK.WK_READING = WK_READING;

	WK.wkReadingSetAdapter = wkReadingSetAdapter;

	if ( WK._wkReadingPendingAdapter ) {
		wkReadingSetAdapter( WK._wkReadingPendingAdapter );
		WK._wkReadingPendingAdapter = null;
	}

	WK.wkOpenReadingModeFromTitleEl = wkOpenReadingModeFromTitleEl;
	WK.wkOpenReadingModeFromPageTitle = wkOpenReadingModeFromPageTitle;
	WK.wkCloseReadingMode = wkCloseReadingMode;

	WK.wkReadingRenderStack = wkReadingRenderStack;

	W.WK_READING = WK_READING;
	W.wkOpenReadingModeFromTitleEl = wkOpenReadingModeFromTitleEl;
	W.wkOpenReadingModeFromPageTitle = wkOpenReadingModeFromPageTitle;
	W.wkCloseReadingMode = wkCloseReadingMode;

	WK.wkReadingBuildParseRequestParams = wkReadingBuildParseRequestParams;
	W.wkReadingBuildParseRequestParams = wkReadingBuildParseRequestParams;
	WK.wkReadingExtractFragment = wkReadingExtractFragment;
	W.wkReadingExtractFragment = wkReadingExtractFragment;

}() );
