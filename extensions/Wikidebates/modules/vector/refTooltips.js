/*	Wikidébats — ref tooltips (Vector only)
	- Intercepte le clic sur les références pour afficher une bulle.
	- Patch défensif : éviter le throw de mw.eventLog.dispatch quand les stream configs sont désactivées
	  (sinon ext.cite.baseline peut casser le clic si on preventDefault).
*/
( function () {
	'use strict';

	var D = document;
	var W = window;
	var $ = jQuery;
	var $D = $( D );
	var $W = $( W );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function patchEventLogDispatch() {
		if ( !mw || !mw.eventLog || typeof mw.eventLog.dispatch !== 'function' ) return;
		if ( mw.eventLog.dispatch.__wkPatched ) return;

		var orig = mw.eventLog.dispatch;
		function wrappedDispatch() {
			try {
				return orig.apply( this, arguments );
			} catch ( e ) {
				var msg = ( e && ( e.message || e + '' ) ) || '';
				if ( /stream configs are disabled/i.test( msg ) ) return;
				throw e;
			}
		}
		wrappedDispatch.__wkPatched = true;
		mw.eventLog.dispatch = wrappedDispatch;
	}

	function wkRefTooltips() {
		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:vector:refTooltips' ) ) return;
		}

		patchEventLogDispatch();

		var $tooltip = null;
		var $content = null;
		var currentTrigger = null;

		function ensure() {
			if ( $tooltip ) return;

			$tooltip = $( '<div class="wk-ref-tooltip" role="dialog" aria-hidden="true"><div class="wk-ref-tooltip__content"></div></div>' )
				.appendTo( $( D.body ) )
				.hide();

			$tooltip.css( { position: 'absolute', top: -9999, left: -9999 } );
			$content = $tooltip.find( '.wk-ref-tooltip__content' );

			$tooltip.on( 'click', function ( e ) { e.stopPropagation(); } );
		}

		function getNoteHtmlFromLink( $a ) {
			var href = $a.attr( 'href' );
			if ( !href || href.charAt( 0 ) !== '#' ) return '';

			var id = href.slice( 1 );
			var $note = $( '#' + $.escapeSelector( id ) );
			if ( !$note.length ) return '';

			var $clone = $note.clone();
			$clone.find( '.mw-cite-backlink' ).remove();
			return $clone.html() || '';
		}

		function position( $trigger ) {
			if ( !$trigger || !$trigger.length ) return;

			var rect = $trigger[ 0 ].getBoundingClientRect();
			$tooltip.css( { top: -9999, left: -9999, right: '' } ).show();

			var tipW = $tooltip.outerWidth();
			var tipH = $tooltip.outerHeight();
			var scrollX = $W.scrollLeft();
			var scrollY = $W.scrollTop();
			var margin = 8;

			var top = rect.top + scrollY - tipH - margin;
			var below = false;
			if ( top < scrollY ) {
				top = rect.bottom + scrollY + margin;
				below = true;
			}

			var left = rect.left + scrollX + ( rect.width / 2 ) - ( tipW / 2 );
			var minLeft = scrollX + 4;
			var maxLeft = scrollX + $W.width() - tipW - 4;
			left = Math.max( minLeft, Math.min( maxLeft, left ) );

			$tooltip
				.toggleClass( 'wk-ref-tooltip--below', below )
				.css( { top: Math.round( top ), left: Math.round( left ) } );
		}

		function hideNow() {
			if ( !$tooltip ) return;
			$tooltip.hide().attr( 'aria-hidden', 'true' );
			$content.empty();
			currentTrigger = null;
			$W.off( 'scroll.wkRef resize.wkRef keydown.wkRef' );
			$( D.body ).off( 'click.wkRef' );
		}

		function showFor( $a ) {
			ensure();

			var html = getNoteHtmlFromLink( $a );
			if ( !html ) return false;

			$content.html( html );
			$tooltip.attr( 'aria-hidden', 'false' ).show();
			position( $a );

			currentTrigger = $a;

			$W.on( 'scroll.wkRef resize.wkRef', function () {
				if ( currentTrigger ) position( currentTrigger );
			} ).on( 'keydown.wkRef', function ( e ) {
				if ( e.key === 'Escape' || e.key === 'Esc' ) hideNow();
			} );

			$( D.body ).on( 'click.wkRef', function () { hideNow(); } );
			return true;
		}

		function toggleFor( $a ) {
			if ( currentTrigger && currentTrigger[ 0 ] === $a[ 0 ] ) {
				hideNow();
				return true;
			}
			return showFor( $a );
		}

		function onClick( e ) {
			var $a = $( this );
			var did = false;

			try { did = toggleFor( $a ); } catch ( ex ) { did = false; }
			if ( !did ) return;

			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		}

		$D.on( 'click.wkRef', 'sup.reference[id^="cite_ref"] > a, a[href^="#cite_note-"]', onClick );
		$D.on( 'keydown.wkRef', 'sup.reference[id^="cite_ref"] > a, a[href^="#cite_note-"]', function ( e ) {
			if ( e.key === 'Enter' || e.key === ' ' || e.code === 'Space' ) onClick.call( this, e );
		} );
	}

	WK.wkRefTooltips = wkRefTooltips;

	try { wkRefTooltips(); } catch ( e ) {}

}() );
