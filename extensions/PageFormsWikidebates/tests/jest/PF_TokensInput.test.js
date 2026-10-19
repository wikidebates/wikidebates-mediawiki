'use strict';

const $ = require( '../../../../resources/lib/jquery/jquery.js' );

jest.mock( 'ext.pageforms.sortable', () => ( { create: jest.fn() } ), { virtual: true } );

let element;
let widget;
let search;
let query;

beforeEach( () => {
	jest.resetModules();
	document.body.innerHTML = '';
	global.jQuery = $;
	global.mediaWiki = {
		config: {
			get: ( name ) => ( {
				wgPageFormsDependentFields: [],
				wgPageFormsAutocompleteValues: {},
				wgPageFormsAutocompleteOnAllChars: true
			} )[ name ]
		},
		msg: ( key ) => key
	};
	global.pageforms = {};
	delete $.fn.select2;
	require( '../../libs/foreign/select2/select2.js' );
	require( '../../libs/ext.pf.select2.base.js' );
	require( '../../libs/ext.pf.select2.tokens.js' );
	element = $( '<span class="inputSpan"><select id="tokens" name="Form[Tokens][]" multiple autocompletesettings="Accents,list,;"></select></span>' )
		.appendTo( document.body ).find( 'select' );
	new pageforms.select2.tokens().apply( element );
	widget = element.data( 'select2' );
	search = widget.selection.$search;
	query = jest.spyOn( widget.dataAdapter, 'query' );
	search[ 0 ].focus();
} );

afterEach( () => {
	element.select2( 'destroy' );
	document.body.innerHTML = '';
} );

function keyboard( type, key, code, isComposing = false ) {
	const event = new KeyboardEvent( type, {
		key, keyCode: code, which: code, isComposing,
		bubbles: true, cancelable: true
	} );
	search[ 0 ].dispatchEvent( event );
	return event;
}

function input( value, isComposing = false ) {
	search.val( value );
	search[ 0 ].dispatchEvent( new InputEvent( 'input', {
		bubbles: true, isComposing
	} ) );
}

test.each( [ 'ê', 'ö', 'É' ] )( 'a dead key waits for the completed character %s', ( value ) => {
	keyboard( 'keydown', 'Dead', 219 );
	keyboard( 'keyup', 'Dead', 219 );
	expect( query ).not.toHaveBeenCalled();
	expect( widget.isOpen() ).toBe( false );
	expect( document.activeElement ).toBe( search[ 0 ] );

	input( value );
	expect( query ).toHaveBeenLastCalledWith( expect.objectContaining( { term: value } ), expect.any( Function ) );
	expect( search.val() ).toBe( value );
	expect( widget.isOpen() ).toBe( true );
} );

test( 'composition leaves intermediate text and separators untouched until committed', () => {
	search.trigger( 'compositionstart' );
	input( 'intermédiaire;', true );
	keyboard( 'keyup', 'Process', 229, true );
	expect( query ).not.toHaveBeenCalled();
	expect( element.val() ).toEqual( [] );
	expect( search.val() ).toBe( 'intermédiaire;' );
	expect( widget.isOpen() ).toBe( false );

	search.val( 'ö' ).trigger( 'compositionend' );
	expect( query ).toHaveBeenLastCalledWith( expect.objectContaining( { term: 'ö' } ), expect.any( Function ) );
	expect( search.val() ).toBe( 'ö' );
} );

test( 'native composing input is ignored even without a compositionstart event', () => {
	input( '^', true );
	expect( query ).not.toHaveBeenCalled();
	input( 'ê' );
	expect( query ).toHaveBeenLastCalledWith( expect.objectContaining( { term: 'ê' } ), expect.any( Function ) );
} );

test.each( [ [ 'Enter', 13 ], [ 'Backspace', 8 ], [ 'Tab', 9 ] ] )( '%s during composition cannot select or remove a token', ( key, code ) => {
	element.append( new Option( 'Déjà choisi', 'Déjà choisi', true, true ) ).trigger( 'change' );
	input( 'Suggestion' );
	search.val( '' ).trigger( 'compositionstart' );
	const event = keyboard( 'keydown', key, code, true );
	keyboard( 'keyup', key, code, true );
	expect( event.defaultPrevented ).toBe( false );
	expect( element.val() ).toEqual( [ 'Déjà choisi' ] );
} );

test( 'legacy IME key code 229 does not start a search', () => {
	keyboard( 'keyup', 'Unidentified', 229 );
	expect( query ).not.toHaveBeenCalled();
} );

test( 'ordinary separators and Enter still select accented tokens', () => {
	input( 'forêt;Noël;' );
	expect( element.val() ).toEqual( [ 'forêt', 'Noël' ] );
	input( 'hôtel' );
	const event = keyboard( 'keydown', 'Enter', 13 );
	expect( event.defaultPrevented ).toBe( true );
	expect( element.val() ).toEqual( [ 'forêt', 'Noël', 'hôtel' ] );
} );
