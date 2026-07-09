/*	Wikidébats — boot Minerva */
( function () {
	'use strict';

	var W = window;
	var D = document;
	var $ = jQuery;
	var $D = $( D );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	/*	Minerva uniquement */
	function isMinerva() {
		try {
			var skin = ( mw && mw.config ) ? mw.config.get( 'skin' ) : '';
			return ( skin === 'minerva' || skin === 'minervaneue' || skin === 'minervaNeue' );
		} catch ( e ) {}
		return false;
	}
	if ( !isMinerva() ) return;

	/*	Helpers */
	function once( key, fn ) {
		if ( !WK.wkOnce( key ) ) return;
		if ( fn ) fn();
	}

	function loadOnce( key, moduleName ) {
		if ( !WK.wkOnce( key ) ) return;
		try { mw.loader.load( moduleName ); } catch ( e ) {}
	}

	function idle( fn ) {
		return WK.wkIdle( fn );
	}

	function env() {
		if ( typeof WK.wkEnv === 'function' ) return WK.wkEnv();
		return {
			action: ( D.body && D.body.classList.contains( 'action-view' ) ) ? 'view' : '',
			isFormEdit: !!D.querySelector( '.mw-special-FormEdit, .mw-editable.action-formedit' )
		};
	}

	var msgD = WK.wkMsgD || function ( k, f ) { return f; };

	/*	Minerva : menu latéral */
	function initMenu_Minerva() {
		once( 'wk:minerva:menu', function () {
			once( 'wk:minerva:menu:dom', function () {

				var MENU_ITEMS = {
					about: {
						id: 'pt-about',
						label: msgD( 'wk-menu-about' ),
						url: msgD( 'wk-menu-about-url' ),
						cl: 'menu__item--pt-about'
					},
					contact: {
						id: 'pt-contact',
						label: msgD( 'wk-menu-contact' ),
						url: msgD( 'wk-menu-contact-url' ),
						cl: 'menu__item--pt-contact'
					},
					allDebates: {
						id: 'pt-debates',
						label: msgD( 'wk-menu-all-debates' ),
						url: '/wiki/' + encodeURIComponent( msgD( 'wk-menu-all-debates-page' ) ),
						cl: 'menu__item--pt-debates'
					},
					contribPortal: {
						id: 'pt-contributions',
						label: msgD( 'wk-menu-contributions-portal' ),
						url: msgD( 'wk-menu-contributions-url' ),
						cl: 'menu__item--pt-contributions'
					},
					bistro: {
						id: 'pt-bistro',
						label: msgD( 'wk-menu-bistro' ),
						url: msgD( 'wk-menu-bistro-url' ),
						cl: 'menu__item--pt-bistro'
					}
				};

				function addMenuItem( parentUl, itemId, linkText, url, extraClass, insertAtStart ) {
					if ( !parentUl || D.getElementById( itemId ) ) return null;

					var li = D.createElement( 'li' );
					li.className = 'toggle-list-item';
					li.id = itemId;

					var a = D.createElement( 'a' );
					a.className = 'toggle-list-item__anchor' + ( extraClass ? ( ' ' + extraClass ) : '' );
					a.href = url;
					a.setAttribute( 'data-mw', 'interface' );

					var label = D.createElement( 'span' );
					label.className = 'toggle-list-item__label';
					label.textContent = linkText;

					a.appendChild( label );
					li.appendChild( a );

					if ( insertAtStart && parentUl.firstChild ) parentUl.insertBefore( li, parentUl.firstChild );
					else parentUl.appendChild( li );

					return li;
				}

				function insertItems( parentUl, items, insertAtStart ) {
					if ( !parentUl || !items || !items.length ) return;
					items.forEach( function ( it ) {
						addMenuItem(
							parentUl,
							it.id,
							it.label,
							it.url,
							it.cl,
							!!insertAtStart
						);
					} );
				}

				function removeItem( root, selectorOrId ) {
					var el = selectorOrId.charAt( 0 ) === '#' ? D.getElementById( selectorOrId.slice( 1 ) ) : root.querySelector( selectorOrId );
					if ( !el ) return;
					var li = el.nodeName === 'LI' ? el : ( el.closest ? el.closest( 'li' ) : null );
					if ( li && li.parentNode ) li.parentNode.removeChild( li );
				}

				function insertAfterLi( refLi, li ) {
					if ( !refLi || !refLi.parentNode || !li ) return;
					if ( refLi.nextSibling ) refLi.parentNode.insertBefore( li, refLi.nextSibling );
					else refLi.parentNode.appendChild( li );
				}

				function ensureAboutContact() {
					if ( D.getElementById( 'pt-wikidebates' ) ) return;

					var menuLeft = D.getElementById( 'mw-mf-page-left' );
					if ( !menuLeft ) return;

					var anchor = D.getElementById( 'pt-preferences' ) ||
						D.getElementById( 'p-personal' ) ||
						D.getElementById( 'p-interaction' ) ||
						D.getElementById( 'p-navigation' );

					if ( !anchor ) {
						var allUls = menuLeft.querySelectorAll( 'ul' );
						if ( allUls.length ) anchor = allUls[ allUls.length - 1 ];
					}
					if ( !anchor || !anchor.parentNode ) return;

					var list = D.createElement( 'ul' );
					list.id = 'pt-wikidebates';
					list.className = 'toggle-list__list';
					anchor.parentNode.insertBefore( list, anchor.nextSibling );

					insertItems( list, [ MENU_ITEMS.about, MENU_ITEMS.contact ] );
				}

				function patchNavigation() {
					var navigationMenu = D.querySelector( 'ul#p-navigation' );
					if ( !navigationMenu ) return;

					var randomLink = navigationMenu.querySelector( 'a.menu__item--random' );
					if ( randomLink ) {
						randomLink.href = '/wiki/Special:RandomInCategory/' + encodeURIComponent( msgD( 'wk-menu-random-category', 'Débats' ) );
						var t = randomLink.querySelector( '.toggle-list-item__label' );
						if ( t ) t.textContent = msgD( 'wk-menu-random-debate' );
					}

					insertItems( navigationMenu, [ MENU_ITEMS.allDebates ] );
				}

				function patchInteraction() {
					if ( D.body && D.body.classList.contains( 'mw-mf-amc-disabled' ) ) return;

					var interactionMenu = D.querySelector( 'ul#p-interaction' );
					if ( !interactionMenu ) return;

					/*	Suppressions */
					removeItem( interactionMenu, 'a.menu__item--specialPages' );
					removeItem( interactionMenu, '#pt-bistro' );
					removeItem( interactionMenu, 'a.menu__item--speechBubbles' );	/*	bistro hérité */
					removeItem( interactionMenu, '#pt-contributions' );

					/*	Point d’ancrage : “Modifications récentes” */
					var rcA = interactionMenu.querySelector( 'a.menu__item--recentchanges' );
					var rcLi = rcA && rcA.closest ? rcA.closest( 'li' ) : null;
					if ( !rcLi ) return;

					/*	Insertions */
					var contrib = addMenuItem(
						interactionMenu,
						MENU_ITEMS.contribPortal.id,
						MENU_ITEMS.contribPortal.label,
						MENU_ITEMS.contribPortal.url,
						MENU_ITEMS.contribPortal.cl
					);

					if ( contrib ) insertAfterLi( rcLi, contrib );

					var bistro = addMenuItem(
						interactionMenu,
						MENU_ITEMS.bistro.id,
						MENU_ITEMS.bistro.label,
						MENU_ITEMS.bistro.url,
						MENU_ITEMS.bistro.cl
					);

					if ( bistro ) insertAfterLi( contrib || rcLi, bistro );
				}

				function patchChrome() {
					var hlist = D.querySelector( 'div#mw-mf-page-left > ul.hlist' );
					if ( hlist ) hlist.remove();
				}

				function applyMenuPatches() {
					patchNavigation();
					patchChrome();
					patchInteraction();
					ensureAboutContact();
				}

				WK.wkApplyMinervaMenuPatches = applyMenuPatches;
			} );
		} );
	}

	function reinitTooltips( root ) {
		idle( function () {
			try {
				if ( typeof WK.wkReinitSMWTooltips === 'function' ) WK.wkReinitSMWTooltips( root || D );
			} catch ( e ) {}
		} );
	}

	function preloadVE_Minerva() {
		once( 'wk:minerva:common:ve-preload', function () {
			var e = env();
			if ( e.action !== 'view' ) return;
			if ( !e.isFormEdit ) return;

			var hasVEField = !!D.querySelector(
				'#pfForm .ve-area-wrapper textarea.visualeditor,' +
				'form#pfForm .ve-area-wrapper textarea.visualeditor,' +
				'.ve-area-wrapper textarea.visualeditor'
			);
			if ( !hasVEField ) return;

			var modules = [
				'ext.visualEditor.targetLoader',
				'ext.visualEditor.core',
				'ext.visualEditor.core.mobile',
				'ext.visualEditor.mediawiki',
				'ext.visualEditor.mwcore',
				'ext.visualEditor.base',
				'ext.visualEditor.mobileArticleTarget'
			];

			var available = modules.filter( function ( m ) {
				return mw.loader.getState( m ) !== null;
			} );

			if ( available.length ) mw.loader.load( available );

			mw.loader.using( [ 'ext.visualEditor.core' ].concat( available ) ).then( function () {
				if ( W.ve && !ve.ui.MobileWindowManager && ve.ui.SurfaceWindowManager ) {
					ve.ui.MobileWindowManager = ve.ui.SurfaceWindowManager;
				}
			} );
		} );
	}

	function lazyMenu_Minerva() {
		once( 'wk:minerva:menu:lazy', function () {
			var btn = D.getElementById( 'mw-mf-main-menu-button' );
			if ( !btn ) return;

			var onOpen = function () {

				btn.removeEventListener( 'click', onOpen );

				var tries = 0;

				function whenMenuReady() {
					tries++;

					/*	Le panneau Minerva est créé après le clic */
					var menuLeft = D.getElementById( 'mw-mf-page-left' );
					var nav = menuLeft && menuLeft.querySelector( 'ul#p-navigation' );
					var inter = menuLeft && menuLeft.querySelector( 'ul#p-interaction' );
					if ( menuLeft && ( nav || inter ) ) {
						initMenu_Minerva();
						try { WK.wkApplyMinervaMenuPatches(); } catch ( e ) {}
						return;
					}

					/*	~ 10 frames max (≈ 160ms) */
					if ( tries < 10 ) W.requestAnimationFrame( whenMenuReady );
				}

				W.requestAnimationFrame( whenMenuReady );
			};

			btn.addEventListener( 'click', onOpen, { passive: true } );
		} );
	}

	function bootAfterI18n() {
		if ( typeof WK.wkOnce === 'function' && !WK.wkOnce( 'wk:minerva:booted' ) ) return;

		/*	Dispatcher commun */
		loadOnce( 'wk:minerva:load:scan', 'ext.wikidebates.features.scan' );

		/*	Minerva-only */
		lazyMenu_Minerva();

		/*	SMW tooltips */
		reinitTooltips( D );
		once( 'wk:minerva:hook:tooltips', function () {
			mw.hook( 'wikipage.content' ).add( function ( $content ) {
				reinitTooltips( $content || $D );
			} );
		} );

		/*	Préchargement VE mobile */
		preloadVE_Minerva();

		/*	Header buttons Minerva (si ns0 view) */
		try {
			if ( WK.wkIsNs && WK.wkIsView && WK.wkIsNs( 0 ) && WK.wkIsView() ) {
				loadOnce( 'wk:minerva:load:headerButtons', 'ext.wikidebates.minerva.headerButtons' );
			}
		} catch ( e ) {}
	}

	function boot() {
		if ( typeof WK.wkOnce === 'function' && !WK.wkOnce( 'wk:minerva:boot:init' ) ) return;

		function run() {
			try { bootAfterI18n(); } catch ( e ) { console.error( 'WK Minerva boot failed', e ); }
		}

		/*	Non bloquant : run immédiat + rerun après i18n */
		run();

		if ( typeof WK.wkLoadI18n === 'function' ) {
			try {
				$.when( WK.wkLoadI18n() ).always( function () {
					run();
				} );
			} catch ( e2 ) {}
		}
	}

	if ( D.readyState === 'loading' ) D.addEventListener( 'DOMContentLoaded', boot, { once: true } );
	else boot();

}() );
