/*	Wikidébats — editForm (FormEdit uniquement) */
( function () {
	'use strict';

	var W = window;
	var D = document;
	var $ = jQuery;
	var $D = $( D );

	var WK = W.Wikidebates || ( W.Wikidebates = {} );

	function ensureSmwTooltips( root ) {
		var el = ( WK.wkRootNode ? WK.wkRootNode( root ) : ( root || D ) );
		try {
			if ( !el || !el.querySelector || !el.querySelector( '.logo-aide' ) ) return;
		} catch ( e ) { return; }

		mw.loader.using( 'ext.wikidebates.features.smwTooltips' ).then( function () {
			try {
				if ( typeof WK.wkReinitSMWTooltips === 'function' ) WK.wkReinitSMWTooltips( el );
			} catch ( e2 ) {}
		} );
	}

	function init() {
		try {
			if ( typeof WK.wkIsFormEdit === 'function' && !WK.wkIsFormEdit() ) return;
		} catch ( e ) {}

		if ( typeof WK.wkOnce === 'function' ) {
			if ( !WK.wkOnce( 'wk:editForm:init' ) ) return;
		}

/* ==========================================================
	Wikidébats — FormEdit : résumés automatiques (commun)
	MW 1.43 — indentation par tabulations
   ========================================================== */

/* =========================
	Utils
   ========================= */
function getSummaryField() {
	/*	Avec OOUI, #wpSummary peut être le conteneur du widget.
		Il faut retourner le véritable contrôle de formulaire. */
	return $(
		'#pfForm textarea[name="wpSummary"], ' +
		'#pfForm input[name="wpSummary"], ' +
		'textarea#wpSummary, input#wpSummary'
	).first();
}

function fireNativeInputEvent( el ) {
	if ( !el || !el.dispatchEvent ) return;

	el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
}

function ensureSummaryTextarea() {
	try {
		/*	PageForms rend maintenant directement un widget OOUI multiligne.
			Dans ce cas, #wpSummary désigne généralement le conteneur du widget,
			et le textarea réel est identifié par name="wpSummary". */
		var textarea = D.querySelector(
			'#pfForm textarea[name="wpSummary"], ' +
			'textarea#wpSummary[name="wpSummary"]'
		);

		if ( textarea ) {
			textarea.rows = 1;
			textarea.classList.add( 'autoGrow', 'pf-singleline-text', 'pf-summary-textarea' );

			/*	Initialise l’autogrow sur le vrai textarea si le module est disponible. */
			mw.loader.using( 'ext.pageforms.autogrow' ).then( function () {
				if (
					typeof $.fn.autoGrow === 'function' &&
					!textarea.classList.contains( 'pf-autogrow-initialized' )
				) {
					textarea.classList.add( 'pf-autogrow-initialized' );
					$( textarea ).autoGrow();
				}
				fireNativeInputEvent( textarea );
			} );
			return;
		}

		/*	Compatibilité avec une ancienne version de PageForms qui rend encore
			le résumé sous forme d’input. */
		var input = D.querySelector( '#wpSummary input.oo-ui-inputWidget-input' )
			|| D.querySelector( 'input[name="wpSummary"].oo-ui-inputWidget-input' )
			|| D.querySelector( 'input[name="wpSummary"]' );

		if ( !input || input.tagName.toLowerCase() !== 'input' ) return;
		if ( input.dataset && input.dataset.wkSummaryTextarea === '1' ) return;

		textarea = D.createElement( 'textarea' );
		textarea.name = input.name;
		textarea.id = input.id;
		textarea.title = input.title;
		textarea.accessKey = input.accessKey;
		textarea.className = ( input.className ? input.className : '' ) +
			' autoGrow pf-singleline-text pf-summary-textarea';
		textarea.tabIndex = input.tabIndex;
		textarea.placeholder = input.placeholder || '';
		textarea.value = input.value;
		textarea.rows = 1;

		if ( input.disabled ) textarea.disabled = true;
		if ( input.readOnly ) textarea.readOnly = true;
		if ( input.maxLength && input.maxLength > 0 ) textarea.maxLength = input.maxLength;

		textarea.dataset.wkSummaryTextarea = '1';

		if ( input.parentNode ) input.parentNode.replaceChild( textarea, input );

		mw.loader.using( 'ext.pageforms.autogrow' ).then( function () {
			if ( typeof $.fn.autoGrow === 'function' ) {
				textarea.classList.add( 'pf-autogrow-initialized' );
				$( textarea ).autoGrow();
			}
			fireNativeInputEvent( textarea );
		} );
	} catch ( e ) {}
}

function wkGetSelect2SelectedText( e ) {
	try {
		if ( e && e.params && e.params.data && typeof e.params.data.text === 'string' ) {
			return e.params.data.text;
		}
	} catch ( err ) {}
	return '';
}

function wkFindDisplayTitleFieldForPfTokens( $select ) {
	var paramName = 'titre-affiché';

	try {
		if ( typeof WK.wkParam === 'function' ) {
			paramName = WK.wkParam( 'wk-param-display-title', 'titre-affiché' );
		} else if ( typeof W.wkParam === 'function' ) {
			paramName = W.wkParam( 'wk-param-display-title', 'titre-affiché' );
		}
	} catch ( e ) {}

	var suffix = '[' + paramName + ']';
	var $inst = $select.closest(
		'.multipleTemplateInstance, .multipleTemplateInstanceTable, .pfTemplateWrapper, .instanceTemplateWrapper, table, fieldset'
	);

	if ( !$inst.length ) {
		var instEl = getInstanceContainerFromElement( $select.get( 0 ) );
		if ( instEl ) $inst = $( instEl );
	}

	if ( !$inst.length ) $inst = $select.closest( 'form' );

	var $field = $inst.find(
		'textarea[name$="' + suffix + '"], input[name$="' + suffix + '"]'
	).first();

	if ( $field.length ) return $field;

	var $siblingsField = $inst.siblings().find(
		'textarea[name$="' + suffix + '"], input[name$="' + suffix + '"]'
	).first();

	if ( $siblingsField.length ) return $siblingsField;

	var $wrapper = $select.closest( '.fieldBox, .instanceMain, .multipleTemplateWrapper, .multipleTemplateList' );
	if ( $wrapper.length ) {
		var $nearField = $wrapper.find(
			'textarea[name$="' + suffix + '"], input[name$="' + suffix + '"]'
		).first();
		if ( $nearField.length ) return $nearField;
	}

	var $tr = $select.closest( 'tr' );

	return $tr.nextAll( 'tr' ).find( 'textarea, input' ).filter( function () {
		var name = this.getAttribute( 'name' ) || '';
		return name.slice( -suffix.length ) === suffix;
	} ).first();
}

function wkBindCopyTitleFromPfTokens() {
	$D.off( 'select2:select.wkCopyTitleFromPfTokens' );

	$D.on( 'select2:select.wkCopyTitleFromPfTokens', '.zone-arguments .pfTokens', function ( e ) {
		var $select = $( this );
		var selectedText = ( wkGetSelect2SelectedText( e ) || '' ).trim();
		if ( !selectedText ) return;

		var $field = wkFindDisplayTitleFieldForPfTokens( $select );
		if ( !$field.length ) return;

		var currentValue = ( $field.val() || '' );
		if ( currentValue.trim() !== '' ) return;

		$field.val( selectedText ).trigger( 'input' ).trigger( 'change' );
	} );
}

/* =========================
	API : remplir résumé
   ========================= */

function fillEditSummary( message ) {
	if ( typeof message === 'undefined' || message === null ) return;

	var $input = getSummaryField();
	if ( !$input.length ) return;

	var summary = $input.val() || '';

	if ( summary ) {
		var condition = summary.substr( -3 );
		if ( condition === '*/ ' ) summary += message;
		else summary += ' + ' + message;
	} else {
		summary = message;
	}

	$input.val( summary );
	fireNativeInputEvent( $input.get( 0 ) );
}

/*	1) Protection Vector : si objet vide, on sort */
function fillEditSummaryForCheckbox( $object, addingMessage, removingMessage ) {
	if ( !$object || !$object.length ) return;

	var checked = $object.prop( 'checked' );
	var bannerName = $object.parent();
	bannerName = $( bannerName ).next();
	bannerName = $( bannerName ).text().replace( /^[\s\u00a0\u202f]+|[\s\u00a0\u202f]+$/g, '' );

	var actionDone = checked ? addingMessage : removingMessage;
	fillEditSummary( actionDone + ' ' + WK.wkMsg( 'wk-summary-quoted-value', bannerName ) );
}

/* =========================
	FormEdit : init commun
   ========================= */

function wkInitEditSummaries() {
	/*	Compat : si tu as déjà wkIsFormEdit()/wkOnce(), on s’appuie dessus */
	try {
		if ( typeof WK.wkIsFormEdit === 'function' && !WK.wkIsFormEdit() ) return;
	} catch ( e ) {}

	if ( typeof WK.wkOnce === 'function' ) {
		if ( !WK.wkOnce( 'wk:formedit:summaries:common' ) ) return;
	}

	ensureSummaryTextarea();
	wkBindCopyTitleFromPfTokens();

	/*	Préfix section : comme Vector/Minerva */
	( function () {
		var sectionValue = $( '#formName' ).data( 'section' );
		var $summaryField = getSummaryField();
		if ( $summaryField.length && ( $summaryField.val() || '' ).trim() === '' && sectionValue ) {
			$summaryField.val( '/* ' + sectionValue + ' */ ' );
			fireNativeInputEvent( $summaryField.get( 0 ) );
		}
	} )();

	/*	Zones (source unique) : clés i18n comme Vector
		4) Fix zone-references : labelAjoutKey corrigé
	*/
	var zones = [
		{ selector: '.zone-arguments-pour', labelReorgKey: 'wk-summary-reorg-arguments', labelRenomKey: 'wk-summary-rename-argument', labelSuppKey: 'wk-summary-delete-argument', labelAjoutKey: 'wk-summary-add-argument-existing' },
		{ selector: '.zone-arguments-contre', labelReorgKey: 'wk-summary-reorg-arguments', labelRenomKey: 'wk-summary-rename-argument', labelSuppKey: 'wk-summary-delete-argument', labelAjoutKey: 'wk-summary-add-argument-existing' },
		{ selector: '.zone-justifications', labelReorgKey: 'wk-summary-reorg-arguments', labelRenomKey: 'wk-summary-rename-argument', labelSuppKey: 'wk-summary-delete-argument', labelAjoutKey: 'wk-summary-add-argument-existing' },
		{ selector: '.zone-objections', labelReorgKey: 'wk-summary-reorg-arguments', labelRenomKey: 'wk-summary-rename-objection', labelSuppKey: 'wk-summary-delete-objection', labelAjoutKey: 'wk-summary-add-argument-existing' },
		{ selector: '.zone-introduction', labelReorgKey: 'wk-summary-reorg-sections', labelRenomKey: 'wk-summary-rename-section', labelSuppKey: 'wk-summary-delete-section', labelSuppBisKey: 'wk-summary-delete-section-untitled', labelAjoutKey: 'wk-summary-add-section' },
		{ selector: '.zone-voir-Wikipedia', labelReorgKey: 'wk-summary-reorg-articles', labelRenomKey: 'wk-summary-rename-article', labelSuppKey: 'wk-summary-delete-article', labelAjoutKey: 'wk-summary-add-wikipedia-article' },
		{ selector: '.zone-debats-connexes', labelReorgKey: 'wk-summary-reorg-debats', labelRenomKey: 'wk-summary-rename-debat', labelSuppKey: 'wk-summary-delete-debat', labelAjoutKey: 'wk-summary-add-debat' },
		{ selector: '.zone-interlangue', labelReorgKey: 'wk-summary-reorg-interlang', labelSuppKey: 'wk-summary-delete-interlang', labelAjoutKey: 'wk-summary-add-interlang', sectionKey: 'wk-summary-section-interlanguage-link', customSummary: true },
		{ selector: '.zone-citations', labelReorgKey: 'wk-summary-reorg-citations', labelSuppKey: 'wk-summary-delete-citation', labelSuppBisKey: 'wk-summary-delete-citation-generic', labelAjoutKey: 'wk-summary-add-citation' },
		{ selector: '.zone-references', labelReorgKey: 'wk-summary-reorg-references', labelSuppKey: 'wk-summary-delete-reference', labelSuppBisKey: 'wk-summary-delete-reference-generic', labelAjoutKey: 'wk-summary-add-reference' }
	];

	var zonesBySelector = Object.create( null );
	zones.forEach( function ( z ) { zonesBySelector[ z.selector ] = z; } );

	W.ajoutInstance = false;
	W.ajoutInstanceZone = null;

	function findZoneFromElement( el ) {
		for ( var i = 0; i < zones.length; i++ ) {
			if ( $( el ).closest( zones[ i ].selector ).length ) return zones[ i ];
		}
		return null;
	}

	function getInstanceContainerFromElement( el ) {
		if ( !el ) return null;

		var node = el.nodeType ? el : ( el.jquery ? el.get( 0 ) : null );
		if ( !node || !node.closest ) return null;

		var container = node.closest( '.multipleTemplateInstance, .multipleTemplateInstanceTable' );
		if ( container ) return container;

		container = node.closest( 'tr, fieldset, .pfTemplateWrapper, .instanceTemplateWrapper' );
		if ( container ) return container;

		container = node.closest( '.instanceMain, .fieldBox' );
		if ( container ) return container;

		return null;
	}

	function getInstanceFieldsRootFromElement( el ) {
		var container = getInstanceContainerFromElement( el );
		if ( !container || !container.querySelector ) return null;

		if (
			container.classList &&
			(
				container.classList.contains( 'multipleTemplateInstance' ) ||
				container.classList.contains( 'multipleTemplateInstanceTable' )
			)
		) {
			return container.querySelector( '.instanceMain' )
				|| container.querySelector( '.fieldBox' )
				|| container;
		}

		return container;
	}

	function getImportantFieldFromElement( el ) {
		var root = getInstanceFieldsRootFromElement( el );
		if ( !root || !root.querySelector ) return null;

		return root.querySelector( '.parametre-important' )
			|| root.querySelector( '.parametre-important-bis' )
			|| root.querySelector( 'textarea.parametre-important, input.parametre-important, textarea.parametre-important-bis, input.parametre-important-bis' );
	}

	function getTitreFromRemoveLink( linkEl ) {
		var input = getImportantFieldFromElement( linkEl );
		var titre = input && input.value ? input.value.trim() : '';
		return titre || null;
	}

	function getZoneInstanceElements( zoneSelector ) {
		var root = D.querySelector( zoneSelector );
		if ( !root ) return [];

		var list = Array.from(
			root.querySelectorAll(
				'.multipleTemplateInstance, .multipleTemplateInstanceTable'
			)
		);

		if ( list.length ) return list;

		return Array.from( root.querySelectorAll( 'tr' ) ).filter( function ( el ) {
			return !!el.querySelector( '.instanceRemove, .instanceRearranger, .parametre-important, .parametre-important-bis' );
		} );
	}

	function getInstanceOrderValue( el ) {
		if ( !el || !el.querySelector ) return ( el && el.textContent ? el.textContent.trim() : '' );

		var important = el.querySelector( '.parametre-important, .parametre-important-bis' );
		if ( important && important.value ) return important.value;

		var named = el.querySelector(
			'select[name*="[page]"], input[name*="[page]"], textarea[name*="[page]"], select[name*="[titre-affiché]"], input[name*="[titre-affiché]"], textarea[name*="[titre-affiché]"]'
		);
		if ( named && named.value ) return named.value;

		var field = el.querySelector( 'select, textarea, input:not([type="hidden"]):not([type="button"]):not([type="submit"])' );
		if ( field && typeof field.value === 'string' && field.value !== '' ) return field.value;

		return ( el.textContent || '' ).trim();
	}

	function arraysEqual( a, b ) {
		if ( a === b ) return true;
		if ( !a || !b || a.length !== b.length ) return false;
		for ( var i = 0; i < a.length; i++ ) if ( a[ i ] !== b[ i ] ) return false;
		return true;
	}

	function getOrdre( zoneSelector ) {
		return getZoneInstanceElements( zoneSelector ).map( function ( el ) {
			return getInstanceOrderValue( el );
		} );
	}

	function wkMsgSafe( key, param ) {
		/*	5) Suppression sans titre :
			- si pas de titre, éviter wkMsg( key, '' ) (message moche)
			- fallback : wk-summary-delete-generic si tu l’ajoutes, sinon wkMsg( key )
		*/
		try {
			if ( typeof WK.wkMsg !== 'function' ) return '';
			if ( typeof param === 'string' && param.trim() !== '' ) return WK.wkMsg( key, param );
			if ( typeof WK.wkMsg === 'function' ) {
				var generic = WK.wkMsg( 'wk-summary-delete-generic' );
				if ( generic && generic !== 'wk-summary-delete-generic' ) return generic;
			}
			return WK.wkMsg( key );
		} catch ( e ) {}
		return '';
	}

	/* =========================
		Résumés spécifiques : métadonnées d’argument
	========================= */

	var managedSummaryParts = [];
	var interlangStates = [];
	var interlangStateByElement = new WeakMap();

	function getControlValue( el ) {
		if ( !el ) return '';

		var value = $( el ).val();
		if ( Array.isArray( value ) ) value = value.length ? value[ 0 ] : '';

		return ( value === null || typeof value === 'undefined' ) ? '' : String( value ).trim();
	}

	function getPrimaryFieldFromZone( zoneSelector ) {
		var zone = D.querySelector( zoneSelector );
		if ( !zone ) return null;

		if ( zone.matches && zone.matches( 'input, textarea, select' ) ) return zone;

		var fields = zone.querySelectorAll( 'input, textarea, select' );
		for ( var i = 0; i < fields.length; i++ ) {
			var field = fields[ i ];
			var type = ( field.getAttribute( 'type' ) || '' ).toLowerCase();

			if (
				type === 'hidden' ||
				type === 'button' ||
				type === 'submit' ||
				type === 'reset' ||
				type === 'checkbox' ||
				type === 'radio' ||
				field.name === 'wpSummary'
			) {
				continue;
			}

			return field;
		}

		return null;
	}

	function formatSectionText( sectionKey, message ) {
		if ( D.getElementById( 'formName' ) ) return message;

		return '/* ' + WK.wkMsg( sectionKey ) + ' */ ' + message;
	}

	function formatSectionSummary( sectionKey, messageKey, value ) {
		return formatSectionText( sectionKey, WK.wkMsg( messageKey, value ) );
	}

	function setManagedSummaryParts( parts ) {
		var $summary = getSummaryField();
		if ( !$summary.length ) return;

		var current = $summary.val() || '';

		managedSummaryParts.forEach( function ( part ) {
			if ( current === part ) {
				current = '';
				return;
			}

			if ( current.indexOf( part + ' + ' ) === 0 ) {
				current = current.slice( part.length + 3 );
				return;
			}

			/*	Si #formName existe, le résumé peut déjà commencer par un
				préfixe de section. La première action gérée est alors collée
				directement après ce préfixe, sans séparateur « + ». */
			var sectionEnd = current.indexOf( '*/ ' );
			if ( sectionEnd !== -1 ) {
				var sectionActionStart = sectionEnd + 3;
				if ( current.slice( sectionActionStart, sectionActionStart + part.length ) === part ) {
					var sectionActionEnd = sectionActionStart + part.length;

					if ( current.slice( sectionActionEnd, sectionActionEnd + 3 ) === ' + ' ) {
						current = current.slice( 0, sectionActionStart ) + current.slice( sectionActionEnd + 3 );
					} else if ( sectionActionEnd === current.length ) {
						current = current.slice( 0, sectionActionStart );
					}
					return;
				}
			}

			var middle = ' + ' + part + ' + ';
			if ( current.indexOf( middle ) !== -1 ) {
				current = current.replace( middle, ' + ' );
				return;
			}

			var end = ' + ' + part;
			if ( current.slice( -end.length ) === end ) {
				current = current.slice( 0, -end.length );
			}
		} );

		var next = current;
		parts.forEach( function ( part ) {
			if ( !next ) {
				next = part;
			} else if ( next.slice( -3 ) === '*/ ' ) {
				next += part;
			} else {
				next += ' + ' + part;
			}
		} );

		managedSummaryParts = parts.slice();

		if ( next === current ) return;

		$summary.val( next );
		fireNativeInputEvent( $summary.get( 0 ) );
	}

	var singleValueSummaryZones = [
		{
			selector: '.zone-nom-consacre',
			sectionKey: 'wk-summary-section-established-name',
			addKey: 'wk-summary-established-name-add',
			modifyKey: 'wk-summary-established-name-modify',
			deleteKey: 'wk-summary-established-name-delete'
		},
		{
			selector: '.zone-debat-dedie',
			sectionKey: 'wk-summary-section-dedicated-debate',
			addKey: 'wk-summary-dedicated-debate-add',
			modifyKey: 'wk-summary-dedicated-debate-modify',
			deleteKey: 'wk-summary-dedicated-debate-delete'
		},
		{
			selector: '.zone-sujet-debat',
			sectionKey: 'wk-summary-section-debate-subject',
			addKey: 'wk-summary-subject-add',
			modifyKey: 'wk-summary-subject-mod',
			deleteKey: 'wk-summary-subject-delete'
		},
		{
			selector: '.zone-sujet-developpe',
			sectionKey: 'wk-summary-section-developed-subject',
			addKey: 'wk-summary-developed-subject-add',
			modifyKey: 'wk-summary-developed-subject-modify',
			deleteKey: 'wk-summary-developed-subject-delete'
		}
	];

	singleValueSummaryZones.forEach( function ( config ) {
		config.field = getPrimaryFieldFromZone( config.selector );
		config.initialValue = getControlValue( config.field );
	} );

	var progressField = D.querySelector( '.zone-bandeaux select' );
	var progressInitialValue = getControlValue( progressField );

	function getInterlangFields( container ) {
		if ( !container || !container.querySelectorAll ) return { language: null, page: null };

		var root = getInstanceFieldsRootFromElement( container ) || container;
		var selects = Array.from( root.querySelectorAll( 'select' ) );
		var language = null;
		var page = root.querySelector( 'select.pfTokens, input.pfTokens, textarea.pfTokens' );

		if ( page && selects.indexOf( page ) !== -1 ) {
			language = selects.find( function ( select ) { return select !== page; } ) || null;
		} else {
			language = selects.length ? selects[ 0 ] : null;
			if ( !page && selects.length > 1 ) page = selects[ 1 ];
		}

		if ( !page ) {
			var fields = Array.from( root.querySelectorAll( 'input, textarea' ) ).filter( function ( field ) {
				var type = ( field.getAttribute( 'type' ) || '' ).toLowerCase();
				return type !== 'hidden' && type !== 'button' && type !== 'submit' && type !== 'reset';
			} );

			page = fields.length ? fields[ fields.length - 1 ] : null;
		}

		return { language: language, page: page };
	}

	function getInterlangData( container ) {
		var fields = getInterlangFields( container );

		return {
			language: getControlValue( fields.language ),
			page: getControlValue( fields.page )
		};
	}

	function registerInterlangInstance( container, isInitial ) {
		if ( !container ) return null;

		var existing = interlangStateByElement.get( container );
		if ( existing ) return existing;

		var current = getInterlangData( container );
		var state = {
			element: container,
			initial: isInitial ? current : { language: '', page: '' },
			removed: false
		};

		interlangStates.push( state );
		interlangStateByElement.set( container, state );

		return state;
	}

	function formatInterlangLink( data ) {
		if ( !data || !data.language || !data.page ) return '';

		return '[[:' + data.language + ':' + data.page + '|' + data.page + ']]';
	}

	function recomputeManagedSummaries() {
		var parts = [];

		singleValueSummaryZones.forEach( function ( config ) {
			if ( !config.field ) return;

			var initial = config.initialValue;
			var current = getControlValue( config.field );

			if ( initial === current ) return;

			if ( initial === '' && current !== '' ) {
				parts.push( formatSectionSummary( config.sectionKey, config.addKey, current ) );
			} else if ( initial !== '' && current === '' ) {
				parts.push( formatSectionSummary( config.sectionKey, config.deleteKey, initial ) );
			} else if ( current !== '' ) {
				parts.push( formatSectionSummary( config.sectionKey, config.modifyKey, current ) );
			}
		} );

		if ( progressField ) {
			var progressCurrentValue = getControlValue( progressField );
			if ( progressCurrentValue !== progressInitialValue ) {
				parts.push( formatSectionSummary(
					'wk-summary-section-warning-banners',
					'wk-summary-progress-change',
					progressCurrentValue
				) );
			}
		}

		interlangStates.forEach( function ( state ) {
			var initial = state.initial;
			var current = state.removed ? { language: '', page: '' } : getInterlangData( state.element );
			var initialLink = formatInterlangLink( initial );
			var currentLink = formatInterlangLink( current );

			if ( !initialLink && currentLink ) {
				parts.push( formatSectionSummary(
					'wk-summary-section-interlanguage-link',
					'wk-summary-interlanguage-page-add',
					currentLink
				) );
			} else if ( initialLink && !currentLink ) {
				parts.push( formatSectionSummary(
					'wk-summary-section-interlanguage-link',
					'wk-summary-interlanguage-page-delete',
					initialLink
				) );
			} else if (
				initialLink &&
				currentLink &&
				(
					initial.language !== current.language ||
					initial.page !== current.page
				)
			) {
				parts.push( formatSectionSummary(
					'wk-summary-section-interlanguage-link',
					'wk-summary-interlanguage-page-modify',
					currentLink
				) );
			}
		} );

		setManagedSummaryParts( parts );
	}

	/*	Page Forms peut imbriquer .multipleTemplateInstanceTable et
		.multipleTemplateInstance pour une même ligne. On initialise donc
		les états interlangues à partir du champ pfTokens réel afin de ne
		pas enregistrer deux fois la même instance. */
	( function () {
		var zone = D.querySelector( '.zone-interlangue' );
		var containers = [];

		if ( zone ) {
			Array.from( zone.querySelectorAll( 'select.pfTokens, input.pfTokens, textarea.pfTokens' ) ).forEach( function ( field ) {
				var container = getInstanceContainerFromElement( field );
				if ( container && containers.indexOf( container ) === -1 ) containers.push( container );
			} );
		}

		if ( !containers.length ) containers = getZoneInstanceElements( '.zone-interlangue' );

		containers.forEach( function ( container ) {
			registerInterlangInstance( container, true );
		} );
	} )();

	/*	Nettoyage namespaces (sécurité double init) */
	$D.off( '.wkSummaryPF' );
	$D.off( '.wkSummaryReorder' );
	$D.off( '.wkSummaryCheckbox' );
	$D.off( '.wkSumSelect2' );
	$D.off( '.wkSummaryCustom' );
	$D.off( '.wkTokenRemove' );
	$D.off( 'click.wkKeywordRemove' );
	$D.off( 'change.wkProgress' );
	$D.off( 'click.wkResumeOps' );

	/*	3) PF remove : stratégie Minerva (capture + pas de preventDefault) */
	D.addEventListener( 'click', function ( e ) {
		var a = e.target && e.target.closest ? e.target.closest( '.instanceRemove a' ) : null;
		if ( !a ) return;

		var zone = findZoneFromElement( a );
		if ( !zone ) return;
		if ( zone.customSummary ) return;

		var titre = getTitreFromRemoveLink( a );
		if ( !titre ) return;
		var msg = '';

		if ( titre ) {
			var input = getImportantFieldFromElement( a );
			var isBis = !!( input && input.classList && input.classList.contains( 'parametre-important-bis' ) );

			var key = isBis ? ( zone.labelSuppBisKey || zone.labelSuppKey ) : zone.labelSuppKey;
			msg = wkMsgSafe( key, titre );
		} else {
			msg = zone.labelSuppBisKey ? wkMsgSafe( zone.labelSuppBisKey ) : wkMsgSafe( zone.labelSuppKey );
		}

		setTimeout( function () { fillEditSummary( msg ); }, 0 );
	}, true );

	/*	3) PF add : stratégie Minerva (pas de preventDefault) */
	$D.on( 'click.wkSummaryPF', '.instanceAddAbove a, .multipleTemplateAdder', function () {
		var zone = findZoneFromElement( this );
		if ( !zone ) return;

		if ( zone.customSummary ) {
			W.ajoutInstance = false;
			W.ajoutInstanceZone = null;
			return;
		}

		if (
			zone.selector === '.zone-introduction' ||
			zone.selector === '.zone-citations' ||
			zone.selector === '.zone-references'
		) {
			W.ajoutInstance = false;
			W.ajoutInstanceZone = null;
			setTimeout( function () { fillEditSummary( WK.wkMsg( zone.labelAjoutKey ) ); }, 0 );
		} else {
			W.ajoutInstance = true;
			W.ajoutInstanceZone = zone.selector;
		}
	} );

	/*	Rename : blur sur titres */
	$D.on( 'blur.wkSummaryPF', '.parametre-important, .parametre-important-bis', function () {
		var zone = findZoneFromElement( this );
		if ( !zone || !zone.labelRenomKey ) return;

		var value = ( this.value || '' ).trim();
		if ( !value ) return;

		fillEditSummary( WK.wkMsg( zone.labelRenomKey, value ) );
	} );

	/*	Reorder : détection (bonus Minerva) */
	var reorderState = Object.create( null );
	var activeReorderZone = null;

	$D.on( 'mousedown.wkSummaryReorder touchstart.wkSummaryReorder', '.instanceRearranger', function () {
		var zone = findZoneFromElement( this );
		if ( !zone ) return;

		activeReorderZone = zone.selector;

		if ( !reorderState[ zone.selector ] ) {
			reorderState[ zone.selector ] = { ordreInitial: [], done: false, active: false };
		}

		reorderState[ zone.selector ].ordreInitial = getOrdre( zone.selector );
		reorderState[ zone.selector ].done = false;
		reorderState[ zone.selector ].active = true;
	} );

	$D.on( 'mouseup.wkSummaryReorder touchend.wkSummaryReorder', function () {
		var zoneSelector = activeReorderZone;
		if ( !zoneSelector ) return;

		var zone = zonesBySelector[ zoneSelector ];
		var st = reorderState[ zoneSelector ];

		activeReorderZone = null;

		if ( !zone || !st || !st.active || st.done ) return;

		var ordreFinal = getOrdre( zoneSelector );
		if ( !arraysEqual( st.ordreInitial, ordreFinal ) ) {
			var reorgMessage = WK.wkMsg( zone.labelReorgKey );
			if ( zone.sectionKey ) reorgMessage = formatSectionText( zone.sectionKey, reorgMessage );
			fillEditSummary( reorgMessage );
			st.done = true;
		}
		st.active = false;
	} );

	/*	Select2 : ajout d’une instance existante */
	$D.on( 'select2:select.wkSumSelect2', 'select', function ( e ) {
		if ( !e || !e.params || !e.params.data ) return;
		if ( $( this ).closest( '.zone-nom-consacre, .zone-debat-dedie, .zone-sujet-debat, .zone-sujet-developpe, .zone-interlangue' ).length ) return;

		var match = ( e.params.data.text || '' ).trim();
		if ( !match ) return;

		var msg;

		if ( W.ajoutInstance && W.ajoutInstanceZone ) {
			var z = zonesBySelector[ W.ajoutInstanceZone ];
			if ( z && z.labelAjoutKey ) msg = WK.wkMsg( z.labelAjoutKey, match );
			else msg = WK.wkMsg( 'wk-summary-add-generic', match );

			W.ajoutInstance = false;
			W.ajoutInstanceZone = null;
		} else {
			msg = WK.wkMsg( 'wk-summary-add-generic', match );
		}

		if ( $( this ).closest( '.zone-mots-cles' ).length ) {
			msg = formatSectionText( 'wk-summary-section-keywords', msg );
		}

		fillEditSummary( msg );
	} );

	/*	Nom consacré / débat dédié / interlangue : résumés fondés sur l’état initial. */
	$D.on(
		'input.wkSummaryCustom change.wkSummaryCustom blur.wkSummaryCustom select2:select.wkSummaryCustom select2:unselect.wkSummaryCustom select2:clear.wkSummaryCustom',
		'input, textarea, select',
		function () {
			var $field = $( this );

			if ( $field.closest( '.zone-interlangue' ).length ) {
				var container = getInstanceContainerFromElement( this );
				if ( container ) registerInterlangInstance( container, false );
				recomputeManagedSummaries();
				return;
			}

			if ( $field.closest( '.zone-nom-consacre, .zone-debat-dedie, .zone-sujet-debat, .zone-sujet-developpe' ).length ) {
				recomputeManagedSummaries();
			}
		}
	);

	D.addEventListener( 'click', function ( e ) {
		var a = e.target && e.target.closest ? e.target.closest( '.instanceRemove a' ) : null;
		if ( !a || !$( a ).closest( '.zone-interlangue' ).length ) return;

		var container = getInstanceContainerFromElement( a );
		if ( !container ) return;

		var state = registerInterlangInstance( container, false );
		if ( !state ) return;

		state.removed = true;
		setTimeout( recomputeManagedSummaries, 0 );
	}, true );

	/*	Checkboxes avertissements / rubriques */
	$D.on( 'click.wkSummaryCheckbox', '.zone-bandeaux .checkboxesSpan .oo-ui-inputWidget-input', function () {
		fillEditSummaryForCheckbox(
			$( this ),
			formatSectionText( 'wk-summary-section-warning-banners', WK.wkMsg( 'wk-summary-warning-add' ) ),
			formatSectionText( 'wk-summary-section-warning-banners', WK.wkMsg( 'wk-summary-warning-remove' ) )
		);
	} );

	$D.on( 'click.wkSummaryCheckbox', '.checkboxesSpan .oo-ui-inputWidget-input', function () {
		if ( $( this ).closest( '.zone-rubriques, .zone-bandeaux' ).length === 0 ) {
			fillEditSummaryForCheckbox( $( this ), WK.wkMsg( 'wk-summary-warning-add' ), WK.wkMsg( 'wk-summary-warning-remove' ) );
		}
	} );

	$D.on( 'click.wkSummaryCheckbox', '.zone-rubriques .oo-ui-inputWidget-input', function () {
		fillEditSummaryForCheckbox(
			$( this ),
			formatSectionText( 'wk-summary-section-general-sections', WK.wkMsg( 'wk-summary-rubrique-add' ) ),
			formatSectionText( 'wk-summary-section-general-sections', WK.wkMsg( 'wk-summary-rubrique-remove' ) )
		);
	} );

	/*	Niveau d’avancement : résumé fondé sur l’état initial. */
	$D.on( 'change.wkProgress', '.zone-bandeaux select', function () {
		if ( this !== progressField ) return;
		recomputeManagedSummaries();
	} );

	/*	Tokens Select2 : suppression.
		On écoute select2:unselect sur le champ source plutôt que le clic sur
		.select2-selection__choice__remove : on connaît ainsi toujours la zone
		d’origine et une seule logique produit le résumé. */
	$D.on( 'select2:unselect.wkTokenRemove', 'select, input', function ( e ) {
		var $field = $( this );

		/*	Ces zones sont déjà gérées par recomputeManagedSummaries(). */
		if ( $field.closest( '.zone-debat-dedie, .zone-sujet-debat, .zone-interlangue' ).length ) return;

		var removed = '';
		try {
			removed = e && e.params && e.params.data && typeof e.params.data.text === 'string'
				? e.params.data.text.trim()
				: '';
		} catch ( err ) {}

		if ( !removed ) return;

		var msg = WK.wkMsg( 'wk-summary-keyword-remove', removed );
		if ( $field.closest( '.zone-mots-cles' ).length ) {
			msg = formatSectionText( 'wk-summary-section-keywords', msg );
		}

		fillEditSummary( msg );
	} );

	/*	Sujet complet : logique Vector conservée */
	( function () {
		var $summary = getSummaryField();
		var sujetCompletInitial = $( '.zone-sujet-complet' ).val() || '';

		$D.on( 'change.wkSubjectFull1', '.zone-sujet-complet', function () {
			var sujetCompletActuel = $( this ).val() || '';
			var ajoutOuModification = '';

			if ( sujetCompletInitial === '' && sujetCompletActuel !== '' ) {
				ajoutOuModification = WK.wkMsg( 'wk-summary-subject-add', sujetCompletActuel );
			} else if ( sujetCompletInitial !== '' && sujetCompletActuel !== '' && sujetCompletInitial !== sujetCompletActuel ) {
				ajoutOuModification = WK.wkMsg( 'wk-summary-subject-mod', sujetCompletActuel );
			}

			if ( ajoutOuModification ) {
				$summary.val( '/* Sujet du débat */ ' + ajoutOuModification );
				fireNativeInputEvent( $summary.get( 0 ) );
			}
		} );
	} )();

	/*	Bouton "resume-modifications" : logique Vector conservée */
	$D.on( 'click.wkResumeOps', '.resume-modifications', function () {
		var $summary = getSummaryField();
		if ( !$summary.length ) return;

		var summary = $summary.val() || '';
		var newSummary = ( $( this ).text() || '' ).trim();

		if ( !newSummary ) return;

		if ( summary ) {
			var condition = summary.substr( -3 );
			if ( condition === '*/ ' ) summary += newSummary;
			else summary += ' + ' + newSummary;
		} else {
			summary = newSummary;
		}

		$summary.val( summary );
		fireNativeInputEvent( $summary.get( 0 ) );
	} );
}

/* ==========================================================
	Divers
   ========================================================== */

		function wkHideTitlebarOnAutoEval() {
			try {
				if ( !WK.wkIsNs || !WK.wkIsNs( -1 ) ) return;
				if ( !D.body || !D.body.classList.contains( 'mw-special-FormEdit' ) ) return;
				if ( !D.body.classList.contains( 'action-view' ) ) return;
				if ( !D.querySelector( '#accepte-autoevaluation' ) ) return;
			} catch ( e ) { return; }

			/*	Minerva */
			var titlebar = D.querySelector( '.page-heading' );
			if ( titlebar ) {
				titlebar.style.display = 'none';
				return;
			}

			/*	Vector */
			titlebar = D.querySelector( '.mw-body-header.vector-page-titlebar' )
				|| D.querySelector( '.mw-page-container-inner .vector-page-titlebar' )
				|| D.querySelector( '.mw-body-header' );
			if ( titlebar ) titlebar.style.display = 'none';
		}

		/*	Init FormEdit (module séparé) */
		try { wkInitEditSummaries(); } catch ( e2 ) {}

		/*	SMW tooltips : lazy (si présent sur le formulaire) */
		try { ensureSmwTooltips( D ); } catch ( e3 ) {}

		/*	autogrow initial + contenus dynamiques */
		wkHideTitlebarOnAutoEval();

		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			wkHideTitlebarOnAutoEval();
			var root = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			try { ensureSmwTooltips( root ); } catch ( e6 ) {}
		} );
	}

	init();

}() );
