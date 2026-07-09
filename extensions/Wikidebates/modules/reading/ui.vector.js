/*	Wikidébats — reading ui (Vector) */
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
		closeId: 'wk-reading-close'
	};

	function wkMsgD( key, fallback ) {
		try {
			if ( typeof WK.wkMsgD === 'function' ) return WK.wkMsgD( key, fallback );
			if ( typeof WK.wkMsg === 'function' ) return WK.wkMsg( key ) || fallback || key;
		} catch ( e ) {}
		return fallback || key;
	}

	function wkReadingGetVectorPinnedContainer() {
		var el = D.querySelector( '.vector-sticky-pinned-container' );
		if ( el ) return el;

		el = D.querySelector( '.vector-column-start .vector-pinnable-element' );
		if ( el ) return el;

		el = D.querySelector( '#mw-panel' );
		if ( el ) return el;

		return null;
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

	function wkReadingGetVectorTopContainer() {
		return D.querySelector( '.mw-page-container' ) || D.body;
	}

	function ensureUi() {
		var body = D.querySelector( '#bodyContent' );
		if ( !body ) return null;

		var root = D.getElementById( UI_IDS.rootId );
		if ( root ) {
			return {
				root: root,
				panel: D.getElementById( UI_IDS.panelId ),
				left: D.getElementById( UI_IDS.leftId ),
				stack: D.getElementById( UI_IDS.stackId ),
				siblings: D.getElementById( UI_IDS.siblingsId ),
				content: D.getElementById( UI_IDS.contentId )
			};
		}

		root = D.createElement( 'div' );
		root.id = UI_IDS.rootId;

		var panel = D.createElement( 'div' );
		panel.className = 'wk-reading-panel';
		panel.id = UI_IDS.panelId;

		var close = D.createElement( 'button' );
		close.id = UI_IDS.closeId;
		close.className = 'wk-reading-close';
		close.type = 'button';
		close.setAttribute( 'aria-label', wkMsgD( 'wk-reading-close' ) );
		close.setAttribute( 'title', wkMsgD( 'wk-reading-close' ) );
		close.innerHTML =
			'<svg viewBox="6 6 12 12" aria-hidden="true" focusable="false">' +
				'<path d="M6 6 L18 18 M18 6 L6 18" />' +
			'</svg>';

		var stack = D.createElement( 'div' );
		stack.id = UI_IDS.stackId;

		var siblings = D.createElement( 'div' );
		siblings.id = UI_IDS.siblingsId;
		siblings.className = 'wk-reading-siblings';
		siblings.setAttribute( 'aria-label', wkMsgD( 'wk-reading-siblings-aria-label' ) );

		var content = D.createElement( 'div' );
		content.id = UI_IDS.contentId;
		content.className = 'mw-parser-output';

		var left = D.createElement( 'div' );
		left.className = 'wk-reading-left';
		left.id = UI_IDS.leftId;

		left.appendChild( stack );
		left.appendChild( siblings );

		var pinned = wkReadingGetVectorPinnedContainer();
		if ( pinned ) {
			pinned.appendChild( left );
			D.documentElement.classList.add( 'wk-reading-left-in-vector' );
		} else {
			panel.appendChild( left );
		}

		panel.appendChild( content );
		wkReadingGetVectorTopContainer().appendChild( close );
		root.appendChild( panel );

		body.insertBefore( root, body.firstChild );

		close.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			if ( typeof WK.wkCloseReadingMode === 'function' ) WK.wkCloseReadingMode();
		} );

		wkReadingBindOutsideClickClose();

		return { root: root, panel: panel, left: left, stack: stack, siblings: siblings, content: content };
	}

	function isClickInsideReading( target ) {
		if ( !target ) return false;

		var root = D.getElementById( UI_IDS.rootId );
		if ( root && root.contains( target ) ) return true;

		var close = D.getElementById( UI_IDS.closeId );
		if ( close && close.contains( target ) ) return true;

		var left = D.getElementById( UI_IDS.leftId );
		if ( left && left.contains( target ) ) return true;

		return false;
	}

	function wkReadingBindOutsideClickClose() {
		if ( typeof WK.wkOnce !== 'function' ) return;
		if ( !WK.wkOnce( 'wk:reading:vector:outside-close' ) ) return;

		D.addEventListener( 'click', function ( e ) {
			if ( !D.documentElement.classList.contains( 'wk-reading-active' ) ) return;

			var t = e.target;

			//	Inside = root OU left (car left peut être déplacé dans le pinned container) OU close
			var root = D.getElementById( UI_IDS.rootId );
			var left = D.getElementById( UI_IDS.leftId );
			var close = D.getElementById( UI_IDS.closeId );

			var inside = false;
			if ( root && root.contains( t ) ) inside = true;
			else if ( left && left.contains( t ) ) inside = true;
			else if ( close && close.contains( t ) ) inside = true;

			if ( inside ) return;

			//	1er clic = ferme (et évite de cliquer “à travers” sur un lien dessous)
			var tag = (t && t.tagName) ? t.tagName.toLowerCase() : '';
			var interactive = !!(t && (t.closest && t.closest('a,button,input,select,textarea,label')));

			if (interactive || tag === 'a' || tag === 'button') {
			  e.preventDefault();
			  e.stopPropagation();
			} else {
			  // on évite juste de remonter, mais on laisse l'UI Vector réagir si besoin
			  e.stopPropagation();
			}

			if ( typeof WK.wkCloseReadingMode === 'function' ) WK.wkCloseReadingMode();
		}, true ); // capture = bloque avant navigation
	}

	function ensureH1Dom( ui ) {
		if ( !ui || !ui.panel ) return null;

		var h1 = ui.panel.querySelector( '.wk-reading-h1' );
		if ( !h1 ) return null;

		var actions = h1.querySelector( '.wk-reading-h1__actions' );
		if ( !actions ) {
			actions = D.createElement( 'div' );
			actions.className = 'wk-reading-h1__actions';
			h1.appendChild( actions );
		}

		if ( !actions.querySelector( '.wk-h1-btn.bouton-modifier' ) ) {
			var editWrap = D.createElement( 'div' );
			editWrap.className = 'wk-h1-btn bouton-modifier';

			var editLink = D.createElement( 'a' );
			editWrap.appendChild( editLink );

			actions.appendChild( editWrap );
		}

		if ( !actions.querySelector( '.wk-h1-more' ) ) {
			var moreWrap = D.createElement( 'div' );
			moreWrap.className = 'wk-h1-more';

			moreWrap.innerHTML =
				'<div class="wk-h1-btn wk-icon-before wk-icon-more" aria-haspopup="true" aria-expanded="false"></div>' +
				'<div class="wk-h1-menu" hidden>' +
					'<a class="wk-h1-menu__detail wk-icon-before wk-icon-page" href="#"></a>' +
					'<a class="wk-h1-menu__copy wk-icon-before wk-icon-link" href="#"></a>' +
				'</div>';

			actions.appendChild( moreWrap );
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

		var editA = h1.querySelector( '.wk-h1-btn.bouton-modifier a' );
		if ( editA ) {
			editA.setAttribute( 'href', links.editHref || '#' );
			editA.setAttribute( 'title', editTxt );
			editA.setAttribute( 'data-tooltip', editTxt );
			editA.setAttribute( 'aria-label', editTxt );
		}

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

				if (typeof WK.wkOnce === 'function' && WK.wkOnce('wk:reading:h1:docclose')) {
				  D.addEventListener('click', function (e2) {
					// fermer tous les menus ouverts (simple & robuste)
					var menus = D.querySelectorAll('.wk-reading-h1 .wk-h1-menu');
					for (var i = 0; i < menus.length; i++) menus[i].setAttribute('hidden', '');

					var btns = D.querySelectorAll('.wk-reading-h1 .wk-h1-more > .wk-icon-more');
					for (var j = 0; j < btns.length; j++) btns[j].setAttribute('aria-expanded', 'false');
				  }, true);
				}
			}
		}

		var aDetail = h1.querySelector( '.wk-h1-menu__detail' );
		if ( aDetail ) {
			aDetail.textContent = detailTxt;
			aDetail.setAttribute( 'href', links.detailHref || '#' );
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
							if ( W.mw && typeof W.mw.notify === 'function' ) {
								W.mw.notify( wkMsgD( 'wk-link-copied' ) );
							}
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
		return { useskin: 'vector' };
	}

	function closeUi() {
		var root = D.getElementById( UI_IDS.rootId );

		var close = D.getElementById( UI_IDS.closeId );
		if ( close && close.parentNode ) close.parentNode.removeChild( close );

		var left = D.getElementById( UI_IDS.leftId );
		if ( left && left.parentNode ) left.parentNode.removeChild( left );

		D.documentElement.classList.remove( 'wk-reading-left-in-vector' );

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
