'use strict';

const fs = require( 'node:fs' );
const path = require( 'node:path' );
const vm = require( 'node:vm' );

// A deliberately small jQuery/MediaWiki boundary for exercising the shipped
// scripts without a wiki or installed npm packages. No source extraction.
function createEnvironment() {
	const selectors = new Map();
	const requests = [];
	const ready = [];
	const timers = [];
	const observers = [];
	const modules = [];
	const config = { wgPageFormsDependentFields: [] };

	class Collection {
		constructor( nodes = [] ) {
			this.nodes = nodes;
			this.length = nodes.length;
			nodes.forEach( ( node, i ) => { this[ i ] = node; } );
		}
		each( callback ) { this.nodes.forEach( ( node, i ) => callback.call( node, i, node ) ); return this; }
		data( key, value ) {
			if ( arguments.length === 1 ) { return this[ 0 ] && this[ 0 ].data[ key ]; }
			return this.each( function() { this.data[ key ] = value; } );
		}
		removeData( key ) { return this.each( function() { delete this.data[ key ]; } ); }
		attr( key, value ) {
			if ( typeof key === 'object' ) {
				Object.entries( key ).forEach( ( [ name, entry ] ) => this.attr( name, entry ) );
				return this;
			}
			if ( arguments.length === 1 ) { return this[ 0 ] && this[ 0 ].attrs[ key ]; }
			return this.each( function() { this.attrs[ key ] = value; } );
		}
		removeAttr( key ) { return this.each( function() { delete this.attrs[ key ]; } ); }
		prop( key, value ) {
			if ( arguments.length === 1 ) { return this[ 0 ] && this[ 0 ].props[ key ]; }
			return this.each( function() { this.props[ key ] = value; } );
		}
		val( value ) {
			if ( !arguments.length ) { return this[ 0 ] && this[ 0 ].value; }
			return this.each( function() { this.value = value; } );
		}
		text( value ) {
			if ( !arguments.length ) { return this[ 0 ] && this[ 0 ].text; }
			return this.each( function() { this.text = value; } );
		}
		html( value ) { return this.each( function() { this.html = value; } ); }
		find( selector ) {
			const result = $( this.nodes.flatMap( ( node ) => node.find[ selector ] || [] ) );
			result.previous = this;
			return result;
		}
		closest( selector ) { return $( this[ 0 ] && this[ 0 ].closest[ selector ] ); }
		parent() { return $( this[ 0 ] && this[ 0 ].parent ); }
		addBack( selector ) {
			return $( this.nodes.concat( this.previous ? this.previous.nodes.filter( ( node ) =>
				node.classes.has( selector.slice( 1 ) ) ) : [] ) );
		}
		not() { return this; }
		filter() { return this; }
		first() { return $( this[ 0 ] ); }
		last() { return $( this.nodes[ this.length - 1 ] ); }
		hasClass( name ) { return !!this[ 0 ] && this[ 0 ].classes.has( name ); }
		addClass( names ) { return this.each( function() { names.split( ' ' ).forEach( ( name ) => this.classes.add( name ) ); } ); }
		removeClass( names ) { return this.each( function() { names.split( ' ' ).forEach( ( name ) => this.classes.delete( name ) ); } ); }
		appendTo( target ) { $( target ).each( ( i, node ) => node.appended.push( ...this.nodes ) ); return this; }
		append( content ) { return this.each( function() { this.appended.push( ...$( content ).nodes ); } ); }
		contents() { return this[ 0 ] && this[ 0 ].contents ? $( this[ 0 ].contents ) : this; }
		parents() { return $(); }
		css() { return this; }
		remove() { return this; }
		scrollTop() { return this; }
		serialize() { return this[ 0 ].serialized || ''; }
		on( event, selector, callback ) {
			const handler = callback || selector;
			return this.each( function() { this.events[ event ] = handler; } );
		}
		off() { return this; }
		click( callback ) { return this.on( 'click', callback ); }
		change( callback ) { return this.on( 'change', callback ); }
		hide() { return this; }
		show() { return this; }
	}

	function node( options = {} ) {
		return Object.assign( {
			attrs: {}, props: {}, data: {}, find: {}, closest: {}, classes: new Set(),
			events: {}, appended: [], value: '', text: '',
			getBoundingClientRect: () => ( { top: 3000, bottom: 3040 } )
		}, options );
	}
	function $( value ) {
		if ( value instanceof Collection ) { return value; }
		if ( typeof value === 'function' ) { ready.push( value ); return new Collection(); }
		if ( typeof value === 'string' ) {
			if ( value.startsWith( '<' ) ) { return new Collection( [ node() ] ); }
			return $( selectors.get( value ) );
		}
		return new Collection( value ? ( Array.isArray( value ) ? value : [ value ] ) : [] );
	}
	$.fn = Collection.prototype;
	$.each = ( values, callback ) => values.forEach( ( value, key ) => callback.call( value, key, value ) );
	$.uniqueSort = ( values ) => [ ...new Set( values ) ];

	// Promise adapter exposes the jqXHR methods used by PageForms. Completion
	// handlers are deliberately asynchronous so races can be controlled in tests.
	function promise( native ) {
		const result = {
			then: ( yes, no ) => promise( native.then( yes, no ) ),
			done: ( callback ) => { native.then( callback, () => {} ); return result; },
			fail: ( callback ) => { native.then( () => {}, callback ); return result; },
			always: ( callback ) => { native.then( callback, callback ); return result; }
		};
		return result;
	}
	$.when = ( ...values ) => promise( Promise.all( values.map( ( value ) => Promise.resolve( value ) ) )
		.then( ( results ) => results.length === 1 ? results[ 0 ] : results ) );
	const mw = {
		config: { get: ( key ) => config[ key ] },
		msg: ( key ) => key,
		util: { wikiScript: () => '/w/api.php', getParamValue: () => null },
		message: ( key ) => ( { escaped: () => key } ),
		hook: () => ( { add: () => {}, fire: () => {} } ),
		user: { options: { get: () => false } },
		loader: { using: ( name ) => { modules.push( name ); return $.when(); } },
		Api: function() {
			this.get = ( data ) => {
				let resolve, reject;
				const native = new Promise( ( yes, no ) => { resolve = yes; reject = no; } );
				const request = promise( native );
				request.abort = () => { request.aborted = true; reject( 'abort' ); };
				requests.push( { data, resolve, reject, request } );
				return request;
			};
		}
	};
	const context = {
		jQuery: $, mediaWiki: mw, pf: {}, pageforms: {}, console,
		document: { getElementById: () => null, documentElement: { clientHeight: 800 }, getElementsByName: ( name ) => selectors.get( name ) || [] },
		innerHeight: 800,
		IntersectionObserver: class {
			constructor( callback ) { this.callback = callback; this.targets = []; observers.push( this ); }
			observe( target ) { this.targets.push( target ); }
			unobserve( target ) { this.targets = this.targets.filter( ( item ) => item !== target ); }
		},
		setTimeout: ( callback ) => timers.push( callback ),
		scroll: () => {},
		require: () => ( {} )
	};
	context.window = context;
	context.pageforms = context.pf;
	vm.createContext( context );
	function load( file ) {
		vm.runInContext( fs.readFileSync( path.join( __dirname, '../..', file ), 'utf8' ), context, { filename: file } );
	}
	return { $, node, selectors, requests, config, context, ready, timers, observers, modules, load };
}

module.exports = { createEnvironment };
