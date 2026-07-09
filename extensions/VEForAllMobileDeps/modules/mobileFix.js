/*	VEForAllMobileDeps: tiny marker module (Minerva only)	*/
( function () {
	if ( mw.config.get( 'skin' ) !== 'minerva' ) return;
	if ( window.console && console.debug ) {
		console.debug( '[VEForAllMobileDeps] inline shim installé (head) ; module client chargé.' );
	}
}() );

