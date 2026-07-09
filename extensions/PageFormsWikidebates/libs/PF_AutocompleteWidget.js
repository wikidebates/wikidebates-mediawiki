/**
 * An OOUI-based widget for an autocompleting text input that uses the
 * Page Forms 'pfautocomplete' API.
 *
 * For namespace-based title lookup, prefer MediaWiki's native prefixsearch
 * API so that performance stays closer to core title widgets on large wikis.
 *
 * @class
 * @extends OO.ui.TextInputWidget
 *
 * @constructor
 * @param {Object} config Configuration options
 * @author Yaron Koren
 * @author Sahaj Khandelwal
 * @author Yash Varshney
 */

pf.AutocompleteWidget = function( config ) {
	config = config || {};

	const textInputConfig = {
		name: config.name || 'page_name',
		classes: config.classes,
		autocomplete: false
	};
	if ( config.value !== undefined ) {
		textInputConfig.value = config.value;
	}
	if ( config.placeholder !== undefined ) {
		textInputConfig.placeholder = config.placeholder;
	}
	if ( config.autofocus !== undefined ) {
		textInputConfig.autofocus = config.autofocus;
	}
	if ( config.autocapitalize !== undefined ) {
		textInputConfig.autocapitalize = config.autocapitalize;
	}

	OO.ui.TextInputWidget.call( this, textInputConfig );
	if ( config.autocompletedatatype !== undefined ) {
		OO.ui.mixin.LookupElement.call( this, {
			highlightFirst: false
		} );
	}

	this.config = config;
	this.maxSuggestions = parseInt( config.maxSuggestions, 10 ) || 10;
	this.minLookupLength = parseInt( config.minLookupLength, 10 );
	if ( Number.isNaN( this.minLookupLength ) ) {
		if ( this.config.autocompletedatatype === 'namespace' || this.config.autocompletedatatype === 'category' || this.config.autocompletedatatype === 'cargo field' || this.config.autocompletedatatype === 'property' || this.config.autocompletedatatype === 'concept' ) {
			this.minLookupLength = 2;
		} else {
			this.minLookupLength = 1;
		}
	}

	if ( config.size !== undefined && config.size !== '' ) {
		this.$input.attr( 'size', config.size );
		this.$element.attr( 'data-size-ch', config.size );
		this.$element.addClass( 'pf-has-size' );
	}

	this.dataCache = {};
	this.requestCache = new Map();
	this.pendingRequest = null;
	this.pendingRequestKey = null;
};

OO.inheritClass( pf.AutocompleteWidget, OO.ui.TextInputWidget );
OO.mixinClass( pf.AutocompleteWidget, OO.ui.mixin.LookupElement );

// Compatibilité défensive : certains environnements perdent les statiques
// héritées de OO.ui.TextInputWidget, dont validationPatterns.
pf.AutocompleteWidget.static = Object.assign(
	{},
	OO.ui.TextInputWidget.static || {},
	pf.AutocompleteWidget.static || {}
);

if (
	!pf.AutocompleteWidget.static.validationPatterns &&
	OO.ui.TextInputWidget.static &&
	OO.ui.TextInputWidget.static.validationPatterns
) {
	pf.AutocompleteWidget.static.validationPatterns =
		OO.ui.TextInputWidget.static.validationPatterns;
}

pf.AutocompleteWidget.static.cacheSize = 128;
pf.AutocompleteWidget.static.requestDelay = 180;

pf.AutocompleteWidget.prototype.normalizeValue = function( value ) {
	if ( value === null || value === undefined ) {
		return '';
	}
	return String( value ).trim();
};

pf.AutocompleteWidget.prototype.getNamespaceId = function( namespaceName ) {
	const trimmedName = this.normalizeValue( namespaceName );
	const namespaceIds = mw.config.get( 'wgNamespaceIds' ) || {};

	if ( trimmedName === '' || trimmedName.toLowerCase() === 'main' ) {
		return 0;
	}
	if ( Object.prototype.hasOwnProperty.call( namespaceIds, trimmedName.toLowerCase() ) ) {
		return namespaceIds[ trimmedName.toLowerCase() ];
	}
	return null;
};

pf.AutocompleteWidget.prototype.buildRequestParams = function( value ) {
	const requestValue = this.normalizeValue( value );
	const requestParams = {
		format: 'json'
	};
	let tableAndField;

	if ( this.config.autocompletedatatype === 'namespace' ) {
		requestParams.action = 'query';
		requestParams.list = 'prefixsearch';
		requestParams.pssearch = requestValue;
		requestParams.pslimit = this.maxSuggestions;

		const namespaceId = this.getNamespaceId( this.config.autocompletesettings );
		if ( namespaceId !== null ) {
			requestParams.psnamespace = namespaceId;
		}
		return requestParams;
	}

	requestParams.action = 'pfautocomplete';
	requestParams.substr = requestValue;
	requestParams.limit = this.maxSuggestions;

	if ( this.config.autocompletedatatype === 'category' ) {
		requestParams.category = this.config.autocompletesettings;
	} else if ( this.config.autocompletedatatype === 'cargo field' ) {
		tableAndField = ( this.config.autocompletesettings || '' ).split( '|' );
		requestParams.cargo_table = tableAndField[ 0 ];
		requestParams.cargo_field = tableAndField[ 1 ];
		if ( tableAndField.length > 2 ) {
			requestParams.cargo_where = tableAndField.slice( 2 ).join( '|' );
		}
	} else if ( this.config.autocompletedatatype === 'property' ) {
		requestParams.property = this.config.autocompletesettings;
	} else if ( this.config.autocompletedatatype === 'concept' ) {
		requestParams.concept = this.config.autocompletesettings;
	} else if ( this.config.autocompletedatatype === 'semantic_query' ) {
		requestParams.semantic_query = this.config.autocompletesettings;
	} else if ( this.config.autocompletedatatype === 'wikidata' ) {
		requestParams.wikidata = this.config.autocompletesettings;
	} else if ( this.config.autocompletedatatype === 'external_url' ) {
		requestParams.external_url = this.config.autocompletesettings;
	}

	return requestParams;
};

