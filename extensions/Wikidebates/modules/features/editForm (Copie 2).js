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

var wkAutoGrowIdleScheduled = 0;
var wkAutoGrowPendingRoot = null;

function wkAutoGrowTextareasScan( $root ) {
	$root.find( '#pfForm textarea.autoGrow' ).each( function () {
		if ( this.dataset && this.dataset.wkAutogrow === '1' ) return;
		if ( this.dataset ) this.dataset.wkAutogrow = '1';

		this.rows = 1;
		this.style.height = 'auto';
		this.style.height = this.scrollHeight + 'px';
	} );
}

function wkAutoGrowSchedule( root ) {
	wkAutoGrowPendingRoot = root || wkAutoGrowPendingRoot || D;

	if ( wkAutoGrowIdleScheduled ) return;
	wkAutoGrowIdleScheduled = 1;

	wkIdle( function () {
		wkAutoGrowIdleScheduled = 0;
		var r = wkAutoGrowPendingRoot || D;
		wkAutoGrowPendingRoot = null;
		wkAutoGrowTextareasScan( $( r ) );
	} );
}

function wkBindAutoGrow() {
	if ( !wkOnce( 'wkAutogrowInit' ) ) return;

	$D.on( 'pfaddinstance pfafterrebuild pfcreateinput', function ( e ) {
		var root = e && e.target ? e.target : D;
		wkAutoGrowSchedule( root );
	} );
}

function wkRunIdle( fn ) {
	try {
		if ( typeof W.wkIdle === 'function' ) return W.wkIdle( fn );
		if ( typeof WK.wkIdle === 'function' ) return WK.wkIdle( fn );
		if ( typeof W.requestIdleCallback === 'function' ) return W.requestIdleCallback( fn );
	} catch ( e ) {}
	return setTimeout( fn, 0 );
}

function autoResize( el ) {
	if ( !el || !el.style ) return;
	el.style.height = 'auto';
	el.style.height = el.scrollHeight + 'px';
}

function getSummaryField() {
	/*	Input OU textarea (Vector + Minerva) */
	return $( 'input[name=wpSummary], textarea[name=wpSummary]' );
}

