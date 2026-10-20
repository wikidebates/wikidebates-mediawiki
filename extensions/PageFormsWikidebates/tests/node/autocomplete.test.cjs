'use strict';

const assert = require( 'node:assert/strict' );
const test = require( 'node:test' );
const { createEnvironment } = require( './environment.cjs' );
const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

function combobox() {
	const env = createEnvironment();
	env.load( 'libs/ext.pf.select2.base.js' );
	env.load( 'libs/PF_ComboBoxInput.js' );
	const input = env.node( { attrs: { name: 'Form[Choice]', autocompletesettings: 'local' } } );
	const box = new env.context.pf.ComboBoxInput();
	box.$element = env.$( input );
	box.autocompletesettings = 'local';
	return { ...env, box, input };
}

test( 'local combobox preserves the option value and its separate label', () => {
	const { box, input, node } = combobox();
	input.find.option = [ node( { attrs: { value: 'Canonical' }, text: 'Libellé' } ) ];
	assert.deepEqual( JSON.parse( JSON.stringify( box.getLocalData() ) ), [
		{ id: 'Canonical', text: 'Libellé', title: 'Canonical' }
	] );
} );

test( 'shipped Select2 escapes combobox suggestions and selected values', () => {
	const env = combobox();
	// Only library registration is needed: rendering is exercised through the
	// actual Select2 adapters, without constructing browser widgets.
	env.$.event = { special: {} };
	env.$.fn.extend = ( methods ) => Object.assign( env.$.fn, methods );
	env.$.extend = ( ...args ) => {
		if ( args[ 0 ] === true ) { args.shift(); }
		return Object.assign( args.shift(), ...args );
	};
	env.load( 'libs/foreign/select2/select2.js' );
	const options = env.box.getSelect2Options();
	const defaults = env.$.fn.select2.defaults.defaults;
	const get = ( key ) => Object.prototype.hasOwnProperty.call( options, key ) ? options[ key ] : defaults[ key ];
	const adapters = env.$.fn.select2.amd;
	const Results = adapters.require( 'select2/results' );
	const SingleSelection = adapters.require( 'select2/selection/single' );
	const container = { style: {} };
	const result = { text: '<img src=x onerror=alert(1)> & title' };
	Results.prototype.template.call( { options: { get } }, result, container );
	assert.match( container.innerHTML, /&lt;img/ );
	assert.doesNotMatch( container.innerHTML, /<img/ );
	const selected = SingleSelection.prototype.display.call( { options: { get } }, result, container );
	assert.match( selected, /&lt;img/ );
	assert.match( selected, /&amp;/ );
} );

test( 'highlighted suggestion uses escaped markup in a DOM element', () => {
	const { box, input, $, config } = combobox();
	config.wgPageFormsAutocompleteOnAllChars = true;
	input.data.select2 = { dropdown: { $search: $( { value: 'img' } ) } };
	const rendered = box.getSelect2Options().templateResult( { text: '<img src=x>' } );
	assert.match( rendered[ 0 ].html, /&lt;/ );
	assert.match( rendered[ 0 ].html, /<b>img<\/b>/ );
	assert.doesNotMatch( rendered[ 0 ].html, /<img/ );
} );

function dependent() {
	const env = createEnvironment();
	env.load( 'libs/PageForms.js' );
	env.config.wgPageFormsFieldProperties = { Country: 'Pays', City: 'Ville' };
	const input = env.node( { parent: env.node() } );
	return { ...env, input, field: env.$( input ) };
}

test( 'dependent requests preserve reserved characters and Unicode as API data', () => {
	const { field, requests } = dependent();
	field.setDependentAutocompletion( 'City', 'Country', 'A&B=1 + Été#2' );
	assert.equal( requests[ 0 ].data.basevalue, 'A&B=1 + Été#2' );
	assert.equal( requests[ 0 ].data.baseprop, 'Pays' );
	assert.equal( requests[ 0 ].data.property, 'Ville' );
} );

test( 'dependent requests support Cargo source and target fields', () => {
	const { field, config, requests } = dependent();
	config.wgPageFormsCargoFields = { Country: 'Places|Country', City: 'Places|City' };
	field.setDependentAutocompletion( 'City', 'Country', 'Côte & Mer' );
	assert.equal( requests[ 0 ].data.cargo_field, 'City' );
	assert.equal( requests[ 0 ].data.base_cargo_field, 'Country' );
	assert.equal( requests[ 0 ].data.basevalue, 'Côte & Mer' );
} );

test( 'a late response cannot replace the current dependent choices or busy state', async () => {
	const { field, requests } = dependent();
	field.setDependentAutocompletion( 'City', 'Country', 'Old' );
	requests[ 0 ].request.abort = () => {};
	field.setDependentAutocompletion( 'City', 'Country', 'New' );
	requests[ 0 ].resolve( { pfautocomplete: [ { title: 'Old City' } ] } );
	await tick();
	assert.equal( field.attr( 'aria-busy' ), 'true' );
	assert.equal( field.data( 'autocompletevalues' ).length, 0 );
	requests[ 1 ].resolve( { pfautocomplete: [ { title: 'New City' } ] } );
	await tick();
	assert.equal( field.attr( 'aria-busy' ), undefined );
	assert.equal( field.data( 'autocompletevalues' )[ 0 ], 'New City' );
} );

