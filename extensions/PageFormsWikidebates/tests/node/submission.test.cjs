'use strict';

const assert = require( 'node:assert/strict' );
const test = require( 'node:test' );
const { createEnvironment } = require( './environment.cjs' );
const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

function setup() {
	const env = createEnvironment();
	env.config.wgAction = 'formedit';
	env.config.wgPageName = 'Test';
	const field = env.node( { value: 'New', props: { id: 'choice', defaultValue: 'Old' } } );
	const wrapper = env.node( { find: { '.uniqueField': [ field ] } } );
	const form = env.node( { serialized: 'choice=New', find: { 'span.inputSpan.uniqueFieldSpan': [ wrapper ] } } );
	env.selectors.set( '#pfForm', [ form ] );
	env.selectors.set( 'choice_unique_property', [ env.node( { value: 'Label' } ) ] );
	env.load( 'libs/PageForms.js' );
	return { ...env, form };
}

function event( button ) {
	return {
		prevented: false,
		currentTarget: button,
		originalEvent: { submitter: button },
		preventDefault() { this.prevented = true; },
		isDefaultPrevented() { return this.prevented; },
		stopImmediatePropagation() {}
	};
}

function nativeSubmit() {
	const env = setup();
	const submitted = [];
	env.context.HTMLFormElement = { prototype: { submit() { submitted.push( this ); } } };
	env.ready[ 0 ]();
	env.timers[ 0 ]();
	return { ...env, submitted, handler: env.form.events[ 'submit.pfValidate' ] };
}

test( 'native save waits for validation and includes the clicked submit button', async () => {
	const { form, handler, requests, submitted } = nativeSubmit();
	const click = event( { name: 'wpSave', value: 'Enregistrer' } );
	handler.call( form, click );
	assert.equal( click.prevented, true );
	assert.equal( submitted.length, 0 );
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	await tick();
	assert.deepEqual( submitted, [ form ] );
	assert.equal( form.appended[ 0 ].attrs.name, 'wpSave' );
	assert.equal( form.appended[ 0 ].attrs.value, 'Enregistrer' );
} );

test( 'native save honors a cancellation from another submit handler', () => {
	const { form, handler, requests } = nativeSubmit();
	const click = event();
	click.preventDefault();
	handler.call( form, click );
	assert.equal( requests.length, 0 );
} );

test( 'native save rejects duplicates and does not navigate after a failed check', async () => {
	const { form, handler, requests, submitted } = nativeSubmit();
	handler.call( form, event() );
	handler.call( form, event() );
	assert.equal( requests.length, 1 );
	requests[ 0 ].resolve( { query: { meta: { count: 1 } } } );
	await tick();
	assert.equal( submitted.length, 0 );
} );

test( 'AJAX preview waits for validation instead of treating a Promise as true', async () => {
	const env = setup();
	const button = env.node( { attrs: { value: 'Prévisualiser' }, closest: { form: [ env.form ] } } );
	env.selectors.set( '#wikiPreview', [ env.node( { contents: [] } ) ] );
	env.load( 'libs/PF_preview.js' );
	env.$( button ).pfAjaxPreview();
	const calls = [];
	env.$.ajax = ( options ) => { calls.push( options ); return env.$.when(); };
	const click = event( button );
	button.events.click.call( button, click );
	assert.equal( click.prevented, true );
	assert.equal( calls.length, 0 );
	env.requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	await tick();
	assert.equal( calls.length, 1 );
	assert.equal( calls[ 0 ].data.action, 'pfautoedit' );
	assert.match( calls[ 0 ].data.query, /wpPreview=Pr%C3%A9visualiser/ );
} );

test( 'save-and-continue waits for validation and guards the pending POST', async () => {
	const env = setup();
	const button = env.node( { attrs: { value: 'Continuer' } } );
	env.selectors.set( '.pf-save_and_continue', [ button ] );
	env.load( 'libs/PF_submit.js' );
	env.ready[ env.ready.length - 1 ]();
	const calls = [];
	env.$.ajax = ( options ) => {
		calls.push( options );
		return new env.context.mediaWiki.Api().get( options.data );
	};
	button.events.click( event( button ) );
	assert.equal( calls.length, 0 );
	env.requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	await tick();
	assert.equal( calls.length, 1 );
	assert.match( calls[ 0 ].data.query, /wpSave=Continuer/ );
	button.events.click( event( button ) );
	assert.equal( env.requests.length, 2, 'Only the unique check and the save POST were sent' );
	env.requests[ 1 ].resolve( {} );
	await tick();
	assert.equal( env.form.data.pfSavePending, undefined );
} );

test( 'popup interception receives the validation result without a native iframe submission', async () => {
	const { form, handler, requests, submitted } = nativeSubmit();
	const popupEvents = [];
	form.data.pfPopupSubmit = ( event ) => popupEvents.push( event );
	const result = handler.call( form, event() );
	assert.equal( typeof result.then, 'function' );
	requests[ 0 ].resolve( { query: { meta: { count: 0 } } } );
	assert.equal( await result, true );
	assert.equal( popupEvents.length, 1 );
	assert.equal( submitted.length, 0 );
} );
