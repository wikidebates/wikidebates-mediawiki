/*	Wikidébats — reading ui (Minerva) */
( function () {
	'use strict';

	var D = document;
	var W = window;

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	var UI_IDS = {
		rootId: 'wk-reading-mode',
		panelId: 'wk-reading-panel',
		leftId: 'wk-reading-left',
		stackId: 'wk-reading-stack',
		siblingsId: 'wk-reading-siblings',
		contentId: 'wk-reading-content',
		closeId: 'wk-reading-close',
		navBtnId: 'wk-reading-navbtn',
		overlayId: 'wk-reading-overlay',
		leftHandleId: 'wk-reading-left-handle',
		leftHeaderId: 'wk-reading-left-header'
	};

	var WKReadingLeftDocClickBound = false;

	function wkMsgD( key, fallback ) {
		try {
			if ( typeof WK.wkMsgD === 'function' ) return WK.wkMsgD( key, fallback );
			if ( typeof WK.wkMsg === 'function' ) return WK.wkMsg( key ) || fallback || key;
		} catch ( e ) {}
		return fallback || key;
	}

	function wkReadingGetBodyContent() {
		return D.querySelector( '#bodyContent' )
			|| D.querySelector( '#content' )
			|| D.querySelector( '#mw-content-text' )
			|| D.body;
	}

	function wkReadingCloseH1Menu( h1 ) {
		if ( !h1 ) return;

		var moreBtn = h1.querySelector( '.wk-h1-more > .wk-icon-more' );
		var menu = h1.querySelector( '.wk-h1-more .wk-h1-menu' );

		if ( menu ) menu.setAttribute( 'hidden', '' );
		if ( moreBtn ) moreBtn.setAttribute( 'aria-expanded', 'false' );
	}

	function wkReadingCopyText( text ) {
		if ( !text ) return false;

		try {
			if ( navigator.clipboard && navigator.clipboard.writeText ) {
				navigator.clipboard.writeText( text );
				return true;
			}
		} catch ( e ) {}

		try {
			var ta = D.createElement( 'textarea' );
			ta.value = text;
			ta.setAttribute( 'readonly', '' );
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			D.body.appendChild( ta );
			ta.select();
			D.execCommand( 'copy' );
			D.body.removeChild( ta );
			return true;
		} catch ( e2 ) {}

		return false;
	}

	function wkReadingGetAbsoluteUrl( href ) {
		if ( !href || href === '#' ) return '';
		try { return ( new URL( href, W.location.href ) ).href; } catch ( e ) {}
		return href;
	}

	function wkReadingBuildCloseButton() {
		var close = D.createElement( 'button' );
		close.id = UI_IDS.closeId;
		close.className = 'wk-reading-close';
		close.type = 'button';
		close.setAttribute( 'aria-label', wkMsgD( 'wk-reading-close', 'Fermer' ) );
		close.setAttribute( 'title', wkMsgD( 'wk-reading-close', 'Fermer' ) );
		close.innerHTML =
			'<svg viewBox="6 6 12 12" aria-hidden="true" focusable="false">' +
				'<path d="M6 6 L18 18 M18 6 L6 18" />' +
			'</svg>';

		close.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			if ( typeof WK.wkCloseReadingMode === 'function' ) WK.wkCloseReadingMode();
		} );

		return close;
	}

	function wkReadingEnsureFloatingButton( opt ) {
		if ( !opt || !opt.id ) return null;

		var btn = D.getElementById( opt.id );
		if ( btn ) return btn;

		btn = D.createElement( 'button' );
		btn.id = opt.id;
		btn.type = 'button';
		btn.className = opt.className || '';
		if ( opt.alt ) {
			btn.setAttribute( 'aria-label', opt.alt );
			btn.setAttribute( 'title', opt.alt );
		}

		var img = D.createElement( 'img' );
		img.src = opt.src || '';
		img.alt = opt.alt || '';
		btn.appendChild( img );

		( opt.container || D.body || D.documentElement ).appendChild( btn );

		return btn;
	}

	function wkReadingBindH1CollapseOnScroll( ui ) {
		if ( !ui || !ui.content || !ui.panel ) return;

		if ( ui.content.dataset.wkH1ScrollBound === '1' ) return;
		ui.content.dataset.wkH1ScrollBound = '1';

		var lastState = '';
		var lastT = 0;

		/*	Anti ping-pong :
			1) on n’autorise le collapse que si la page reste scrollable APRÈS collapse
			2) après ajout de is-collapsed, on corrige scrollTop si le navigateur l’a clampé,
			   sinon ça retombe à 0 => uncollapse => recollapse… */
		var rangeExpanded = -1;
		var rangeCollapsed = -1;
		var lastToggleAt = 0;

		function getH1() {
			return ui.panel.querySelector( '.wk-reading-h1' );
		}

		function measureRanges() {
			var h1 = getH1();
			if ( !h1 ) return;

			var was = h1.classList.contains( 'is-collapsed' );

			h1.classList.remove( 'is-collapsed' );
			rangeExpanded = ( ui.content.scrollHeight || 0 ) - ( ui.content.clientHeight || 0 );

			h1.classList.add( 'is-collapsed' );
			rangeCollapsed = ( ui.content.scrollHeight || 0 ) - ( ui.content.clientHeight || 0 );

			if ( !was ) h1.classList.remove( 'is-collapsed' );

			ui.content.dataset.wkH1RangeExpanded = String( rangeExpanded );
			ui.content.dataset.wkH1RangeCollapsed = String( rangeCollapsed );
		}

		function canCollapse() {
			if ( rangeExpanded < 0 || rangeCollapsed < 0 ) {
				var a = parseInt( ui.content.dataset.wkH1RangeExpanded || '', 10 );
				var b = parseInt( ui.content.dataset.wkH1RangeCollapsed || '', 10 );

				if ( !isNaN( a ) ) rangeExpanded = a;
				if ( !isNaN( b ) ) rangeCollapsed = b;

				if ( rangeExpanded < 0 || rangeCollapsed < 0 ) measureRanges();
			}

			/*	Il faut que le contenu reste scrollable après collapse.
				Seuil bas (px) : juste “non nul” + une petite marge pour la stabilité. */
			return ( rangeCollapsed >= 8 );
		}

		function clampScrollTopTo( minT ) {
			try {
				var el = ui.content;
				var maxT = ( el.scrollHeight || 0 ) - ( el.clientHeight || 0 );
				if ( maxT < 0 ) maxT = 0;

				var target = minT;
				if ( target > maxT ) target = maxT;

				if ( el.scrollTop < target ) el.scrollTop = target;
			} catch ( e ) {}
		}

		function apply() {
			var h1 = getH1();
			if ( !h1 ) return;

			var t = ui.content.scrollTop || 0;

			if ( !canCollapse() ) {
				lastState = 'off';
				h1.classList.remove( 'is-collapsed' );
				h1.style.setProperty( '--wk-h1-collapse', '0' );
				lastT = t;
				return;
			}

			var p = t / 80;
			if ( p < 0 ) p = 0;
			if ( p > 1 ) p = 1;

			/*	Direction (utile, mais on ajoute un cooldown aussi) */
			var dir = ( t > lastT ) ? 1 : ( t < lastT ? -1 : 0 );
			lastT = t;

			var onAt = 18;
			var offAt = 6;

			/*	Cooldown : évite l’oscillation due aux reflows / clamps de scrollTop */
			var now = Date.now();
			if ( now - lastToggleAt < 180 ) {
				h1.style.setProperty( '--wk-h1-collapse', String( p ) );
				return;
			}

			if ( lastState !== 'on' && dir >= 0 && t >= onAt ) {
				lastState = 'on';
				lastToggleAt = now;
				h1.classList.add( 'is-collapsed' );

				/*	Si le collapse a réduit la zone scrollable, certains navigateurs
					clampent scrollTop (parfois jusqu’à 0). On remonte à un seuil stable. */
				W.requestAnimationFrame( function () {
					clampScrollTopTo( onAt );
				} );
			} else if ( lastState === 'on' && dir <= 0 && t <= offAt ) {
				lastState = 'off';
				lastToggleAt = now;
				h1.classList.remove( 'is-collapsed' );
			}

			h1.style.setProperty( '--wk-h1-collapse', String( p ) );
		}

		ui.content.addEventListener( 'scroll', function () {
			if ( ui._wkH1ScrollRAF ) return;
			ui._wkH1ScrollRAF = W.requestAnimationFrame( function () {
				ui._wkH1ScrollRAF = 0;
				apply();
			} );
		}, { passive: true } );

		if ( ui.content.dataset.wkH1ResizeBound !== '1' ) {
			ui.content.dataset.wkH1ResizeBound = '1';

			W.addEventListener( 'resize', function () {
				rangeExpanded = -1;
				rangeCollapsed = -1;
				W.requestAnimationFrame( function () { measureRanges(); apply(); } );
			} );
		}

		measureRanges();
		apply();
	}


	function wkReadingBuildOverlay() {
		var ov = D.createElement( 'div' );
		ov.id = UI_IDS.overlayId;
		ov.className = 'wk-reading-overlay';
		return ov;
	}

	function wkReadingBuildLeftHandle() {
		var h = D.createElement( 'div' );
		h.id = UI_IDS.leftHandleId;
		h.className = 'wk-reading-left__handle';
		h.setAttribute( 'aria-hidden', 'true' );
		return h;
	}

	function wkReadingBuildLeftHeader() {
		var head = D.createElement( 'div' );
		head.id = UI_IDS.leftHeaderId;
		head.className = 'wk-reading-left__header';

		var handle = wkReadingBuildLeftHandle();
		head.appendChild( handle );

		return head;
	}

	function wkReadingBindLeftSheet( ui ) {
		if ( !ui || !ui.root || !ui.panel || !ui.left ) return;

		if ( ui.left.dataset.wkLeftSheetBound === '1' ) return;
		ui.left.dataset.wkLeftSheetBound = '1';

		var left = ui.left;

		var overlay = D.getElementById( UI_IDS.overlayId );
		if ( !overlay ) {
			overlay = wkReadingBuildOverlay();
			ui.root.appendChild( overlay );
		}

		var btn = D.getElementById( UI_IDS.navBtnId );
		if ( !btn ) {
			btn = wkReadingEnsureFloatingButton( {
				id: UI_IDS.navBtnId,
				className: 'wk-reading-navbtn',
				src: '/w/images/fr/4/4d/Bouton-fil-Ariane.svg',
				alt: wkMsgD( 'wk-breadcrumb-aria-label', 'Sommaire' ),
				container: ui.root
			} );
		}
		btn.setAttribute( 'aria-expanded', 'false' );

		var header = D.getElementById( UI_IDS.leftHeaderId );
		if ( !header ) {
			header = wkReadingBuildLeftHeader();
			left.insertBefore( header, left.firstChild );
		}

		var handle = header.querySelector( '#' + UI_IDS.leftHandleId );
		if ( handle && handle.dataset.wkTapCloseBound !== '1' ) {
			handle.dataset.wkTapCloseBound = '1';

			handle.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				e.stopPropagation();
				if ( ui._wkLeftClose ) ui._wkLeftClose();
			} );
		}

		function isOpen() {
			return left.classList.contains( 'is-open' );
		}

		function open() {
			if ( isOpen() ) return;
			left.classList.add( 'is-open' );
			overlay.classList.add( 'is-on' );
			btn.classList.add( 'is-hidden-when-open' );
			btn.setAttribute( 'aria-expanded', 'true' );
			ui.root.classList.add( 'is-sheet-open' );
		}

		function close() {
			if ( !isOpen() ) return;
			left.classList.remove( 'is-open' );
			left.style.transform = '';
			overlay.classList.remove( 'is-on' );
			btn.classList.remove( 'is-hidden-when-open' );
			btn.setAttribute( 'aria-expanded', 'false' );
			ui.root.classList.remove( 'is-sheet-open' );
		}

		function toggle() {
			if ( isOpen() ) close();
			else open();
		}

		if ( btn.dataset.wkBound !== '1' ) {
			btn.dataset.wkBound = '1';
			btn.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				e.stopPropagation();
				toggle();
			} );
		}

		if ( overlay.dataset.wkBound !== '1' ) {
			overlay.dataset.wkBound = '1';
			overlay.addEventListener( 'click', function ( e0 ) {
				e0.preventDefault();
				e0.stopPropagation();
				close();
			} );
		}

		if ( left.dataset.wkLinkCloseBound !== '1' ) {
			left.dataset.wkLinkCloseBound = '1';

			left.addEventListener( 'click', function ( e2 ) {
				if ( !isOpen() ) return;

				var t = e2.target;
				if ( !t ) return;

				var a = t.closest ? t.closest( 'a' ) : null;
				if ( a ) {
					var href = a.getAttribute( 'href' ) || '';
					if ( href && href !== '#' ) close();
					return;
				}

				var nav = t.closest ? t.closest( '.wk-reading__item, [data-page], [data-wk-page]' ) : null;
				if ( nav ) close();
			}, true );
		}

		if ( !WKReadingLeftDocClickBound ) {
			WKReadingLeftDocClickBound = true;

			D.addEventListener( 'click', function ( e3 ) {
				var root = D.getElementById( UI_IDS.rootId );
				if ( !root ) return;

				var left2 = D.getElementById( UI_IDS.leftId );
				var btn2 = D.getElementById( UI_IDS.navBtnId );
				var ov2 = D.getElementById( UI_IDS.overlayId );

				if ( !left2 || !ov2 ) return;
				if ( !left2.classList.contains( 'is-open' ) ) return;

				var t = e3.target;
				if ( !t ) return;

				if ( left2.contains( t ) ) return;
				if ( btn2 && btn2.contains( t ) ) return;
				if ( ov2 && ov2.contains( t ) ) return;

				left2.classList.remove( 'is-open' );
				left2.style.transform = '';
				ov2.classList.remove( 'is-on' );
				root.classList.remove( 'is-sheet-open' );

				if ( btn2 ) {
					btn2.classList.remove( 'is-hidden-when-open' );
					btn2.setAttribute( 'aria-expanded', 'false' );
				}
			}, true );
		}

		var startY = 0;
		var startX = 0;
		var dragging = false;
		var dy = 0;
		var startScrollTop = 0;

		function onStart( e ) {
			if ( !isOpen() ) return;
			if ( !e.touches || !e.touches.length ) return;

			startScrollTop = left.scrollTop || 0;

			startY = e.touches[ 0 ].clientY;
			startX = e.touches[ 0 ].clientX;
			dy = 0;
			dragging = false;

			try { left.style.transition = 'none'; } catch ( e0 ) {}
		}

		function onMove( e ) {
			if ( !isOpen() ) return;
			if ( !e.touches || !e.touches.length ) return;
			if ( startScrollTop > 0 ) return;

			var y = e.touches[ 0 ].clientY;
			var x = e.touches[ 0 ].clientX;

			dy = y - startY;
			var dx = x - startX;

			if ( Math.abs( dx ) > Math.abs( dy ) ) return;
			if ( dy <= 0 ) return;

			if ( !dragging ) dragging = true;

			e.preventDefault();
			e.stopPropagation();

			var max = left.offsetHeight || 500;
			var t = Math.min( dy, max );
			left.style.transform = 'translate3d(0,' + t + 'px,0)';
		}

		function onEnd() {
			if ( !isOpen() ) return;

			try { left.style.transition = ''; } catch ( e0 ) {}

			if ( dragging ) {
				if ( dy > 90 ) close();
				else left.style.transform = '';
			}

			dragging = false;
			dy = 0;
		}

		if ( left.dataset.wkDragBound !== '1' ) {
			left.dataset.wkDragBound = '1';
			left.addEventListener( 'touchstart', onStart, { passive: true } );
			left.addEventListener( 'touchmove', onMove, { passive: false } );
			left.addEventListener( 'touchend', onEnd, { passive: true } );
			left.addEventListener( 'touchcancel', onEnd, { passive: true } );
		}

		ui._wkLeftOpen = open;
		ui._wkLeftClose = close;
		ui._wkLeftToggle = toggle;
	}

	/* =========================
		Parse cache (Minerva)
	   ========================= */

	var WKReadingParseCache = ( function () {
		var max = 50;
		var map = new Map();

		function stableStringify( obj ) {
			if ( !obj || typeof obj !== 'object' ) return String( obj );

			var keys = Object.keys( obj ).sort();
			var out = [];

			for ( var i = 0; i < keys.length; i++ ) {
				var k = keys[ i ];
				var v = obj[ k ];

				if ( v === undefined ) continue;

				if ( v && typeof v === 'object' && !Array.isArray( v ) ) {
					out.push( k + '={' + stableStringify( v ) + '}' );
				} else if ( Array.isArray( v ) ) {
					out.push( k + '=[' + v.join( ',' ) + ']' );
				} else {
					out.push( k + '=' + String( v ) );
				}
			}

			return out.join( '&' );
		}

		function get( key ) {
			if ( !map.has( key ) ) return null;

			var v = map.get( key );
			map.delete( key );
			map.set( key, v );
			return v;
		}

		function set( key, val ) {
			if ( map.has( key ) ) map.delete( key );
			map.set( key, val );

			while ( map.size > max ) {
				var firstKey = map.keys().next().value;
				map.delete( firstKey );
			}
		}

		return {
			key: function ( params ) { return stableStringify( params ); },
			get: get,
			set: set
		};
	}() );

	var WKReadingParseInFlight = Object.create( null );
	var WKReadingParseCacheHook = null;

	var WKReadingApiPatched = false;

	function wkReadingPatchApiGetParseCache() {
		if ( WKReadingApiPatched ) return;
		WKReadingApiPatched = true;

		if ( !W.mw || !W.jQuery ) return;
		if ( !WK || typeof WK.wkGetApi !== 'function' ) return;

		var $ = W.jQuery;
		var origGetApi = WK.wkGetApi;

		WK.wkGetApi = function () {
			var api = origGetApi();
			if ( !api || api._wkReadingGetPatched ) return api;

			api._wkReadingGetPatched = true;

			var origGet = api.get;

			api.get = function ( params ) {
				try {
					if ( params && params.action === 'parse' && params.page && params.prop === 'text' ) {
						var key = 'parse?' + WKReadingParseCache.key( params );

						var cached = WKReadingParseCache.get( key );
						if ( cached ) return $.Deferred().resolve( cached ).promise();

						var req = origGet.call( api, params );

						if ( req && typeof req.then === 'function' ) {
							req.then( function ( data ) {
								if ( data && data.parse ) {
									WKReadingParseCache.set( key, data );
									if ( typeof WKReadingParseCacheHook === 'function' ) WKReadingParseCacheHook( key );
								}
							} );
						}

						return req;
					}
				} catch ( e ) {}

				return origGet.call( api, params );
			};

			return api;
		};
	}

	/* =========================
		Swipe siblings (Minerva)
	   ========================= */

	function wkReadingBindSiblingSwipeMinerva( ui ) {
		if ( !ui || !ui.content || !ui.siblings || !ui.root || !ui.panel ) return;

		if ( ui.content.dataset.wkSiblingSwipeBound === '1' ) return;
		ui.content.dataset.wkSiblingSwipeBound = '1';

		var startX = 0;
		var startY = 0;
		var lastX = 0;
		var lastY = 0;
		var tracking = false;
		var locked = false;
		var lockedDir = 0;

		var vLocked = false;
		var vStartAtTop = false;
		var vStartAtBottom = false;
		var vAction = '';
		var vPull = 0;
		var vPullLastY = 0;
		var vTocLastDeltaY = 0;

		WKReadingParseCacheHook = function ( key ) {
			try {
				if ( !tracking || !locked ) return;
				if ( !ui._wkPeekPendingKey || ui._wkPeekPendingKey !== key ) return;
				if ( !ui._wkPeekPendingPage || !ui._wkPeekPendingDir ) return;
				setPeekContentByPage( ui._wkPeekPendingPage, ui._wkPeekPendingDir );
				setDragOffset( lastX - startX );
			} catch ( e ) {}
		};

		function isSheetOpen() {
			return ui.root.classList.contains( 'is-sheet-open' );
		}

		function getListEls() {
			var list = ui.siblings.querySelector( '.wk-reading-siblings__list' );
			if ( !list ) return null;

			var items = list.querySelectorAll( '.wk-reading-siblings__item' );
			if ( !items || !items.length ) return null;

			return Array.prototype.slice.call( items );
		}

		function getCurrentIndex( items ) {
			for ( var i = 0; i < items.length; i++ ) {
				var t = items[ i ].querySelector( '.wk-reading-siblings__title' );
				if ( t && t.classList.contains( 'is-current' ) ) return i;
			}
			return -1;
		}

		function openByIndex( items, idx ) {
			if ( idx < 0 || idx >= items.length ) return false;

			var a = items[ idx ].querySelector( 'a.wk-reading-siblings__link[data-page]' );
			if ( !a ) return false;

			a.click();
			return true;
		}

		function getSiblingTargets() {
			var items = getListEls();
			if ( !items || !items.length ) return { prev: '', next: '' };

			var cur = getCurrentIndex( items );
			if ( cur === -1 ) return { prev: '', next: '' };

			function getPageAt( idx ) {
				if ( idx < 0 || idx >= items.length ) return '';
				var a = items[ idx ].querySelector( 'a.wk-reading-siblings__link[data-page]' );
				return a ? ( a.getAttribute( 'data-page' ) || '' ) : '';
			}

			return {
				prev: getPageAt( cur - 1 ),
				next: getPageAt( cur + 1 )
			};
		}

		function buildParams( page ) {
			if ( !page ) return null;
			try {
				if ( typeof WK.wkReadingBuildParseRequestParams === 'function' ) return WK.wkReadingBuildParseRequestParams( page );
			} catch ( e ) {}
			return null;
		}

		function prefetchPage( page ) {
			if ( !page ) return;

			var params = buildParams( page );
			if ( !params ) return;

			try {
				var key = 'parse?' + WKReadingParseCache.key( params );

				if ( WKReadingParseCache.get( key ) ) return;
				if ( WKReadingParseInFlight[ key ] ) return;

				var req = WK.wkGetApi().get( params );
				WKReadingParseInFlight[ key ] = 1;

				if ( req && typeof req.always === 'function' ) {
					req.always( function () { delete WKReadingParseInFlight[ key ]; } );
				} else if ( req && typeof req.finally === 'function' ) {
					req.finally( function () { delete WKReadingParseInFlight[ key ]; } );
				} else {
					W.setTimeout( function () { delete WKReadingParseInFlight[ key ]; }, 4000 );
				}
			} catch ( e ) {}
		}

		function prefetchSiblings() {
			var t = getSiblingTargets();
			if ( t.next ) prefetchPage( t.next );
			if ( t.prev ) prefetchPage( t.prev );
		}

		function getSiblingTitleByPage( page ) {
			if ( !page || !ui.siblings ) return '';

			var a = ui.siblings.querySelector( 'a.wk-reading-siblings__link[data-page="' + page.replace( /"/g, '\\"' ) + '"]' );
			if ( a ) return ( a.textContent || '' ).replace( /\s+/g, ' ' ).trim();

			var cur = ui.siblings.querySelector( '.wk-reading-siblings__title.is-current .wk-reading-siblings__current' );
			if ( cur ) return ( cur.textContent || '' ).replace( /\s+/g, ' ' ).trim();

			return '';
		}

		function getRealH1() {
			return ui.panel ? ui.panel.querySelector( '.wk-reading-h1' ) : null;
		}

		function hideRealH1( on ) {
			var h1 = getRealH1();
			if ( !h1 ) return;

			if ( on ) {
				h1.style.transition = 'opacity 120ms linear';
				h1.style.opacity = '0';
				h1.style.pointerEvents = 'none';
			} else {
				h1.style.transition = 'opacity 120ms linear';
				h1.style.opacity = '';
				h1.style.pointerEvents = '';
				W.setTimeout( function () {
					var h12 = getRealH1();
					if ( h12 ) h12.style.transition = '';
				}, 140 );
			}
		}

		function setPeekTitleEarly( on ) {
			if ( !ui._wkPeekH1 ) return;

			if ( on ) {
				ui._wkPeekH1.style.transition = 'opacity 120ms linear';
				ui._wkPeekH1.style.opacity = '1';
			} else {
				ui._wkPeekH1.style.transition = 'opacity 120ms linear';
				ui._wkPeekH1.style.opacity = '0';
				W.setTimeout( function () {
					if ( ui._wkPeekH1 ) ui._wkPeekH1.style.transition = '';
				}, 140 );
			}
		}

		function ensurePeekLayer() {
			if ( ui._wkPeekLayer ) return ui._wkPeekLayer;

			var layer = D.createElement( 'div' );
			layer.className = 'wk-reading-peek';
			layer.style.position = 'absolute';
			layer.style.top = '0';
			layer.style.left = '0';
			layer.style.right = '0';
			layer.style.bottom = '0';
			layer.style.overflow = 'auto';
			layer.style.webkitOverflowScrolling = 'touch';
			layer.style.pointerEvents = 'none';
			layer.style.zIndex = '1';
			layer.style.background = 'inherit';
			layer.style.paddingLeft = '16px';
			layer.style.paddingRight = '16px';

			layer.style.boxShadow = '0 0 12px rgba(0,0,0,0.15)';
			layer.style.willChange = 'transform';

			try {
				ui.content.style.position = ui.content.style.position || 'relative';
				ui.content.style.zIndex = '2';
				ui.content.style.willChange = 'transform';
			} catch ( e ) {}

			layer.style.display = 'none';
			layer.style.transform = 'translateX(100%)';

			if ( !ui.panel.style.position ) ui.panel.style.position = 'relative';

			var head = D.createElement( 'div' );
			head.className = 'wk-reading-h1 wk-reading-h1--peek';
			head.style.position = 'sticky';
			head.style.top = '0';
			head.style.zIndex = '3';
			head.style.pointerEvents = 'none';
			head.style.background = 'inherit';
			head.style.willChange = 'transform';
			head.style.opacity = '0';

			var title = D.createElement( 'div' );
			title.className = 'wk-reading-h1__title wk-icon-before wk-icon-argument';
			title.style.marginLeft = '0';
			title.style.setProperty( 'margin-left', '0', 'important' );

			title.style.whiteSpace = 'nowrap';
			title.style.overflow = 'hidden';
			title.style.textOverflow = 'ellipsis';
			title.style.maxWidth = '100%';
			title.style.display = 'block';

			head.appendChild( title );
			layer.appendChild( head );

			ui._wkPeekH1 = head;
			ui._wkPeekH1Title = title;

			var body = D.createElement( 'div' );
			body.className = 'wk-reading-peek-body';
			layer.appendChild( body );
			ui._wkPeekBody = body;

			ui.panel.appendChild( layer );

			ui._wkPeekLayer = layer;
			return layer;
		}


		function getParentTitle() {
			try {
				if ( !ui || !ui.stack ) return '';
				var cur = ui.stack.querySelector( '.wk-reading__item.is-current' );
				if ( !cur ) return '';
				var parent = cur.previousElementSibling;
				if ( !parent ) return '';

				var t = parent.querySelector( '.wk-reading__title, .wk-reading__label, .wk-reading__link, a, span, div' );
				var txt = t ? ( t.textContent || '' ) : ( parent.textContent || '' );
				return txt.replace( /\s+/g, ' ' ).trim();
			} catch ( e ) {}
			return '';
		}

		function ensureParentPeek() {
			if ( ui._wkParentPeek ) return ui._wkParentPeek;

			var peek = D.createElement( 'div' );
			peek.className = 'wk-reading-parent-peek';
			peek.style.position = 'absolute';
			peek.style.top = '0';
			peek.style.left = '0';
			peek.style.right = '0';
			peek.style.height = '72px';
			peek.style.display = 'none';
			peek.style.pointerEvents = 'none';
			peek.style.zIndex = '1';
			peek.style.background = 'inherit';
			peek.style.boxShadow = 'none';
			peek.style.borderBottom = '1px solid rgba(0,0,0,0.08)';
			peek.style.opacity = '0';
			peek.style.transform = 'translate3d(0,-8px,0)';
			peek.style.willChange = 'transform, opacity';

			var inner = D.createElement( 'div' );
			inner.style.display = 'flex';
			inner.style.alignItems = 'center';
			inner.style.gap = '10px';
			inner.style.padding = '16px 16px 12px 16px';
			inner.style.fontSize = '14px';
			inner.style.lineHeight = '1.2';

			var sub = D.createElement( 'div' );
			sub.className = 'wk-reading-parent-peek__sub';
			sub.style.whiteSpace = 'nowrap';
			sub.style.overflow = 'hidden';
			sub.style.textOverflow = 'ellipsis';
			sub.style.opacity = '0.75';
			sub.style.marginTop = '2px';
			sub.style.fontSize = '13px';

			var col = D.createElement( 'div' );
			col.style.minWidth = '0';

			peek.appendChild( inner );

			try {
				if ( !ui.panel.style.position ) ui.panel.style.position = 'relative';
				ui.panel.appendChild( peek );

				ui.content.style.position = ui.content.style.position || 'relative';
				ui.content.style.zIndex = '2';
				ui.content.style.willChange = 'transform';
			} catch ( e ) {}

			ui._wkParentPeek = peek;

			return peek;
		}

		function parentPeekShow( pull ) {
			var peek = ensureParentPeek();
			if ( !peek ) return;

			peek.style.display = '';
			var p = pull / 90;
			if ( p < 0 ) p = 0;
			if ( p > 1 ) p = 1;

			peek.style.opacity = String( 0.15 + p * 0.85 );
			peek.style.transform = 'translate3d(0,' + ( -8 + p * 8 ) + 'px,0)';
		}

		function parentPeekHide( immediate ) {
			var peek = ui._wkParentPeek;
			if ( !peek ) return;

			if ( immediate ) {
				peek.style.display = 'none';
				peek.style.opacity = '0';
				peek.style.transform = 'translate3d(0,-8px,0)';
				return;
			}

			peek.style.transition = 'opacity 160ms linear, transform 160ms cubic-bezier(0.2,0,0.2,1)';
			peek.style.opacity = '0';
			peek.style.transform = 'translate3d(0,-8px,0)';
			W.setTimeout( function () {
				if ( ui._wkParentPeek ) {
					ui._wkParentPeek.style.transition = '';
					ui._wkParentPeek.style.display = 'none';
				}
			}, 170 );
		}

		function parentDragSet( pull ) {
			if ( !ui || !ui.content ) return;

			ui.content.style.transform = 'translate3d(0,' + pull + 'px,0)';
			parentPeekShow( pull );
		}

		function parentDragReset( immediate ) {
			if ( !ui || !ui.content ) return;

			if ( immediate ) {
				try {
					ui.content.style.transition = '';
					ui.content.style.transform = 'translate3d(0,0,0)';
					ui.content.style.transform = '';
				} catch ( e0 ) {}
				parentPeekHide( true );
				return;
			}

			ui.content.style.transition = 'transform 180ms cubic-bezier(0.2,0,0.2,1)';
			ui.content.style.transform = 'translate3d(0,0,0)';

			W.setTimeout( function () {
				if ( ui && ui.content ) ui.content.style.transition = '';
			}, 190 );

			parentPeekHide( false );
		}

		function getFragmentFromParseData( data ) {
			var html = ( data && data.parse && data.parse.text ) ? data.parse.text : '';
			if ( !html ) return '';

			try {
				if ( typeof WK.wkReadingExtractFragment === 'function' ) return WK.wkReadingExtractFragment( html ) || '';
			} catch ( e ) {}

			return '';
		}

		function setPeekContentByPage( page, dir ) {
			var layer = ensurePeekLayer();

			var params = ( WK && typeof WK.wkReadingBuildParseRequestParams === 'function' )
				? WK.wkReadingBuildParseRequestParams( page )
				: null;

			if ( !params ) {
				ui._wkPeekPendingKey = '';
				ui._wkPeekPendingDir = 0;
				if ( layer ) layer.style.display = 'none';
				if ( ui._wkPeekBody ) ui._wkPeekBody.innerHTML = '';
				return false;
			}

			var key = 'parse?' + WKReadingParseCache.key( params );
			var cached = WKReadingParseCache.get( key );

			var frag = cached ? getFragmentFromParseData( cached ) : '';

			if ( !frag ) {
				ui._wkPeekPendingKey = key;
				ui._wkPeekPendingDir = dir;
				ui._wkPeekPendingPage = page;

				if ( ui._wkPeekBody ) ui._wkPeekBody.innerHTML = '';
				layer.style.display = 'none';

				prefetchPage( page );
				return false;
			}

			if ( ui._wkPeekH1Title ) ui._wkPeekH1Title.textContent = getSiblingTitleByPage( page ) || page;

			ui._wkPeekPendingKey = '';
			ui._wkPeekPendingDir = 0;
			ui._wkPeekPendingPage = '';

			if ( ui._wkPeekBody ) ui._wkPeekBody.innerHTML = frag;

			layer.style.display = '';
			hideRealH1( true );
			layer.style.pointerEvents = 'none';
			setPeekTitleEarly( true );

			if ( dir > 0 ) layer.style.transform = 'translateX(100%)';
			else layer.style.transform = 'translateX(-100%)';

			return true;
		}

		function setH1SwipeOffset( dx ) {
			var h1 = ui.panel ? ui.panel.querySelector( '.wk-reading-h1' ) : null;
			if ( !h1 ) return;

			var max = 18;
			var x = dx * 0.2;
			if ( x > max ) x = max;
			if ( x < -max ) x = -max;

			h1.style.transform = 'translateX(' + x + 'px)';
			h1.style.willChange = 'transform';
		}

		function resetH1SwipeOffset() {
			var h1 = ui.panel ? ui.panel.querySelector( '.wk-reading-h1' ) : null;
			if ( !h1 ) return;

			h1.style.transition = 'transform 180ms cubic-bezier(0.2,0,0.2,1)';
			h1.style.transform = 'translateX(0)';

			W.setTimeout( function () {
				h1.style.transition = '';
				h1.style.transform = '';
				h1.style.willChange = '';
			}, 180 );
		}

		function setDragOffset( dx ) {
			if ( !ui.content ) return;

			var max = ( ui.panel && ui.panel.clientWidth ) ? ui.panel.clientWidth : ( W.innerWidth || 360 );
			if ( dx > max ) dx = max;
			if ( dx < -max ) dx = -max;

			ui.content.style.transform = 'translateX(' + dx + 'px)';

			var layer = ui._wkPeekLayer;
			if ( layer && layer.style.display !== 'none' ) {
				if ( dx < 0 ) layer.style.transform = 'translateX(calc(100% + ' + dx + 'px))';
				else layer.style.transform = 'translateX(calc(-100% + ' + dx + 'px))';
			}

			if ( ui._wkPeekH1 && layer && layer.style.display !== 'none' ) {
				var mx = dx * 0.22;
				if ( mx > 18 ) mx = 18;
				if ( mx < -18 ) mx = -18;
				ui._wkPeekH1.style.transform = 'translateX(' + mx + 'px)';
			}

			if ( ui._wkPeekH1 && layer && layer.style.display !== 'none' ) {
				var showAt = 18;
				if ( Math.abs( dx ) >= showAt ) setPeekTitleEarly( true );
				else setPeekTitleEarly( false );
			}
		}

		function resetDragOffset() {
			if ( !ui.content ) return;

			ui.content.style.transition = 'transform 180ms cubic-bezier(0.2,0,0.2,1)';
			ui.content.style.transform = 'translateX(0)';

			var layer = ui._wkPeekLayer;
			if ( layer ) {
				layer.style.transition = 'transform 180ms cubic-bezier(0.2,0,0.2,1)';
				layer.style.transform = 'translateX(100%)';
				layer.style.pointerEvents = 'none';
				if ( ui._wkPeekH1 ) ui._wkPeekH1.style.transform = '';
				layer.style.display = 'none';
				hideRealH1( false );
				setPeekTitleEarly( false );
			}

			W.setTimeout( function () {
				if ( ui && ui.content ) ui.content.style.transition = '';
				if ( layer ) layer.style.transition = '';
			}, 180 );
		}

		function bounceEdge( dir ) {
			var el = ui.content;
			if ( !el ) return;

			var dist = ( dir > 0 ? 14 : -14 );

			if ( el.animate ) {
				el.animate(
					[
						{ transform: 'translateX(0)' },
						{ transform: 'translateX(' + dist + 'px)' },
						{ transform: 'translateX(0)' }
					],
					{
						duration: 170,
						easing: 'cubic-bezier(0.2, 0.0, 0.2, 1 )'
					}
				);
				return;
			}

			var prevTransition = el.style.transition;
			var prevTransform = el.style.transform;

			el.style.transition = 'transform 120ms cubic-bezier(0.2, 0.0, 0.2, 1 )';
			el.style.transform = 'translateX(' + dist + 'px)';

			W.setTimeout( function () {
				el.style.transform = 'translateX(0)';
				W.setTimeout( function () {
					el.style.transition = prevTransition || '';
					el.style.transform = prevTransform || '';
				}, 140 );
			}, 90 );
		}

		function navigate( dir ) {
			var items = getListEls();
			if ( !items || items.length < 2 ) return false;

			var cur = getCurrentIndex( items );
			if ( cur === -1 ) return false;

			var next = cur + ( dir > 0 ? 1 : -1 );

			if ( next < 0 ) {
				bounceEdge( -1 );
				return false;
			}
			if ( next >= items.length ) {
				bounceEdge( +1 );
				return false;
			}

			var ok = openByIndex( items, next );
			if ( ok ) W.setTimeout( prefetchSiblings, 0 );

			return ok;
		}

		function atTop() {
			try { return ( ui.content.scrollTop <= 1 ); } catch ( e ) {}
			return false;
		}

		function atBottom() {
			/*	Tolérance + exact :
				- exact : tout en bas
				- tolérance : “presque en bas” (utile quand le H1 collapsed change la hauteur) */
			try {
				var el = ui.content;
				var st = el.scrollTop || 0;
				var ch = el.clientHeight || 0;
				var sh = el.scrollHeight || 0;

				var exact = ( st + ch >= sh - 2 );
				var remain = sh - ( st + ch );

				return ( exact || remain <= 64 );
			} catch ( e ) {}
			return false;
		}

		function openTocSheet() {
			try {
				if ( ui && ui._wkLeftOpen ) ui._wkLeftOpen();
			} catch ( e ) {}
		}

		var _wkTocDragOpen = false;
		var _wkTocDragMax = 0;

		function tocDragEnsureOpen() {
			if ( _wkTocDragOpen ) return true;
			if ( !ui || !ui.left || !ui.root ) return false;

			var left = ui.left;
			var overlay = D.getElementById( UI_IDS.overlayId );
			var btn = D.getElementById( UI_IDS.navBtnId );

			/*	IMPORTANT : mettre le panneau en état "ouvert" sans le faire apparaître d’un coup.
				On l’ancre fermé via transform = max, puis on réduit max->0 pendant le drag.	*/
			if ( !_wkTocDragMax ) _wkTocDragMax = left.offsetHeight || 500;

			left.classList.add( 'is-open' );
			if ( overlay ) {
				overlay.classList.add( 'is-on' );
				/*	Pendant le drag, on garde la main sur les events touch de ui.content.
					Sinon l’overlay peut capter le gesture et figer le mouvement. */
				overlay.dataset.wkDragPe = '1';
				overlay.style.pointerEvents = 'none';
			}
			if ( btn ) {
				btn.classList.add( 'is-hidden-when-open' );
				btn.setAttribute( 'aria-expanded', 'true' );
			}
			ui.root.classList.add( 'is-sheet-open' );

			try { left.style.transition = 'none'; } catch ( e0 ) {}
			try { left.style.willChange = 'transform'; } catch ( e1 ) {}
			try { left.style.transform = 'translate3d(0,' + _wkTocDragMax + 'px,0)'; } catch ( e2 ) {}

			_wkTocDragOpen = true;
			return true;
		}

		function tocDragSet( pullPx ) {
			if ( !ui || !ui.left ) return;
			var left = ui.left;

			if ( !_wkTocDragMax ) _wkTocDragMax = left.offsetHeight || 500;

			var max = _wkTocDragMax;
			var pull = pullPx;
			if ( pull < 0 ) pull = 0;
			if ( pull > max ) pull = max;

			var t = max - pull;
			left.style.transform = 'translate3d(0,' + t + 'px,0)';
		}

		function tocDragCommit() {
			if ( !ui || !ui.left ) return;
			var left = ui.left;

			var overlay = D.getElementById( UI_IDS.overlayId );
			if ( overlay && overlay.dataset.wkDragPe === '1' ) {
				overlay.style.pointerEvents = '';
				delete overlay.dataset.wkDragPe;
			}

			openTocSheet();
			try { left.style.transition = ''; } catch ( e0 ) {}
			try { left.style.transform = ''; } catch ( e1 ) {}
			try { left.style.willChange = ''; } catch ( e2 ) {}

			_wkTocDragOpen = false;
			_wkTocDragMax = 0;
		}

		function tocDragCancel() {
			var overlay = D.getElementById( UI_IDS.overlayId );
			if ( overlay && overlay.dataset.wkDragPe === '1' ) {
				overlay.style.pointerEvents = '';
				delete overlay.dataset.wkDragPe;
			}

			try {
				if ( ui && typeof ui._wkLeftClose === 'function' ) ui._wkLeftClose();
				else if ( ui && ui.left ) {
					ui.left.classList.remove( 'is-open' );
					ui.left.style.transform = '';
				}
			} catch ( e0 ) {}

			_wkTocDragOpen = false;
			_wkTocDragMax = 0;
		}

		function openParentOrClose() {
			try {
				/*	Sécurité : ne jamais garder un transform inline avant navigation */
				parentDragReset( true );
				if ( !ui || !ui.stack ) return;

				var cur = ui.stack.querySelector( '.wk-reading__item.is-current' );
				if ( !cur ) return;

				var parent = cur.previousElementSibling;
				if ( !parent || !parent.classList ) return;

				if ( parent.classList.contains( 'is-root' ) ) {
					if ( typeof WK.wkCloseReadingMode === 'function' ) WK.wkCloseReadingMode();
					return;
				}

				if ( parent.click ) parent.click();
			} catch ( e ) {}
		}

		function shouldIgnoreTarget( t ) {
			if ( !t ) return false;
			if ( t.closest && t.closest( 'a, button, input, textarea, select, label' ) ) return true;
			return false;
		}

		ui.content.addEventListener( 'touchstart', function ( e ) {
			if ( isSheetOpen() ) return;
			if ( !e.touches || e.touches.length !== 1 ) return;
			if ( shouldIgnoreTarget( e.target ) ) return;

			tracking = true;
			locked = false;
			lockedDir = 0;

			startX = e.touches[ 0 ].clientX;
			startY = e.touches[ 0 ].clientY;
			lastX = startX;
			lastY = startY;

			vLocked = false;
			vAction = '';
			vPull = 0;
			vPullLastY = startY;
			vTocLastDeltaY = 0;

			_wkTocDragOpen = false;
			_wkTocDragMax = 0;

			vStartAtTop = atTop();
			vStartAtBottom = atBottom();
		}, { passive: true } );

		ui.content.addEventListener( 'touchmove', function ( e ) {
			if ( !tracking ) return;
			if ( isSheetOpen() && !vLocked ) return;
			if ( !e.touches || e.touches.length !== 1 ) return;

			lastX = e.touches[ 0 ].clientX;
			lastY = e.touches[ 0 ].clientY;

			var dx = lastX - startX;
			var dy = lastY - startY;

			if ( !locked && !vLocked ) {
				var vMaybe = ( Math.abs( dy ) > 6 && Math.abs( dy ) > Math.abs( dx ) * 1.1 );

				if ( vMaybe && !vStartAtTop && !vStartAtBottom && !atTop() && !atBottom() ) return;
				if ( atBottom() && dy > 0 ) return;
				if ( atTop() && dy < 0 ) return;
			}

			if ( locked ) {
				setDragOffset( dx );
				setH1SwipeOffset( dx );
				e.preventDefault();
				return;
			}

			if ( vLocked ) {
				if ( vAction === 'toc' ) {
					if ( tocDragEnsureOpen() ) {
						var max = _wkTocDragMax || ( ui.left ? ( ui.left.offsetHeight || 500 ) : 500 );

						/*	IMPORTANT :
							Le panneau suit le mouvement *incrémental* du doigt.
							Donc si l’utilisateur remonte puis redescend un peu,
							l’ouverture est immédiatement annulée (sans devoir revenir au point de départ). */
						var deltaY = lastY - vPullLastY;
						vTocLastDeltaY = deltaY;

						/*	Finger down => deltaY > 0 => on ferme (pull diminue)
							Finger up   => deltaY < 0 => on ouvre (pull augmente) */
						vPull -= deltaY;

						if ( vPull < 0 ) vPull = 0;
						if ( vPull > max ) vPull = max;

						vPullLastY = lastY;
						tocDragSet( vPull );
					}
					e.preventDefault();
					e.stopPropagation();
					return;
				}

				/*	parent : effet progressif (révéler l’argument parent) */
				var pullP = dy;
				if ( pullP < 0 ) pullP = 0;
				if ( pullP > 120 ) pullP = 120 + ( pullP - 120 ) * 0.35;
				if ( pullP > 180 ) pullP = 180;
				parentDragSet( pullP );
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			if ( Math.abs( dx ) > 12 && Math.abs( dx ) > Math.abs( dy ) * 1.2 ) {
				locked = true;
				lockedDir = ( dx < 0 ? +1 : -1 );

				e.preventDefault();
				e.stopPropagation();

				var t = getSiblingTargets();

				if ( lockedDir > 0 ) {
					if ( t.next ) {
						prefetchPage( t.next );
						setPeekContentByPage( t.next, +1 );
					}
				} else {
					if ( t.prev ) {
						prefetchPage( t.prev );
						setPeekContentByPage( t.prev, -1 );
					}
				}

				setDragOffset( dx );
				return;
			}

			var vOk = ( Math.abs( dy ) > 12 && Math.abs( dy ) > Math.abs( dx ) * 1.2 );
			if ( vOk ) {
				var canTop = vStartAtTop;
				var canBottom = vStartAtBottom;

				if ( canTop && dy > 12 ) {
					vLocked = true;
					vAction = 'parent';

					ensureParentPeek();
					parentDragSet( dy );

					e.preventDefault();
					e.stopPropagation();
					return;
				}

				if ( canBottom && dy < -12 && Math.abs( dx ) < 10 ) {
					vLocked = true;
					vAction = 'toc';
					vPull = 0;

					tocDragEnsureOpen();

					var max2 = _wkTocDragMax || ( ui.left ? ( ui.left.offsetHeight || 500 ) : 500 );
					var pull2 = -dy;
					if ( pull2 > max2 ) pull2 = max2;
					vPull = pull2;
					tocDragSet( vPull );

					e.preventDefault();
					e.stopPropagation();
					return;
				}
			}
		}, { passive: false } );

		function endGesture() {
			if ( !tracking ) return;
			tracking = false;

			var dx = lastX - startX;
			var dy = lastY - startY;

			if ( vLocked ) {
				vLocked = false;

				if ( vAction === 'toc' ) {
					/*	Si l’utilisateur termine en redescendant, on annule (fermeture),
						même si le panneau a été tiré assez haut. */
					if ( vTocLastDeltaY > 0 ) tocDragCancel();
					else if ( vPull >= 60 ) tocDragCommit();
					else tocDragCancel();
					vTocLastDeltaY = 0;
				} else if ( vAction === 'parent' ) {
					if ( dy >= 60 && Math.abs( dy ) > Math.abs( dx ) * 1.2 ) openParentOrClose();
				}

				vAction = '';
				vPull = 0;
				return;
			}

			resetDragOffset();
			resetH1SwipeOffset();

			if ( !locked ) return;
			locked = false;

			if ( Math.abs( dx ) < 60 ) return;
			if ( Math.abs( dx ) < Math.abs( dy ) * 1.2 ) return;

			if ( dx < 0 ) navigate( +1 );
			else navigate( -1 );
		}

		ui.content.addEventListener( 'touchend', endGesture, { passive: true } );
		ui.content.addEventListener( 'touchcancel', function () {
			locked = false;
			vLocked = false;
			vAction = '';
			try {
				if ( ui && ui.content ) {
					ui.content.style.transition = '';
					ui.content.style.transform = '';
				}
				parentPeekHide( true );
			} catch ( e ) {}
			endGesture();
		}, { passive: true } );

		W.setTimeout( prefetchSiblings, 0 );
	}

	function ensureUi() {
		var body = wkReadingGetBodyContent();
		if ( !body ) return null;

		var root = D.getElementById( UI_IDS.rootId );
		if ( root ) {
			var ui = {
				root: root,
				panel: D.getElementById( UI_IDS.panelId ),
				left: D.getElementById( UI_IDS.leftId ),
				stack: D.getElementById( UI_IDS.stackId ),
				siblings: D.getElementById( UI_IDS.siblingsId ),
				content: D.getElementById( UI_IDS.contentId )
			};

			wkReadingPatchApiGetParseCache();
			wkReadingBindLeftSheet( ui );
			wkReadingBindSiblingSwipeMinerva( ui );
			wkReadingBindH1CollapseOnScroll( ui );

			return ui;
		}

		root = D.createElement( 'div' );
		root.id = UI_IDS.rootId;

		var panel = D.createElement( 'div' );
		panel.className = 'wk-reading-panel';
		panel.id = UI_IDS.panelId;

		var stack = D.createElement( 'div' );
		stack.id = UI_IDS.stackId;

		var siblings = D.createElement( 'div' );
		siblings.id = UI_IDS.siblingsId;
		siblings.className = 'wk-reading-siblings';
		siblings.setAttribute( 'aria-label', wkMsgD( 'wk-reading-siblings-aria-label' ) );

		var content = D.createElement( 'div' );
		content.id = UI_IDS.contentId;
		content.className = 'wk-reading-output';

		var left = D.createElement( 'div' );
		left.className = 'wk-reading-left';
		left.id = UI_IDS.leftId;

		left.appendChild( stack );
		left.appendChild( siblings );

		panel.appendChild( content );
		root.appendChild( panel );
		root.appendChild( left );

		body.insertBefore( root, body.firstChild );

		var ui2 = { root: root, panel: panel, left: left, stack: stack, siblings: siblings, content: content };

		wkReadingPatchApiGetParseCache();
		wkReadingBindLeftSheet( ui2 );
		wkReadingBindSiblingSwipeMinerva( ui2 );
		wkReadingBindH1CollapseOnScroll( ui2 );

		return ui2;
	}

	function isClickInsideReading( target ) {
		if ( !target ) return false;
		var root = D.getElementById( UI_IDS.rootId );
		return !!( root && root.contains( target ) );
	}

	function ensureH1Dom( ui ) {
		if ( !ui || !ui.panel ) return null;

		var h1 = ui.panel.querySelector( '.wk-reading-h1' );
		if ( !h1 ) return null;

		var close = h1.querySelector( '#' + UI_IDS.closeId );
		if ( !close ) {
			close = wkReadingBuildCloseButton();
			h1.insertBefore( close, h1.firstChild );
		}

		var actions = h1.querySelector( '.wk-reading-h1__actions' );
		if ( !actions ) {
			actions = D.createElement( 'div' );
			actions.className = 'wk-reading-h1__actions';
			h1.appendChild( actions );
		}

		var legacyEdit = actions.querySelector( '.wk-h1-btn.bouton-modifier' );
		if ( legacyEdit && legacyEdit.parentNode ) legacyEdit.parentNode.removeChild( legacyEdit );

		if ( !actions.querySelector( '.wk-h1-more' ) ) {
			var moreWrap = D.createElement( 'div' );
			moreWrap.className = 'wk-h1-more';

			moreWrap.innerHTML =
				'<div class="wk-h1-btn wk-icon-before wk-icon-more" aria-haspopup="true" aria-expanded="false"></div>' +
				'<div class="wk-h1-menu" hidden>' +
					'<a class="wk-h1-menu__detail wk-icon-before wk-icon-page" href="#"></a>' +
					'<a class="wk-h1-menu__edit wk-icon-before wk-icon-edit" href="#"></a>' +
					'<a class="wk-h1-menu__copy wk-icon-before wk-icon-link" href="#"></a>' +
				'</div>';

			actions.appendChild( moreWrap );
		} else {
			var menu = actions.querySelector( '.wk-h1-more .wk-h1-menu' );
			if ( menu && !menu.querySelector( '.wk-h1-menu__edit' ) ) {
				var aEdit = D.createElement( 'a' );
				aEdit.className = 'wk-h1-menu__edit wk-icon-before wk-icon-edit';
				aEdit.href = '#';

				var aCopy = menu.querySelector( '.wk-h1-menu__copy' );
				if ( aCopy && aCopy.parentNode ) aCopy.parentNode.insertBefore( aEdit, aCopy );
				else menu.appendChild( aEdit );
			}
		}

		return h1;
	}

	function updateH1Actions( ui ) {
		var h1 = ensureH1Dom( ui );
		if ( !h1 ) return;

		var links = ( WK.WK_READING && WK.WK_READING.state && WK.WK_READING.state.h1Links )
			? WK.WK_READING.state.h1Links
			: { editHref: '#', detailHref: '' };

		var editTxt = wkMsgD( 'wk-edit-display-title' );
		var detailTxt = wkMsgD( 'wk-view-detailed-page' );
		var copyTxt = wkMsgD( 'wk-copy-argument-link' );
		var moreTxt = wkMsgD( 'wk-reading-more-actions' );

		var moreBtn = h1.querySelector( '.wk-h1-more > .wk-icon-more' );
		var menu = h1.querySelector( '.wk-h1-more .wk-h1-menu' );

		if ( moreBtn ) {
			moreBtn.setAttribute( 'title', moreTxt );
			moreBtn.setAttribute( 'data-tooltip', moreTxt );
			moreBtn.setAttribute( 'aria-label', moreTxt );
		}

		if ( moreBtn && menu ) {
			if ( !moreBtn.dataset.wkBound ) {
				moreBtn.dataset.wkBound = '1';

				moreBtn.addEventListener( 'click', function ( e ) {
					e.preventDefault();
					e.stopPropagation();

					var open = !menu.hasAttribute( 'hidden' );
					if ( open ) {
						menu.setAttribute( 'hidden', '' );
						moreBtn.setAttribute( 'aria-expanded', 'false' );
					} else {
						menu.removeAttribute( 'hidden' );
						moreBtn.setAttribute( 'aria-expanded', 'true' );
					}
				} );

				D.addEventListener( 'click', function ( e2 ) {
					if ( !h1.contains( e2.target ) ) {
						menu.setAttribute( 'hidden', '' );
						moreBtn.setAttribute( 'aria-expanded', 'false' );
					}
				} );
			}
		}

		var aDetail = h1.querySelector( '.wk-h1-menu__detail' );
		if ( aDetail ) {
			aDetail.textContent = detailTxt;
			aDetail.setAttribute( 'href', links.detailHref || '#' );
		}

		var aEdit = h1.querySelector( '.wk-h1-menu__edit' );
		if ( aEdit ) {
			aEdit.textContent = editTxt;
			aEdit.setAttribute( 'href', links.editHref || '#' );
		}

		var aCopy = h1.querySelector( '.wk-h1-menu__copy' );
		if ( aCopy ) {
			aCopy.textContent = copyTxt;
			aCopy.href = '#';

			if ( aCopy.dataset.wkBound !== '1' ) {
				aCopy.dataset.wkBound = '1';

				aCopy.addEventListener( 'click', function ( e ) {
					e.preventDefault();
					e.stopPropagation();

					wkReadingCloseH1Menu( h1 );

					var href = ( WK.WK_READING && WK.WK_READING.state && WK.WK_READING.state.h1Links )
						? ( WK.WK_READING.state.h1Links.detailHref || '' )
						: '';

					var abs = wkReadingGetAbsoluteUrl( href );
					if ( !abs ) return;

					if ( wkReadingCopyText( abs ) ) {
						try {
							if ( W.mw && typeof W.mw.notify === 'function' ) W.mw.notify( wkMsgD( 'wk-link-copied', 'Lien copié' ) );
						} catch ( e2 ) {}
					}
				} );
			}
		}
	}

	function prependH1( ui, chain ) {
		if ( !ui || !chain || !chain.length ) return;
		if ( !ui.panel || !ui.content ) return;

		var last = null;
		for ( var i = chain.length - 1; i >= 0; i-- ) {
			if ( chain[ i ] && chain[ i ].page ) { last = chain[ i ]; break; }
		}
		if ( !last || !last.title ) return;

		var existing = ui.panel.querySelector( '.wk-reading-h1' );
		if ( existing && existing.parentNode ) existing.parentNode.removeChild( existing );

		var wrap = D.createElement( 'div' );
		wrap.className = 'wk-reading-h1';

		var title = D.createElement( 'div' );
		title.className = 'wk-reading-h1__title wk-icon-before wk-icon-argument';
		title.textContent = last.title;

		wrap.appendChild( title );

		ui.panel.insertBefore( wrap, ui.content );

		updateH1Actions( ui );
	}

	function applyContentTypeClass( ui, chain ) {
		if ( !ui ) return;

		var panel = D.getElementById( UI_IDS.panelId );
		if ( !panel ) return;

		panel.classList.remove( 'is-pro', 'is-con' );

		if ( !chain || !chain.length ) return;

		for ( var i = chain.length - 1; i >= 0; i-- ) {
			var it = chain[ i ];
			if ( !it || !it.page ) continue;

			if ( it.type === 'contre' ) panel.classList.add( 'is-con' );
			else if ( it.type === 'pour' ) panel.classList.add( 'is-pro' );

			break;
		}
	}

	function getParseParams() {
		return { useskin: 'minerva' };
	}

	function closeUi() {
		var root = D.getElementById( UI_IDS.rootId );
		if ( root && root.parentNode ) root.parentNode.removeChild( root );
	}

	var adapter = {
		ensureUi: ensureUi,
		isClickInsideReading: isClickInsideReading,
		updateH1Actions: updateH1Actions,
		prependH1: prependH1,
		applyContentTypeClass: applyContentTypeClass,
		getParseParams: getParseParams,
		closeUi: closeUi
	};

	if ( typeof WK.wkReadingSetAdapter === 'function' ) {
		WK.wkReadingSetAdapter( adapter );
	} else {
		WK._wkReadingPendingAdapter = adapter;
	}
}() );
