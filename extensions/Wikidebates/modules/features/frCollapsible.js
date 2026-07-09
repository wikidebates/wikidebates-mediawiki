/*	Wikidébats — fr-collapsible (commun) */
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function bindFrCollapsible( $root ) {
		$root.find( '.fr-collapsible' ).each( function () {
			var $box = $( this );
			if ( $box.data( 'fr-collapsible-bound' ) ) return;
			$box.data( 'fr-collapsible-bound', true );

			var $toggle = $box.children( '.fr-collapsible-toggle' ).first();
			var $content = $box.children( '.fr-collapsible-content' ).first();
			if ( !$toggle.length || !$content.length ) return;

			$toggle.attr( { role: 'button', tabindex: 0 } );
			$content.removeAttr( 'hidden' )[ 0 ].style.display = 'block';

			var reduce = W.matchMedia && W.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

			function openPanel( instant ) {
				$box.removeClass( 'fr-collapsed' ).addClass( 'fr-expanded' );
				$toggle.attr( 'aria-expanded', 'true' )
					.removeClass( 'fr-collapsible-toggle-collapsed' )
					.addClass( 'fr-collapsible-toggle-expanded' );
				$content.attr( 'aria-hidden', 'false' );

				if ( instant || reduce ) {
					$content.stop( true, true );
					$content[ 0 ].style.transition = 'none';
					$content[ 0 ].style.height = 'auto';
					$content[ 0 ].style.opacity = '1';
					void $content[ 0 ].offsetHeight;
					$content[ 0 ].style.transition = '';
					return;
				}

				$content.stop( true, true );
				$content[ 0 ].style.display = 'block';
				$content[ 0 ].style.height = '0px';
				$content[ 0 ].style.opacity = '0';

				requestAnimationFrame( function () {
					var h = $content[ 0 ].scrollHeight;
					$content[ 0 ].style.height = h + 'px';
					$content[ 0 ].style.opacity = '1';
				} );

				$content.one( 'transitionend', function ( e ) {
					if ( e.target !== $content[ 0 ] ) return;
					$content[ 0 ].style.height = 'auto';
				} );
			}

			function closePanel( instant ) {
				$box.removeClass( 'fr-expanded' ).addClass( 'fr-collapsed' );
				$toggle.attr( 'aria-expanded', 'false' )
					.removeClass( 'fr-collapsible-toggle-expanded' )
					.addClass( 'fr-collapsible-toggle-collapsed' );
				$content.attr( 'aria-hidden', 'true' );

				if ( instant || reduce ) {
					$content.stop( true, true );
					$content[ 0 ].style.transition = 'none';
					$content[ 0 ].style.height = '0px';
					$content[ 0 ].style.opacity = '0';
					void $content[ 0 ].offsetHeight;
					$content[ 0 ].style.transition = '';
					return;
				}

				$content.stop( true, true );
				$content[ 0 ].style.display = 'block';
				$content[ 0 ].style.height = $content[ 0 ].scrollHeight + 'px';
				$content[ 0 ].style.opacity = '1';

				requestAnimationFrame( function () {
					$content[ 0 ].style.height = '0px';
					$content[ 0 ].style.opacity = '0';
				} );
			}

			function setState( expanded, instant ) {
				if ( expanded ) openPanel( instant );
				else closePanel( instant );
			}

			$toggle.on( 'click', function ( e ) {
				if ( $( e.target ).closest( 'a,button,input,select,textarea,label' ).length ) return;
				e.preventDefault();
				setState( $box.hasClass( 'fr-collapsed' ), false );
			} );

			$toggle.on( 'keydown', function ( e ) {
				if ( e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32 ) {
					e.preventDefault();
					setState( $box.hasClass( 'fr-collapsed' ), false );
				}
			} );

			setState( !$box.hasClass( 'fr-collapsed' ), true );
		} );
	}

	function init( root ) {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:frCollapsible:init' ) ) {
				/*	Déjà initialisé : mais on (re)scan le root courant */
				try { bindFrCollapsible( $( root || D ) ); } catch ( e0 ) {}
				return;
			}
		}
		try { bindFrCollapsible( $( root || D ) ); } catch ( e ) {}
		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			var el = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			try { bindFrCollapsible( $( el ) ); } catch ( e2 ) {}
		} );
	}

	WK.bindFrCollapsible = bindFrCollapsible;

	init( D );

}() );
