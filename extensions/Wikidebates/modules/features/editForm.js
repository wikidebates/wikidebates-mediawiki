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
	return $( '#wpSummary' );
}

function fireNativeInputEvent( el ) {
	if ( !el || !el.dispatchEvent ) return;

	el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
}

function ensureSummaryTextarea() {
	try {
		var input = D.querySelector( '#wpSummary input.oo-ui-inputWidget-input' )
			|| D.querySelector( 'input[name=wpSummary].oo-ui-inputWidget-input' )
			|| D.querySelector( 'input[name=wpSummary]' );

		if ( !input || input.tagName.toLowerCase() !== 'input' ) return;
		if ( input.dataset && input.dataset.wkSummaryTextarea === '1' ) return;

		var textarea = D.createElement( 'textarea' );
		textarea.name = input.name;
		textarea.id = input.id;
		textarea.title = input.title;
		textarea.accessKey = input.accessKey;
		textarea.className = ( input.className ? input.className : '' ) + ' autoGrow pf-singleline-text';
		textarea.tabIndex = input.tabIndex;
		textarea.placeholder = input.placeholder || '';
		textarea.value = input.value;
		textarea.rows = 1;

		if ( input.disabled ) textarea.disabled = true;
		if ( input.readOnly ) textarea.readOnly = true;
		if ( input.maxLength && input.maxLength > 0 ) textarea.maxLength = input.maxLength;

		textarea.dataset.wkSummaryTextarea = '1';

		if ( input.parentNode ) input.parentNode.replaceChild( textarea, input );
		$( textarea ).trigger( 'input' );
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
	bannerName = $( bannerName ).text() + ' »';

	var actionDone = checked ? ( addingMessage + ' «' ) : ( removingMessage + ' «' );
	fillEditSummary( actionDone + bannerName );
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
		{ selector: '.zone-interlangue', labelReorgKey: 'wk-summary-reorg-interlang', labelSuppKey: 'wk-summary-delete-interlang', labelAjoutKey: 'wk-summary-add-interlang' },
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

	/*	Nettoyage namespaces (sécurité double init) */
	$D.off( '.wkSummaryPF' );
	$D.off( '.wkSummaryReorder' );
	$D.off( '.wkSummaryCheckbox' );
	$D.off( '.wkSumSelect2' );
	$D.off( 'click.wkKeywordRemove' );
	$D.off( 'change.wkProgress' );
	$D.off( 'click.wkResumeOps' );

	/*	3) PF remove : stratégie Minerva (capture + pas de preventDefault) */
	D.addEventListener( 'click', function ( e ) {
		var a = e.target && e.target.closest ? e.target.closest( '.instanceRemove a' ) : null;
		if ( !a ) return;

		var zone = findZoneFromElement( a );
		if ( !zone ) return;

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
			fillEditSummary( WK.wkMsg( zone.labelReorgKey ) );
			st.done = true;
		}
		st.active = false;
	} );

	/*	Select2 : ajout d’une instance existante */
	$D.on( 'select2:select.wkSumSelect2', 'select', function ( e ) {
		if ( !e || !e.params || !e.params.data ) return;

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

		fillEditSummary( msg );
	} );

	/*	Checkboxes avertissements / rubriques */
	$D.on( 'click.wkSummaryCheckbox', '.checkboxesSpan .oo-ui-inputWidget-input', function () {
		if ( $( this ).closest( '.zone-rubriques' ).length === 0 ) {
			fillEditSummaryForCheckbox( $( this ), WK.wkMsg( 'wk-summary-warning-add' ), WK.wkMsg( 'wk-summary-warning-remove' ) );
		}
	} );

	$D.on( 'click.wkSummaryCheckbox', '.zone-rubriques .oo-ui-inputWidget-input', function () {
		fillEditSummaryForCheckbox( $( this ), WK.wkMsg( 'wk-summary-rubrique-add' ), WK.wkMsg( 'wk-summary-rubrique-remove' ) );
	} );

	/*	Progress/bandeaux */
	$D.on( 'change.wkProgress', '.mw-special-FormEdit .zone-bandeaux .mandatoryField', function () {
		var bannerName = $( '.zone-bandeaux select.mandatoryField option:selected' ).val();
		fillEditSummary( WK.wkMsg( 'wk-summary-progress-change', bannerName ) );
	} );

	/*	Keywords : retrait d’un tag (Select2 UI) */
	$D.on( 'click.wkKeywordRemove', '.select2-selection__choice__remove', function () {
		var $li = $( this ).closest( '.select2-selection__choice' );
		var keyword = ( $li.find( '.select2-match-entire' ).text() || '' ).trim();
		if ( keyword ) fillEditSummary( WK.wkMsg( 'wk-summary-keyword-remove', keyword ) );
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
