/*	Wikidébats — i18n wiki-only (MW 1.43) */
( function () {
	'use strict';

	var W = window;
	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function wkLoadI18n() {
		var lang = ( mw.config.get( 'wgUserLanguage' ) || '' ).toLowerCase();

		if ( !lang ) {
			return Promise.reject( new Error( 'wk:i18n:no-lang' ) );
		}

		//	Charge dynamiquement le module correspondant
		return mw.loader.using( 'ext.wikidebates.i18n.' + lang );
	}

	function wkMsg( key /*, ...params */ ) {
		var params = Array.prototype.slice.call( arguments, 1 );

		try {
			if ( mw && mw.message && mw.message( key ).exists() ) {
				return mw.msg.apply( mw, [ key ].concat( params ) );
			}
		} catch ( e ) {}

		return key;
	}

	function wkMsgD( key, def /*, ...params */ ) {
		var params = Array.prototype.slice.call( arguments, 2 );
		var v = wkMsg.apply( null, [ key ].concat( params ) );
		return ( v === key ) ? def : v;
	}

	function wkTpl( key, def /*, ...params */ ) {
		var params = Array.prototype.slice.call( arguments, 2 );
		return wkMsgD.apply( null, [ key, def ].concat( params ) );
	}

	function wkParam( key, def ) {
		return wkMsgD( key, def );
	}

	function wkForm( key, def ) {
		return wkMsgD( key, def );
	}

	var wkMsgFastCache = Object.create( null );

	function wkHasCache( obj, k ) {
		return Object.prototype.hasOwnProperty.call( obj, k );
	}

	function wkParamFast( key, def ) {
		var k = 'p|' + key + '|' + def;
		if ( wkHasCache( wkMsgFastCache, k ) ) return wkMsgFastCache[ k ];
		wkMsgFastCache[ k ] = wkParam( key, def );
		return wkMsgFastCache[ k ];
	}

	function wkTplFast( key, def ) {
		var k = 't|' + key + '|' + def;
		if ( wkHasCache( wkMsgFastCache, k ) ) return wkMsgFastCache[ k ];
		wkMsgFastCache[ k ] = wkTpl( key, def );
		return wkMsgFastCache[ k ];
	}

	function wkFormFast( key, def ) {
		var k = 'f|' + key + '|' + def;
		if ( wkHasCache( wkMsgFastCache, k ) ) return wkMsgFastCache[ k ];
		wkMsgFastCache[ k ] = wkForm( key, def );
		return wkMsgFastCache[ k ];
	}

	var WK_P = { page: null };
	var WK_T = { more: null, latest: null, hoverWP: null };

	function wkWarmI18nCaches() {
		if ( WK_P.page !== null ) return;

		WK_P.page = wkParamFast( 'wk-param-page' );
		WK_T.more = wkTplFast( 'wk-tpl-more-content' );
		WK_T.hoverWP = wkTplFast( 'wk-tpl-hover-wikipedia' );
		WK_T.latest = wkTplFast( 'wk-tpl-latest-changes' );
	}

	WK.wkLoadI18n = wkLoadI18n;

	WK.wkMsg = wkMsg;
	WK.wkMsgD = wkMsgD;
	WK.wkTpl = wkTpl;
	WK.wkParam = wkParam;
	WK.wkForm = wkForm;

	WK.wkParamFast = wkParamFast;
	WK.wkTplFast = wkTplFast;
	WK.wkFormFast = wkFormFast;

	WK.WK_P = WK_P;
	WK.WK_T = WK_T;
	WK.wkWarmI18nCaches = wkWarmI18nCaches;

	/*	Alias legacy */
	W.wkLoadI18n = wkLoadI18n;
	W.wkMsg = wkMsg;
	W.wkMsgD = wkMsgD;
	W.wkTpl = wkTpl;
	W.wkParam = wkParam;
	W.wkForm = wkForm;
	W.wkParamFast = wkParamFast;
	W.wkTplFast = wkTplFast;
	W.wkFormFast = wkFormFast;
	W.wkWarmI18nCaches = wkWarmI18nCaches;

}() );
