'use strict';

const $ = require( '../../../../resources/lib/jquery/jquery.js' );

let requests;
let ComboBoxInput;

function createInput( id = 'input_1' ) {
	const input = new ComboBoxInput();
	input.id = id;
	input.autocompletedatatype = 'category';
	return input;
}

function search( input, term, success = jest.fn(), failure = jest.fn() ) {
	return input.getAjaxOptions().transport( {
		data: { action: 'pfautocomplete', category: 'Debates', substr: term }
	}, success, failure );
}

beforeEach( () => {
	jest.resetModules();
	requests = [];
	global.jQuery = $;
	global.mediaWiki = { util: { wikiScript: () => '/api.php' } };
	global.pageforms = { select2: { base: function () {} } };
	pageforms.select2.base.prototype.destroy = ( element ) => element.select2( 'destroy' );
	require( '../../libs/PF_ComboBoxInput.js' );
	ComboBoxInput = pageforms.ComboBoxInput;
	$.ajax = jest.fn( ( options ) => {
		const deferred = $.Deferred();
		const xhr = deferred.promise();
		xhr.abort = jest.fn( () => deferred.reject( xhr, 'abort' ) );
		// Support jQuery's callbacks as well as its promise interface.
		deferred.done( options.success ).fail( options.error );
		requests.push( { deferred, xhr } );
		return xhr;
	} );
} );

test( 'reuses completed suggestions without another HTTP request', () => {
	const input = createInput();
	const response = { pfautocomplete: [ { title: 'Débat' } ] };
	search( input, 'dé' );
	requests[ 0 ].deferred.resolve( response );
	const success = jest.fn();
	search( input, 'dé', success );
	expect( $.ajax ).toHaveBeenCalledTimes( 1 );
	expect( success ).toHaveBeenCalledWith( response );
} );

test( 'a cached search cancels the pending search for the same field', () => {
	const input = createInput();
	search( input, 'cached' );
	requests[ 0 ].deferred.resolve( { pfautocomplete: [] } );
	search( input, 'pending' );
	search( input, 'cached' );
	expect( requests[ 1 ].xhr.abort ).toHaveBeenCalledTimes( 1 );
} );

test( 'late success cannot replace newer results or detach the newer request', () => {
	const input = createInput();
	const oldSuccess = jest.fn();
	search( input, 'old', oldSuccess );
	// A transport may already have queued a completion when it is cancelled.
	requests[ 0 ].xhr.abort.mockImplementation( () => {} );
	search( input, 'new' );
	requests[ 0 ].deferred.resolve( { pfautocomplete: [ { title: 'Old' } ] } );
	expect( oldSuccess ).not.toHaveBeenCalled();
	search( input, 'newer' );
	expect( requests[ 1 ].xhr.abort ).toHaveBeenCalledTimes( 1 );
} );

test( 'late failure cannot report an error or detach the newer request', () => {
	const input = createInput();
	const failure = jest.fn();
	search( input, 'old', jest.fn(), failure );
	requests[ 0 ].xhr.abort.mockImplementation( () => {} );
	search( input, 'new' );
	requests[ 0 ].deferred.reject( requests[ 0 ].xhr, 'error', 'Old error' );
	expect( failure ).not.toHaveBeenCalled();
	search( input, 'newer' );
	expect( requests[ 1 ].xhr.abort ).toHaveBeenCalledTimes( 1 );
} );

test( 'a failed search can be retried and aborts do not show errors', () => {
	const input = createInput();
	const failure = jest.fn();
	search( input, 'retry', jest.fn(), failure );
	requests[ 0 ].deferred.reject( requests[ 0 ].xhr, 'error', 'Network error' );
	expect( failure ).toHaveBeenCalledTimes( 1 );
	const xhr = search( input, 'retry', jest.fn(), failure );
	xhr.abort();
	expect( $.ajax ).toHaveBeenCalledTimes( 2 );
	expect( failure ).toHaveBeenCalledTimes( 1 );
} );

test( 'searches in different fields do not cancel each other', () => {
	search( createInput( 'first' ), 'one' );
	search( createInput( 'second' ), 'two' );
	expect( requests[ 0 ].xhr.abort ).not.toHaveBeenCalled();
} );

test( 'cache eviction retains recently reused searches', () => {
	const input = createInput();
	ComboBoxInput.static.cacheSize = 2;
	for ( const term of [ 'first', 'second' ] ) {
		search( input, term );
		requests[ requests.length - 1 ].deferred.resolve( { pfautocomplete: [] } );
	}
	search( input, 'first' );
	search( input, 'third' );
	requests[ 2 ].deferred.resolve( { pfautocomplete: [] } );
	search( input, 'first' );
	expect( $.ajax ).toHaveBeenCalledTimes( 3 );
	search( input, 'second' );
	expect( $.ajax ).toHaveBeenCalledTimes( 4 );
} );

