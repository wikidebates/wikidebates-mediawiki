/*	Wikidébats — Minerva header buttons (NS0) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;
	var $D = $( D );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function wkMoveButtonsNS0_Minerva() {
		function renameButton( $content ) {
			var $span = $content.find( '#bouton-renommer' );
			if ( $span.length ) {
				$span.prepend( ' ' );
				$span.css( { display: 'inline-flex' } );
				$( '#firstHeading' ).append( $span );
			}
		}
		mw.hook( 'wikipage.content' ).add( renameButton );

		WK.wkWaitFor( function () {
			var bouton = D.getElementById( 'bouton-modifier-sujet' );
			var tagline = D.querySelector( '.pre-content.heading-holder .tagline' );
			return ( bouton && tagline ) ? { bouton: bouton, tagline: tagline } : null;
		}, function ( r ) {
			r.bouton.style.cssFloat = 'right';
			r.bouton.style.display = 'inline';
			r.tagline.appendChild( r.bouton );
		}, 4000 );

		( function () {
			var boutonId = 'bouton-modifier-categories';
			var catId = 'mw-normal-catlinks';

			function tryMoveButton() {
				var bouton = D.getElementById( boutonId );
				var categories = D.getElementById( catId );
				if ( !bouton || !categories ) return false;

				var ul = categories.querySelector( 'ul' );
				if ( !ul ) return false;

				var lastLi = ul.querySelector( 'li:last-child' );
				if ( !lastLi ) return false;

				if ( bouton.parentElement !== lastLi ) lastLi.appendChild( bouton );
				bouton.style.display = 'inline';
				return true;
			}

			tryMoveButton();
		} )();

		function moveInterlanguage() {
			var body = D.body;

			if ( body.classList.contains( 'ns-0' ) && body.classList.contains( 'is-authenticated' ) ) {
				var bouton = D.getElementById( 'bouton-modifier-interlangue' );
				if ( !bouton ) return;

				var lien = bouton.querySelector( 'a' );
				if ( lien && lien.href ) {
					var href = lien.getAttribute( 'href' );
					var ul = D.getElementById( 'p-tb' );

					if ( ul && ul.tagName === 'UL' ) {
						var li = D.createElement( 'li' );
						li.className = 'toggle-list-item';
						li.innerHTML =
							'<a class="toggle-list-item__anchor mw-ui-icon mw-ui-icon-before mw-ui-icon-wikimedia-language-base20" href="' + href + '">' +
								'<span class="toggle-list-item__icon">' +
									'<span class="toggle-list-item__label">Interlangue</span>' +
								'</span>' +
							'</a>';
						ul.appendChild( li );
					}
				}
				bouton.remove();
			}
		}
		mw.hook( 'wikipage.content' ).add( moveInterlanguage );

		function replaceEditIcon() {
			if ( !D.body.classList.contains( 'is-authenticated' ) ) return;
			var editLink = D.querySelector( '#p-tb li a.menu__item--page-actions-overflow-editfull' );
			if ( editLink ) {
				var icon = editLink.querySelector( '.minerva-icon' );
				if ( icon && icon.classList.contains( 'minerva-icon--edit' ) ) {
					icon.classList.remove( 'minerva-icon--edit' );
					icon.classList.add( 'minerva-icon--wikicode' );
				}
			}
		}
		mw.hook( 'wikipage.content' ).add( replaceEditIcon );

		WK.wkWaitFor( function () {
			var caEdit = D.querySelector( '#ca-edit' );
			if ( !caEdit ) return null;

			var boutonSujet = D.querySelector( '#bouton-modifier-sujet a' );
			if ( boutonSujet && boutonSujet.href ) return { caEdit: caEdit, href: boutonSujet.href, mode: 'sujet' };

			var boutonCats = D.querySelector( '#bouton-modifier-categories a' );
			if ( boutonCats && boutonCats.href ) return { caEdit: caEdit, href: boutonCats.href, mode: 'cats' };

			return null;
		}, function ( r ) {
			if ( r.mode === 'sujet' ) r.caEdit.href = r.href.replace( 'Sujet_de_d', 'D' );
			else r.caEdit.href = r.href.replace( "Rubriques_d%27a", 'A' );
		}, 4000 );
	}

	function init() {
		try {
			if ( mw && mw.config && mw.config.get( 'skin' ) !== 'minerva' ) return;
		} catch ( e ) {}

		try {
			if ( typeof WK.wkIsNs === 'function' && typeof WK.wkIsView === 'function' ) {
				if ( !WK.wkIsNs( 0 ) || !WK.wkIsView() ) return;
			}
		} catch ( e2 ) {}

		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:minerva:headerButtons' ) ) return;
		}

		try { wkMoveButtonsNS0_Minerva(); } catch ( e3 ) {}
	}

	try { init(); } catch ( e ) {}

}() );
