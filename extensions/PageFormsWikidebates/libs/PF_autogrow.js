/**
 * PF_autogrow.js
 *
 * Autogrow moderne pour textarea, basé sur scrollHeight.
 *
 * @author Jevin O. Sewaruth
 * @author Yaron Koren
 */

function autoGrowSetDefaultValues( textArea ) {
	if ( !textArea.dataset.pfAutoGrowMinHeight ) {
		textArea.style.height = 'auto';
		textArea.dataset.pfAutoGrowMinHeight = textArea.scrollHeight;
	}
}

function autoGrow( textArea ) {
	const minHeight = parseFloat( textArea.dataset.pfAutoGrowMinHeight ) || 0;

	textArea.style.height = 'auto';
	textArea.style.overflowY = 'hidden';
	textArea.style.height = Math.max( textArea.scrollHeight, minHeight ) + 'px';
}

function autoGrowBindEvents( textArea ) {
	textArea.addEventListener( 'input', function () {
		autoGrow( textArea );
	} );

	if ( textArea.classList.contains( 'pf-singleline-text' ) ) {
		textArea.addEventListener( 'keydown', function( e ) {
			if ( e.key === 'Enter' ) {
				e.preventDefault();
			}
		} );

		textArea.addEventListener( 'paste', function( e ) {
			const clipboard = e.clipboardData || window.clipboardData;
			const text = clipboard ? clipboard.getData( 'text' ) : '';

			if ( text.indexOf( '\n' ) !== -1 || text.indexOf( '\r' ) !== -1 ) {
				e.preventDefault();

				const normalizedText = text.replace( /[\r\n]+/g, ' ' );

				if ( document.execCommand ) {
					document.execCommand( 'insertText', false, normalizedText );
				}
			}
		} );
	}
}

jQuery.fn.autoGrow = function() {
	return this.each( function() {
		autoGrowSetDefaultValues( this );
		autoGrowBindEvents( this );
		autoGrow( this );
	} );
};