function ensureSummaryTextarea() {
	/*	Adopte la solution Minerva sur desktop aussi :
		- remplace l’input OOUI de résumé par un textarea auto-resize (si présent)
		- sinon ne fait rien
	*/
	try {
		var input = D.querySelector( '#wpSummary input.oo-ui-inputWidget-input' )
			|| D.querySelector( 'input[name=wpSummary].oo-ui-inputWidget-input' )
			|| D.querySelector( 'input[name=wpSummary]' );

		if ( !input || input.tagName.toLowerCase() !== 'input' ) return;

		/*	Évite de remplacer si déjà textarea ou déjà remplacé */
		if ( input.dataset && input.dataset.wkSummaryTextarea === '1' ) return;

		var textarea = D.createElement( 'textarea' );
		textarea.name = input.name;
		textarea.id = input.id;
		textarea.title = input.title;
		textarea.accessKey = input.accessKey;
		textarea.className = ( input.className ? input.className : '' ) + ' auto-resize-textarea';
		textarea.tabIndex = input.tabIndex;
		textarea.placeholder = input.placeholder || '';
		textarea.value = input.value;

		textarea.dataset.wkSummaryTextarea = '1';

		if ( input.parentNode ) input.parentNode.replaceChild( textarea, input );

		autoResize( textarea );
		textarea.addEventListener(
			'input',
			function () { autoResize( this ); },
			{ passive: true }
		);
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

	var $inst = $select.closest(
		'.multipleTemplateInstance, .multipleTemplate, .pfTemplateWrapper, .instanceTemplateWrapper, table, fieldset'
	);
	if ( !$inst.length ) $inst = $select.closest( 'form' );

	var suffix = '[' + paramName + ']';

	var $field = $inst.find(
		'textarea[name$="' + suffix + '"], input[name$="' + suffix + '"]'
	).first();

	if ( $field.length ) return $field;

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

	var el = $input.get( 0 );
	if (
		el &&
		el.tagName &&
		el.tagName.toLowerCase() === 'textarea' &&
		el.classList &&
		el.classList.contains( 'auto-resize-textarea' )
	) {
		autoResize( el );
	}
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

	wkBindCopyTitleFromPfTokens();

	/*	2) auto-resize Minerva sur Vector (donc partout) */
	wkRunIdle( ensureSummaryTextarea );

	/*	Préfix section : comme Vector/Minerva */
	( function () {
		var sectionValue = $( '#formName' ).data( 'section' );
		var $summaryField = getSummaryField();
		if ( $summaryField.length && ( $summaryField.val() || '' ).trim() === '' && sectionValue ) {
			$summaryField.val( '/* ' + sectionValue + ' */ ' );
			var el = $summaryField.get( 0 );
			if ( el && el.tagName && el.tagName.toLowerCase() === 'textarea' ) autoResize( el );
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

	function getTitreFromRemoveLink( linkEl ) {
		var row = linkEl.closest( 'tr' );
		if ( !row ) return null;

		var input = row.querySelector( '.parametre-important' ) || row.querySelector( '.parametre-important-bis' );
		var titre = input && input.value ? input.value.trim() : '';
		return titre || null;
	}

	function arraysEqual( a, b ) {
		if ( a === b ) return true;
		if ( !a || !b || a.length !== b.length ) return false;
		for ( var i = 0; i < a.length; i++ ) if ( a[ i ] !== b[ i ] ) return false;
		return true;
	}

	function getOrdre( zoneSelector ) {
		return Array.from(
			D.querySelectorAll( zoneSelector + ' .multipleTemplateInstance' )
		).map( function ( el ) {
			var input = el.querySelector( 'select, input' );
			return input && input.value ? input.value : ( el.textContent || '' ).trim();
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
		var msg = '';

		if ( titre ) {
			var row = a.closest( 'tr' );
			var input = row ? ( row.querySelector( '.parametre-important' ) || row.querySelector( '.parametre-important-bis' ) ) : null;
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

	$D.on( 'mousedown.wkSummaryReorder touchstart.wkSummaryReorder', '.instanceRearranger', function () {
		var zone = findZoneFromElement( this );
		if ( !zone ) return;

		if ( !reorderState[ zone.selector ] ) reorderState[ zone.selector ] = { ordreInitial: [], done: false, active: false };

		reorderState[ zone.selector ].ordreInitial = getOrdre( zone.selector );
		reorderState[ zone.selector ].active = true;
	} );

	$D.on( 'mouseup.wkSummaryReorder touchend.wkSummaryReorder', function ( e ) {
		var zone = findZoneFromElement( e.target );
		if ( !zone ) return;

		var st = reorderState[ zone.selector ];
		if ( !st || !st.active || st.done ) return;

		var ordreFinal = getOrdre( zone.selector );
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
				var el = $summary.get( 0 );
				if ( el && el.tagName && el.tagName.toLowerCase() === 'textarea' ) autoResize( el );
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

		var el = $summary.get( 0 );
		if ( el && el.tagName && el.tagName.toLowerCase() === 'textarea' ) autoResize( el );
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
		try { wkBindAutoGrow(); } catch ( e1 ) {}
		try { wkInitEditSummaries(); } catch ( e2 ) {}

		/*	SMW tooltips : lazy (si présent sur le formulaire) */
		try { ensureSmwTooltips( D ); } catch ( e3 ) {}

		/*	autogrow initial + contenus dynamiques */
		try { wkAutoGrowTextareasScan( $( D ) ); } catch ( e4 ) {}

		wkHideTitlebarOnAutoEval();

		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			wkHideTitlebarOnAutoEval();
			var root = ( $content && $content[ 0 ] ) ? $content[ 0 ] : D;
			try { wkAutoGrowSchedule( root ); } catch ( e5 ) {}
			try { ensureSmwTooltips( root ); } catch ( e6 ) {}
		} );
	}

	init();

}() );
