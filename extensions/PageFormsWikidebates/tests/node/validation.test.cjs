'use strict';

const assert = require( 'node:assert/strict' );
const test = require( 'node:test' );
const { createEnvironment } = require( './environment.cjs' );
const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

function validation( cargo = false ) {
	const env = createEnvironment();
	env.load( 'libs/PageForms.js' );
	const errors = [];
	env.$.fn.addErrorMessage = function( message ) { errors.push( message ); };
	const field = env.node( { value: 'New', props: { id: 'choice', defaultValue: 'Original' } } );
	const wrapper = env.node( { find: { '.uniqueField': [ field ] } } );
	const form = env.node( { serialized: 'choice=New', find: { 'span.inputSpan.uniqueFieldSpan': [ wrapper ] } } );
	env.selectors.set( '#pfForm', [ form ] );
	env.selectors.set( cargo ? 'choice_unique_cargo_table' : 'choice_unique_property', [ env.node( { value: cargo ? 'Places' : 'Label' } ) ] );
	if ( cargo ) {
		env.selectors.set( 'choice_unique_cargo_field', [ env.node( { value: 'City' } ) ] );
	}
	return { ...env, errors, field, wrapper, form, $wrapper: env.$( wrapper ) };
}

test( 'unchanged or empty values do not require network validation', async () => {
	const { field, $wrapper, requests } = validation();
	field.value = 'Original';
	assert.equal( await $wrapper.validateUniqueFieldAsync(), true );
	assert.equal( $wrapper.validateUniqueField(), true );
	field.value = '';
	assert.equal( await $wrapper.validateUniqueFieldAsync(), true );
	assert.equal( requests.length, 0 );
} );

test( 'a unique value passes only after its asynchronous check completes', async () => {
	const { $wrapper, requests, errors } = validation();
	const result = $wrapper.validateUniqueFieldAsync();
	assert.equal( requests[ 0 ].data.action, 'ask' );
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	assert.equal( await result, true );
	assert.equal( $wrapper.validateUniqueField(), true );
	assert.deepEqual( errors, [] );
} );

test( 'a duplicate is distinct from a failed network check', async () => {
	const { $wrapper, requests, errors } = validation();
	const result = $wrapper.validateUniqueFieldAsync();
	requests[ 0 ].resolve( { query: { meta: { count: 1 } } } );
	assert.equal( await result, false );
	assert.equal( $wrapper.validateUniqueField(), false );
	assert.deepEqual( errors, [ 'pf_not_unique_error' ] );
} );

for ( const failure of [ 'http', 'malformed' ] ) {
	test( 'uniqueness fails closed with a retry message on ' + failure, async () => {
		const { $wrapper, requests, errors } = validation();
		const result = $wrapper.validateUniqueFieldAsync();
		if ( failure === 'http' ) { requests[ 0 ].reject( 'http' ); } else { requests[ 0 ].resolve( {} ); }
		assert.equal( await result, false );
		assert.equal( $wrapper.validateUniqueField(), false );
		assert.deepEqual( errors, [ 'pf_validation_error' ] );
	} );
}

test( 'a result for an older field value cannot authorize submission', async () => {
	const { $wrapper, field, requests, errors } = validation();
	const result = $wrapper.validateUniqueFieldAsync();
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	await result;
	field.value = 'Changed';
	assert.equal( $wrapper.validateUniqueField(), false );
	assert.deepEqual( errors, [ 'pf_validation_error' ] );
} );

test( 'Cargo checks encode values as API data and quote apostrophes', async () => {
	const { $wrapper, field, requests } = validation( true );
	field.value = "L'été & l'hiver";
	const result = $wrapper.validateUniqueFieldAsync();
	assert.equal( requests[ 0 ].data.where, "City = 'L''été & l''hiver'" );
	assert.equal( requests[ 0 ].data.limit, 1 );
	requests[ 0 ].resolve( { cargoquery: [] } );
	assert.equal( await result, true );
	assert.equal( $wrapper.validateUniqueField(), true );
} );

test( 'form validation waits for remote checks and keeps its boolean legacy API', async () => {
	const { context, requests, errors } = validation();
	const pending = context.validateAllAsync();
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	assert.equal( await pending, true );
	assert.deepEqual( errors, [] );
	assert.equal( context.validateAll(), false, 'Consumed results cannot be reused for a subsequent save' );
} );

test( 'a second click during validation cannot submit the form twice', async () => {
	const { context, requests } = validation();
	const first = context.validateAllAsync();
	assert.equal( await context.validateAllAsync(), false );
	assert.equal( requests.length, 1 );
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	assert.equal( await first, true );
} );

test( 'editing the form while its checks run prevents submission and allows retry', async () => {
	const { context, form, requests, $ } = validation();
	const pending = context.validateAllAsync();
	form.serialized = 'choice=Changed';
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	assert.equal( await pending, false );
	assert.equal( $( form ).data( 'pfValidationPending' ), undefined );
} );

test( 'a failed dependent request prevents saving after validation waits for it', async () => {
	const env = validation();
	const input = env.node( { parent: env.node(), classes: new Set( [ 'pfComboBox' ] ) } );
	env.config.wgPageFormsFieldProperties = { Country: 'Pays', City: 'Ville' };
	env.form.find[ '.pfTokens, .pfComboBox' ] = [ input ];
	env.$( input ).setDependentAutocompletion( 'City', 'Country', 'FR' );
	const pending = env.context.validateAllAsync();
	env.requests[ 1 ].resolve( { query: { meta: { count: 0 } } } );
	await tick();
	assert.equal( env.$( env.form ).data( 'pfValidationPending' ), true );
	env.requests[ 0 ].reject( 'http' );
	assert.equal( await pending, false );
	assert.deepEqual( env.errors, [ 'pf_autocomplete_error' ] );
} );