test( 'a synchronously completed transport is not retained as pending', () => {
	const input = createInput();
	const xhr = $.Deferred().resolve( { pfautocomplete: [] } ).promise();
	xhr.abort = jest.fn();
	$.ajax.mockReturnValueOnce( xhr );
	const success = jest.fn();
	search( input, 'first', success );
	expect( success ).toHaveBeenCalledTimes( 1 );
	search( input, 'second' );
	expect( xhr.abort ).not.toHaveBeenCalled();
} );

test( 'destroy cancels requests and releases combobox handlers and initialization state', () => {
	const input = createInput();
	const element = $( '<select class="pf-combobox-initialized"><option value="saved" selected>Saved</option></select>' );
	const change = jest.fn();
	element.on( 'change.pfComboBox', change );
	element.select2 = jest.fn();
	search( input, 'pending' );
	input.destroy( element );
	expect( requests[ 0 ].xhr.abort ).toHaveBeenCalledTimes( 1 );
	expect( element.select2 ).toHaveBeenCalledWith( 'destroy' );
	expect( element.hasClass( 'pf-combobox-initialized' ) ).toBe( false );
	element.trigger( 'change' );
	expect( change ).not.toHaveBeenCalled();
	expect( element.val() ).toBe( 'saved' );
} );

describe( 'with the bundled Select2 widget', () => {
	beforeEach( () => {
		jest.resetModules();
		document.body.innerHTML = '';
		mediaWiki.config = {
			get: ( name ) => name === 'wgPageFormsDependentFields' ? [] : {}
		};
		mediaWiki.msg = ( key ) => key;
		mediaWiki.hook = () => ( { fire: jest.fn() } );
		$.fn.setAutocompleteForDependentField = jest.fn();
		delete $.fn.select2;
		require( '../../libs/foreign/select2/select2.js' );
		require( '../../libs/ext.pf.select2.base.js' );
		require( '../../libs/PF_ComboBoxInput.js' );
		ComboBoxInput = pageforms.ComboBoxInput;
	} );

	afterEach( () => {
		$( 'select.select2-hidden-accessible' ).select2( 'destroy' );
		document.body.innerHTML = '';
	} );

	test( 'local HTML options keep their labels and selection through refresh', () => {
		const element = $( '<select id="local" name="Form[Choice]"><option value=""></option><option value="A" selected>Label A</option><option value="B">Label B</option></select>' ).appendTo( document.body );
		const input = createInput();
		input.apply( element );
		expect( element.data( 'select2' ) ).toBeDefined();
		expect( element.select2( 'data' )[ 0 ].text ).toBe( 'Label A' );
		input.refresh( element );
		expect( element.val() ).toBe( 'A' );
		expect( element.select2( 'data' )[ 0 ].text ).toBe( 'Label A' );
		expect( element.find( 'option[value="B"]' ).text() ).toBe( 'Label B' );
		element.trigger( 'change' );
		expect( $.fn.setAutocompleteForDependentField ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'repeated initialization does not duplicate the dependent-field handler', () => {
		const element = $( '<select id="remote" name="Form[Choice]" autocompletedatatype="category" autocompletesettings="Debates"><option value=""></option></select>' ).appendTo( document.body );
		const input = createInput();
		input.apply( element );
		input.apply( element );
		input.refresh( element );
		element.trigger( 'change' );
		expect( $.fn.setAutocompleteForDependentField ).toHaveBeenCalledTimes( 1 );
		expect( $( '.select2-container' ) ).toHaveLength( 1 );
	} );

	test( 'dependent fields replace obsolete choices and clear a disallowed selection', () => {
		mediaWiki.config.get = ( name ) => name === 'wgPageFormsDependentFields' ? [ [ 'Form[Parent]', 'Form[Choice]' ] ] : {};
		const element = $( '<select id="dependent" name="Form[Choice]" existingvaluesonly="true" autocompletedatatype="category" autocompletesettings="Debates"><option value=""></option><option value="A" selected>A</option></select>' ).appendTo( document.body );
		element.data( 'autocompletevalues', [ 'A', 'B' ] );
		const input = createInput();
		input.apply( element );
		element.data( 'autocompletevalues', [ 'B', 'C' ] );
		input.refresh( element );
		expect( element.val() ).toBe( '' );
		expect( element.find( 'option[value="A"]' ) ).toHaveLength( 0 );
		expect( element.find( 'option[value="B"]' ) ).toHaveLength( 1 );
		expect( element.find( 'option[value="C"]' ) ).toHaveLength( 1 );
		expect( $.fn.setAutocompleteForDependentField ).toHaveBeenCalledTimes( 1 );
	} );
} );