pf.AutocompleteWidget.prototype.getRequestCacheKey = function( requestParams ) {
	return JSON.stringify( requestParams );
};

pf.AutocompleteWidget.prototype.rememberRequest = function( cacheKey, value ) {
	if ( this.requestCache.has( cacheKey ) ) {
		this.requestCache.delete( cacheKey );
	}
	this.requestCache.set( cacheKey, value );
	if ( this.requestCache.size > pf.AutocompleteWidget.static.cacheSize ) {
		const oldestKey = this.requestCache.keys().next().value;
		this.requestCache.delete( oldestKey );
	}
	return value;
};

pf.AutocompleteWidget.prototype.abortPendingRequest = function( nextCacheKey ) {
	if (
		this.pendingRequest &&
		typeof this.pendingRequest.abort === 'function' &&
		this.pendingRequestKey !== nextCacheKey
	) {
		this.pendingRequest.abort();
	}
};

pf.AutocompleteWidget.prototype.getEmptyLookupResult = function() {
	if ( this.config.autocompletedatatype === 'namespace' ) {
		return $.Deferred().resolve( { query: { prefixsearch: [] } } ).promise();
	}
	return $.Deferred().resolve( { pfautocomplete: [] } ).promise();
};

pf.AutocompleteWidget.prototype.getLookupRequest = function() {
	const value = this.normalizeValue( this.getValue() );
	let requestPromise;
	let requestParams;
	let cacheKey;

	if ( value.length < this.minLookupLength ) {
		this.abortPendingRequest( null );
		this.pendingRequest = null;
		this.pendingRequestKey = null;
		return this.getEmptyLookupResult();
	}

	requestParams = this.buildRequestParams( value );
	cacheKey = this.getRequestCacheKey( requestParams );

	if ( this.requestCache.has( cacheKey ) ) {
		return $.Deferred().resolve( this.requestCache.get( cacheKey ) ).promise();
	}

	if ( this.pendingRequest && this.pendingRequestKey === cacheKey ) {
		return this.pendingRequest;
	}

	this.abortPendingRequest( cacheKey );

	requestPromise = new mw.Api().get( requestParams )
		.then( ( response ) => {
			this.pendingRequest = null;
			this.pendingRequestKey = null;
			return this.rememberRequest( cacheKey, response );
		} )
		.catch( ( error ) => {
			if ( error !== 'http' && error !== 'abort' ) {
				mw.log.warn( 'Page Forms autocomplete request failed', error );
			}
			this.pendingRequest = null;
			this.pendingRequestKey = null;
			return this.getEmptyLookupResult();
		} );

	this.pendingRequest = requestPromise;
	this.pendingRequestKey = cacheKey;
	return requestPromise;
};

pf.AutocompleteWidget.prototype.extractLookupResults = function( response ) {
	if ( this.config.autocompletedatatype === 'namespace' ) {
		return response && response.query && Array.isArray( response.query.prefixsearch ) ?
			response.query.prefixsearch : [];
	}
	return response && Array.isArray( response.pfautocomplete ) ? response.pfautocomplete : [];
};

pf.AutocompleteWidget.prototype.getLookupCacheDataFromResponse = function( response ) {
	return response || [];
};

pf.AutocompleteWidget.prototype.getLookupMenuOptionsFromData = function( response ) {
	const data = this.extractLookupResults( response );
	const items = [];
	const seenLabels = new Set();
	let i;
	let item;
	let label;
	let menuData;

	if ( !data || data.length === 0 ) {
		return [
			new OO.ui.MenuOptionWidget( {
				disabled: true,
				label: mw.message( 'pf-autocomplete-no-matches' ).text()
			} )
		];
	}

	for ( i = 0; i < data.length && items.length < this.maxSuggestions; i++ ) {
		item = data[ i ];
		label = item.title;
		menuData = label;

		if ( label === undefined || label === null ) {
			continue;
		}
		label = label.toString();
		if ( seenLabels.has( label ) ) {
			continue;
		}
		seenLabels.add( label );

		items.push( new OO.ui.MenuOptionWidget( {
			data: menuData,
			label: this.highlightText( label )
		} ) );
	}

	return items;
};

pf.AutocompleteWidget.prototype.highlightText = function( suggestion ) {
	const searchTerm = this.normalizeValue( this.getValue() );
	let searchRegexp;
	let loc;
	let highlighted;

	if ( searchTerm === '' ) {
		return suggestion;
	}

	searchRegexp = new RegExp(
		'(?![^&;]+;)(?!<[^<>]*)(' +
		searchTerm.replace( /([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, '\\$1' ) +
		')(?![^<>]*>)(?![^&;]+;)',
		'gi'
	);
	loc = suggestion.search( searchRegexp );

	if ( loc >= 0 ) {
		highlighted = suggestion.slice( 0, Math.max( 0, loc ) ) +
			'<strong>' + suggestion.substr( loc, searchTerm.length ) + '</strong>' +
			suggestion.slice( loc + searchTerm.length );
		return new OO.ui.HtmlSnippet( highlighted );
	}

	return suggestion;
};
