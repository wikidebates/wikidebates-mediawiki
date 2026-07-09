/*!
 * Contains Side Rail functionality.
 */

( function () {
	/**
	 * Binds handlers for side rail in board header.
	 *
	 * @this FlowComponent
	 * @constructor
	 */
	function FlowBoardComponentSideRailFeatureMixin() {
		// Bind element handlers
		this.bindNodeHandlers( FlowBoardComponentSideRailFeatureMixin.UI.events );
	}
	OO.initClass( FlowBoardComponentSideRailFeatureMixin );

	FlowBoardComponentSideRailFeatureMixin.UI = {
		events: {
			apiPreHandlers: {},
			apiHandlers: {},
			interactiveHandlers: {},
			loadHandlers: {}
		}
	};

	//
	// Load handlers
	//

	/**
	 * Sets side rail state based on user preferences.
	 */
	function FlowBoardComponentSideRailFeatureMixinLoadCallback() {
		$( '.flow-component' ).addClass( 'expanded' );
	}
	FlowBoardComponentSideRailFeatureMixin.UI.events.loadHandlers.loadSideRail = FlowBoardComponentSideRailFeatureMixinLoadCallback;

	//
	// On element-click handlers
	//

	/**
	 * Toggles side rail state and sets user preferences.
	 */
	function FlowBoardComponentSideRailFeatureMixinToggleCallback() {
		$( '.flow-component' ).addClass( 'expanded' );

		if ( !mw.user.isAnon() ) {
			new mw.Api().saveOption( 'flow-side-rail-state', 'collapsed' );
			mw.user.options.set( 'flow-side-rail-state', 'collapsed' );
		}
	}
	FlowBoardComponentSideRailFeatureMixin.UI.events.interactiveHandlers.toggleSideRail = FlowBoardComponentSideRailFeatureMixinToggleCallback;

	// Mixin to FlowComponent
	mw.flow.mixinComponent( 'component', FlowBoardComponentSideRailFeatureMixin );
}() );
