/*	Wikidébats — more (commun) */
( function () {
	'use strict';

	var D = document;
	var $D = jQuery( D );
	var W = window;
	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	var WK_OPEN = '{{';
	var WK_CLOSE = '}}';
	var WK_SEP = '|';

	function moreContentCall() {
		if ( !WK.wkOnce( 'wkMoreInit' ) ) return;

		$D.on( 'click.wkMore', '.more-content-button', function () {
			jQuery( this ).hide();

			WK.wkWarmI18nCaches();

			var ds = this.dataset || null;
			var page = ds && ds.page ? ds.page : jQuery( this ).data( 'page' );

			var $wrapper = jQuery( this ).parent().find( '.more-content-wrapper' );
			var query = WK_OPEN + WK.WK_T.more + WK_SEP + WK.WK_P.page + ' = ' + page + WK_CLOSE;

			WK.wkParseWikitext( query, 'more' ).then( function ( html ) {
				WK.wkReplaceHtml( $wrapper, '<div class="more-content-wrapper"><div class="more-content-drop show"></div>' + html + '</div>' );
			} ).catch( function () {} );
		} );
	}

	WK.moreContentCall = moreContentCall;

	try { moreContentCall(); } catch ( e ) {}

}() );
