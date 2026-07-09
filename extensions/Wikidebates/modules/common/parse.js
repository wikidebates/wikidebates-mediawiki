/*	Wikidébats — parse pool commun (MW 1.43) */
( function () {
	'use strict';

	var W = window;
	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	var wkApi = null;

	var WK_PARSE_CONCURRENCY = 2;

	var WK_PARSE_CACHE_MAX = {
		bc: 80,
		arg: 160,
		hover: 120,
		latest: 10,
		more: 10,
		def: 80
	};

	var wkParseCacheBC = new Map();
	var wkParseCacheArg = new Map();
	var wkParseCacheHover = new Map();
	var wkParseCacheLatest = new Map();
	var wkParseCacheMore = new Map();
	var wkParseCacheDef = new Map();

	var wkParseInFlight = new Map();
	var wkParseQueue = [];
	var wkParseActive = 0;

	var WK_PARSE_FAIL_TTL_MS = 15000;
	var wkParseFailUntil = new Map();

	var WK_PARSE_PRIORITY = {
		hover: 0,
		bc: 1,
		latest: 2,
		more: 2,
		arg: 3,
		def: 4
	};

	function wkGetApi() {
		if ( wkApi ) return wkApi;
		wkApi = new mw.Api();
		return wkApi;
	}

	function wkGetBucketCache( bucket ) {
		if ( bucket === 'bc' ) return wkParseCacheBC;
		if ( bucket === 'arg' ) return wkParseCacheArg;
		if ( bucket === 'hover' ) return wkParseCacheHover;
		if ( bucket === 'latest' ) return wkParseCacheLatest;
		if ( bucket === 'more' ) return wkParseCacheMore;
		return wkParseCacheDef;
	}

	function wkCacheGetLRU( cache, key ) {
		if ( !cache || !cache.has || !cache.size ) return null;
		if ( !cache.has( key ) ) return null;

		var v = cache.get( key );
		cache.delete( key );
		cache.set( key, v );

		return v;
	}

	function wkCacheSetLRU( cache, max, key, value ) {
		if ( !cache || typeof max !== 'number' || max <= 0 ) return;

		if ( cache.has( key ) ) cache.delete( key );
		cache.set( key, value );

		while ( cache.size > max ) {
			var firstKey = cache.keys().next().value;
			if ( typeof firstKey === 'undefined' ) break;
			cache.delete( firstKey );
		}
	}

	function wkFailIsHot( bucket, keyLocal ) {
		var k = bucket + '|' + keyLocal;
		var until = wkParseFailUntil.get( k ) || 0;

		if ( until > Date.now() ) return true;
		if ( until ) wkParseFailUntil.delete( k );

		return false;
	}

	function wkFailTouch( bucket, keyLocal ) {
		var k = bucket + '|' + keyLocal;
		wkParseFailUntil.set( k, Date.now() + WK_PARSE_FAIL_TTL_MS );
	}

	function wkParseCancel( bucket, wikitext ) {
		var keyLocal = String( wikitext || '' );
		var inFlightKey = String( bucket || 'def' ) + '|' + keyLocal;

		for ( var i = wkParseQueue.length - 1; i >= 0; i-- ) {
			if ( wkParseQueue[ i ] && wkParseQueue[ i ].inFlightKey === inFlightKey ) {
				var job = wkParseQueue.splice( i, 1 )[ 0 ];

				if ( wkParseInFlight.has( inFlightKey ) ) wkParseInFlight.delete( inFlightKey );

				try { job.reject( new Error( 'wkParse:cancelled' ) ); } catch ( e ) {}
				break;
			}
		}
	}

	function wkParseWikitext( wikitext, bucket ) {
		bucket = bucket || 'def';

		var cache = wkGetBucketCache( bucket );
		var keyLocal = String( wikitext || '' );
		var inFlightKey = bucket + '|' + keyLocal;

		var cached = wkCacheGetLRU( cache, keyLocal );
		if ( cached !== null ) return Promise.resolve( cached );

		if ( wkFailIsHot( bucket, keyLocal ) ) return Promise.reject( new Error( 'wkParse:fail-cached' ) );

		if ( wkParseInFlight.has( inFlightKey ) ) return wkParseInFlight.get( inFlightKey );

		var p = new Promise( function ( resolve, reject ) {
			wkParseQueue.push( {
				inFlightKey: inFlightKey,
				keyLocal: keyLocal,
				bucket: bucket,
				wikitext: wikitext,
				resolve: resolve,
				reject: reject
			} );
			wkParsePump();
		} );

		wkParseInFlight.set( inFlightKey, p );

		p.finally( function () {
			wkParseInFlight.delete( inFlightKey );
		} );

		return p;
	}

	function wkParseQueuePickNext() {
		if ( !wkParseQueue.length ) return null;

		var bestIdx = -1;
		var bestPri = 999;

		for ( var i = 0; i < wkParseQueue.length; i++ ) {
			var job = wkParseQueue[ i ];
			if ( !job ) continue;

			var b = job.bucket || 'def';
			var pri = ( typeof WK_PARSE_PRIORITY[ b ] === 'number' ) ? WK_PARSE_PRIORITY[ b ] : WK_PARSE_PRIORITY.def;

			if ( pri < bestPri ) {
				bestPri = pri;
				bestIdx = i;
				if ( bestPri === 0 ) break;
			}
		}

		if ( bestIdx < 0 ) return null;

		return wkParseQueue.splice( bestIdx, 1 )[ 0 ];
	}

	function wkParsePump() {
		while ( wkParseActive < WK_PARSE_CONCURRENCY && wkParseQueue.length ) {
			var job = wkParseQueuePickNext();
			if ( !job ) return;

			wkParseActive++;

			( function ( job2 ) {
				wkGetApi().post( {
					action: 'parse',
					contentmodel: 'wikitext',
					text: job2.wikitext,
					formatversion: 2,
					usearticle: 1,
					redirects: 1,
					useskin: 'vector',
					uselang: mw.config.get( 'wgUserLanguage' )
				} ).done( function ( data ) {

					var html = data && data.parse && data.parse.text
						? ( typeof data.parse.text === 'string' ? data.parse.text : ( data.parse.text[ '*' ] || '' ) )
						: '';

					if ( html ) html = html.replace( /<!--[\S\s]*?-->/gm, '' );

					var cache2 = wkGetBucketCache( job2.bucket );
					var max = WK_PARSE_CACHE_MAX[ job2.bucket ];
					if ( typeof max !== 'number' ) max = WK_PARSE_CACHE_MAX.def;

					wkCacheSetLRU( cache2, max, job2.keyLocal, html );

					job2.resolve( html );

				} ).fail( function ( err ) {

					wkFailTouch( job2.bucket, job2.keyLocal );
					job2.reject( err );

				} ).always( function () {

					wkParseActive--;
					wkParsePump();

				} );
			} )( job );
		}
	}

	WK.wkGetApi = wkGetApi;
	WK.wkParseWikitext = wkParseWikitext;
	WK.wkParseCancel = wkParseCancel;

	/*	Alias legacy */
	W.wkGetApi = wkGetApi;
	W.wkParseWikitext = wkParseWikitext;
	W.wkParseCancel = wkParseCancel;

}() );