test( 'changing the source cancels the previous dependent request', () => {
	const { field, requests } = dependent();
	field.setDependentAutocompletion( 'City', 'Country', 'Old' );
	field.setDependentAutocompletion( 'City', 'Country', 'New' );
	assert.equal( requests[ 0 ].request.aborted, true );
} );

test( 'change followed by blur reuses pending and completed dependent requests', async () => {
	const { field, requests } = dependent();
	const first = field.setDependentAutocompletion( 'City', 'Country', 'Same' );
	assert.equal( field.setDependentAutocompletion( 'City', 'Country', 'Same' ), first );
	requests[ 0 ].resolve( { pfautocomplete: [ { title: 'One' } ] } );
	await tick();
	await field.setDependentAutocompletion( 'City', 'Country', 'Same' );
	assert.equal( requests.length, 1 );
} );

test( 'dependent failures are visible, clear busy state, and allow retry', async () => {
	const { field, input, requests } = dependent();
	field.setDependentAutocompletion( 'City', 'Country', 'Retry' );
	requests[ 0 ].reject( 'http' );
	await tick();
	assert.equal( field.data( 'pfDependentAutocompleteError' ), true );
	assert.equal( input.parent.appended[ 0 ].attrs.role, 'alert' );
	assert.equal( input.parent.appended[ 0 ].text, 'pf_autocomplete_error' );
	assert.equal( field.attr( 'aria-busy' ), undefined );
	field.setDependentAutocompletion( 'City', 'Country', 'Retry' );
	assert.equal( requests.length, 2 );
} );

test( 'malformed dependent responses do not mark the choices as loaded', async () => {
	const { field, requests } = dependent();
	field.setDependentAutocompletion( 'City', 'Country', 'Bad' );
	requests[ 0 ].resolve( {} );
	await tick();
	assert.equal( field.data( 'pfDependentAutocompleteError' ), true );
	assert.equal( field.data( 'pfDependentAutocompleteLoaded' ), false );
} );

test( 'dependent tokens read prefetched values without starting another request', () => {
	const env = dependent();
	env.load( 'libs/ext.pf.select2.base.js' );
	env.load( 'libs/ext.pf.select2.tokens.js' );
	const tokens = new env.context.pf.select2.tokens();
	tokens.$element = env.field.data( 'autocompletevalues', [ 'Paris', 'Lyon' ] );
	tokens.dependentOn = () => 'Country';
	assert.deepEqual( JSON.parse( JSON.stringify( tokens.getData( 'local' ) ) ), [
		{ id: 'Paris', text: 'Paris' }, { id: 'Lyon', text: 'Lyon' }
	] );
	assert.equal( env.requests.length, 0 );
} );

test( 'scrolling initializes only the intersecting combobox', async () => {
	const env = createEnvironment();
	env.load( 'libs/PageForms.js' );
	const applied = [];
	env.context.pf.ComboBoxInput = function() { this.apply = ( $element ) => applied.push( $element[ 0 ] ); };
	const first = env.node( { classes: new Set( [ 'pfComboBox' ] ) } );
	const second = env.node( { classes: new Set( [ 'pfComboBox' ] ) } );
	const root = env.node( { find: { '.pfComboBox': [ first, second ] } } );
	env.$( root ).initializeJSElements( false );
	assert.equal( applied.length, 0 );
	const observer = env.observers[ 0 ];
	observer.callback( [ { target: first, isIntersecting: true } ], observer );
	await tick();
	assert.deepEqual( applied, [ first ] );
	assert.ok( observer.targets.includes( second ) );
} );

test( 'starter widgets are not registered and can be initialized in cloned instances', () => {
	const env = createEnvironment();
	env.load( 'libs/PageForms.js' );
	const starter = env.node();
	const widget = env.node( { closest: { '.multipleTemplateStarter': [ starter ] } } );
	const root = env.node( { find: { '.pfComboBox': [ widget ] } } );
	env.$( root ).initializeJSElements( false );
	assert.equal( widget.data.pfLazyRegistered, undefined );
	widget.closest = {};
	env.$( root ).initializeJSElements( true );
	assert.equal( widget.data.pfLazyRegistered, true );
} );

test( 'tokens initialized directly by a popup load missing dependent choices asynchronously', async () => {
	const env = dependent();
	env.load( 'libs/ext.pf.select2.base.js' );
	env.load( 'libs/ext.pf.select2.tokens.js' );
	const tokens = new env.context.pf.select2.tokens();
	tokens.$element = env.field.data( 'select2', {} );
	tokens.dependentOn = () => 'Country';
	tokens.getDependentFieldOpts = () => ( { prop: 'Ville', base_prop: 'Pays', base_value: 'A&B' } );
	let refreshed = 0;
	tokens.refresh = () => { refreshed++; };
	assert.equal( tokens.getData( 'local' ).length, 0 );
	assert.equal( env.requests[ 0 ].data.basevalue, 'A&B' );
	assert.equal( refreshed, 0 );
	env.requests[ 0 ].resolve( { pfautocomplete: [ { title: 'Canonical', displaytitle: 'Label' } ] } );
	await tick();
	assert.equal( refreshed, 1 );
	assert.equal( tokens.getData( 'local' )[ 0 ].id, 'Canonical' );
	assert.equal( env.requests.length, 1 );
} );
