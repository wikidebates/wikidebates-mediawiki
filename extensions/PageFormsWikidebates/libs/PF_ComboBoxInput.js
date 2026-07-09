/**
 * PF_ComboBoxInput.js
 *
 * JavaScript code to use Select2 for Page Forms combobox inputs.
 *
 * @class
 * @param {jQuery} $
 * @param {Object} mw
 * @param {Object} pf
 * @license GNU GPL v2+
 */
( function ( $, mw, pf ) {
	'use strict';

	pf.ComboBoxInput = function ( config ) {
		this.config = config || {};
		this.$element = null;
	};

	pf.ComboBoxInput.static = pf.ComboBoxInput.static || {
		pendingRequests: Object.create( null ),
		requestCache: new Map(),
		cacheSize: 128
	};

	const comboboxProto = Object.create( pf.select2.base.prototype );

	comboboxProto.apply = function ( element ) {
		const sizeCh = parseInt( element.attr( 'data-size-ch' ), 10 );
		const existingValue = element.attr( 'data-value' ) || element.val() || '';
		const existingLabel = element.attr( 'data-label' ) || existingValue;

		this.$element = element;
		this.id = element.attr( 'id' );
		this.autocompletedatatype = element.attr( 'autocompletedatatype' );
		this.autocompletesettings = ( element.attr( 'autocompletesettings' ) || '' ).replace( /\\'/g, "'" );
		this.existingValuesOnly = element.attr( 'existingvaluesonly' ) === 'true';

		if ( element.hasClass( 'pf-combobox-initialized' ) || element.data( 'select2' ) ) {
			return element;
		}

		if ( !Number.isNaN( sizeCh ) ) {
			element[ 0 ].style.setProperty( '--pf-field-size', sizeCh );
		}

		element.addClass( 'pf-combobox-initialized' );
		element.select2( this.getSelect2Options() );

		if ( existingValue !== '' && element.find( 'option[value="' + this.escapeSelectorValue( existingValue ) + '"]' ).length === 0 ) {
			element.append( new Option( existingLabel, existingValue, false, false ) );
		}

		element.val( existingValue ).trigger( 'change.select2' );
		element.on( 'change.pfComboBox', () => {
			const $parentSpan = element.closest( 'span' );
			if ( $parentSpan.hasClass( 'pfShowIfSelected' ) ) {
				mw.hook( 'pf.comboboxChange' ).fire( $parentSpan );
			}
			element.setAutocompleteForDependentField( this.partOfMultiple( element ) );
		} );

		return element;
	};

	comboboxProto.escapeSelectorValue = function ( value ) {
		return String( value ).replace( /(["\\])/g, '\\$1' );
	};

	comboboxProto.getMinimumInputLength = function () {
		const autocompleteOpts = this.getAutocompleteOpts();
		if ( autocompleteOpts.autocompletedatatype === 'namespace' || autocompleteOpts.autocompletedatatype === 'category' ) {
			return 2;
		}
		if ( autocompleteOpts.autocompletedatatype === 'cargo field' || autocompleteOpts.autocompletedatatype === 'property' || autocompleteOpts.autocompletedatatype === 'concept' ) {
			return 2;
		}
		return 1;
	};

	comboboxProto.getAjaxDelay = function () {
		if ( this.autocompletedatatype === 'namespace' ) {
			return 150;
		}
		if ( this.autocompletedatatype === 'cargo field' || this.autocompletedatatype === 'property' || this.autocompletedatatype === 'concept' ) {
			return 300;
		}
		return 250;
	};

	comboboxProto.getNamespaceId = function ( namespaceName ) {
		const trimmedName = ( namespaceName || '' ).toString().trim().toLowerCase();
		const namespaceIds = mw.config.get( 'wgNamespaceIds' ) || {};

		if ( trimmedName === '' || trimmedName === 'main' ) {
			return 0;
		}
		if ( Object.prototype.hasOwnProperty.call( namespaceIds, trimmedName ) ) {
			return namespaceIds[ trimmedName ];
		}
		return null;
	};

	comboboxProto.buildAjaxRequestData = function ( params ) {
		const autocompleteOpts = this.getAutocompleteOpts();
		const dataSource = ( autocompleteOpts.autocompletesettings || '' ).split( ',' )[ 0 ];
		const autocompleteType = autocompleteOpts.autocompletedatatype;
		const requestData = {
			format: 'json'
		};
		let dataSourceCopy;

		if ( autocompleteType === 'namespace' ) {
			requestData.action = 'query';
			requestData.list = 'prefixsearch';
			requestData.pssearch = params.term || '';
			requestData.pslimit = 10;
			const namespaceId = this.getNamespaceId( dataSource );
			if ( namespaceId !== null ) {
				requestData.psnamespace = namespaceId;
			}
			return requestData;
		}

		requestData.action = 'pfautocomplete';
		requestData.limit = 10;
		requestData.substr = params.term || '';

		if ( autocompleteType === 'cargo field' ) {
			const tableAndField = dataSource.split( '|' );
			requestData.cargo_table = tableAndField[ 0 ];
			requestData.cargo_field = tableAndField[ 1 ];
			if ( tableAndField.length > 2 ) {
				requestData.cargo_where = tableAndField[ 2 ];
			}
			return requestData;
		}

		if ( autocompleteType === 'wikidata' ) {
			dataSourceCopy = dataSource;
			dataSourceCopy.split( '&' ).forEach( ( term ) => {
				const subTerms = term.split( '=' );
				if ( subTerms.length < 2 ) {
					return;
				}
				const matches = subTerms[ 1 ].match( /\[(.*?)\]/ );
				if ( matches ) {
					const depValue = $( '[name="' + subTerms[ 1 ] + '"]' ).val();
					if ( depValue && depValue.trim().length ) {
						dataSourceCopy = dataSourceCopy.replace( subTerms[ 1 ], depValue );
					}
				}
			} );
			requestData.wikidata = dataSourceCopy;
			return requestData;
		}

		requestData[ autocompleteType ] = dataSource;
		if ( this.$element.attr( 'mappingproperty' ) ) {
			requestData.mappingproperty = this.$element.attr( 'mappingproperty' );
		}
		if ( this.$element.attr( 'mappingtemplate' ) ) {
			requestData.mappingtemplate = this.$element.attr( 'mappingtemplate' );
		}
		return requestData;
	};

	comboboxProto.getRequestCacheKey = function ( requestData ) {
		return JSON.stringify( requestData );
	};

	comboboxProto.rememberRequest = function ( cacheKey, response ) {
		const staticData = pf.ComboBoxInput.static;
		if ( staticData.requestCache.has( cacheKey ) ) {
			staticData.requestCache.delete( cacheKey );
		}
		staticData.requestCache.set( cacheKey, response );
		if ( staticData.requestCache.size > staticData.cacheSize ) {
			const oldestKey = staticData.requestCache.keys().next().value;
			staticData.requestCache.delete( oldestKey );
		}
		return response;
	};

	comboboxProto.normalizeRemoteResults = function ( data ) {
		let results = [];

		if ( this.autocompletedatatype === 'namespace' ) {
			results = data && data.query && Array.isArray( data.query.prefixsearch ) ? data.query.prefixsearch : [];
			return results.map( ( item ) => {
				const title = item.title || '';
				return {
					id: title,
					text: title,
					title: title
				};
			} );
		}

		results = data && Array.isArray( data.pfautocomplete ) ? data.pfautocomplete : [];
		return results.map( ( item ) => {
			const optionValue = item.title || '';
			const optionLabel = item.displaytitle !== undefined ? item.displaytitle : optionValue;
			return {
				id: optionValue,
				text: optionLabel,
				title: optionValue,
				displaytitle: item.displaytitle
			};
		} );
	};

	comboboxProto.getLocalData = function () {
		const values = [];
		const autocompleteSettings = this.autocompletesettings;
		const depOn = this.dependentOn();
		let data;
		let i;
		let name;

		if ( depOn !== null ) {
			data = this.$element.data( 'autocompletevalues' ) || [];
			data.forEach( ( item ) => {
				values.push( {
					id: item,
					text: item,
					title: item
				} );
			} );
			return values;
		}

		if ( autocompleteSettings === 'external data' ) {
			name = this.$element.attr( this.nameAttr( this.$element ) );
			if ( name && name.includes( '[]' ) ) {
				name = name.slice( 0, Math.max( 0, name.length - 2 ) );
			}
			const wgPageFormsEDSettings = mw.config.get( 'wgPageFormsEDSettings' ) || {};
			const edgValues = mw.config.get( 'edgValues' ) || {};
			const externalSettings = wgPageFormsEDSettings[ name ] || {};
			const titles = externalSettings.title ? edgValues[ externalSettings.title ] : null;

			if ( Array.isArray( titles ) ) {
				for ( i = 0; i < titles.length; i++ ) {
					values.push( {
						id: titles[ i ],
						text: titles[ i ],
						title: titles[ i ]
					} );
				}
			}
			return values;
		}

		data = ( mw.config.get( 'wgPageFormsAutocompleteValues' ) || {} )[ autocompleteSettings ];
		if ( Array.isArray( data ) ) {
			data.forEach( ( item ) => {
				values.push( {
					id: item,
					text: item,
					title: item
				} );
			} );
			return values;
		}

		this.$element.find( 'option' ).each( function () {
			const value = $( this ).attr( 'value' ) || '';
			const text = $( this ).text() || value;
			if ( value === '' && text === '' ) {
				return;
			}
			values.push( {
				id: value,
				text: optionText,
				title: value || optionText
			} );
		} );
		return values;
	};

	comboboxProto.getPageCacheKey = function ( term ) {
		const autocompleteOpts = this.getAutocompleteOpts();
		return JSON.stringify( {
			type: autocompleteOpts.autocompletedatatype || '',
			settings: autocompleteOpts.autocompletesettings || '',
			term: ( term || '' ).toString().trim().toLowerCase()
		} );
	};

	comboboxProto.getCachedResultsPage = function ( term ) {
		const staticData = pf.ComboBoxInput.static;
		const cacheKey = this.getPageCacheKey( term );
		return staticData.requestCache.has( cacheKey ) ? staticData.requestCache.get( cacheKey ) : null;
	};

	comboboxProto.rememberResultsPage = function ( term, results ) {
		return this.rememberRequest( this.getPageCacheKey( term ), results );
	};

	comboboxProto.getAjaxOptions = function () {
		const self = this;
		const inputId = this.id;

		return {
			delay: this.getAjaxDelay(),
			data: function ( params ) {
				return self.buildAjaxRequestData( params );
			},
			transport: function ( params, success, failure ) {
				const staticData = pf.ComboBoxInput.static;
				const requestData = params.data || {};
				const cacheKey = self.getRequestCacheKey( requestData );
				let xhr;

				if ( staticData.requestCache.has( cacheKey ) ) {
					success( staticData.requestCache.get( cacheKey ) );
					return {
						abort: function () {}
					};
				}

				if ( staticData.pendingRequests[ inputId ] && typeof staticData.pendingRequests[ inputId ].abort === 'function' ) {
					staticData.pendingRequests[ inputId ].abort();
				}

				xhr = $.ajax( {
					url: mw.util.wikiScript( 'api' ),
					dataType: 'json',
					data: requestData,
					success: function ( response ) {
						delete staticData.pendingRequests[ inputId ];
						self.rememberRequest( cacheKey, response );
						success( response );
					},
					error: function ( jqXHR, textStatus, errorThrown ) {
						delete staticData.pendingRequests[ inputId ];
						if ( textStatus !== 'abort' ) {
							failure( jqXHR, textStatus, errorThrown );
						}
					}
				} );

				staticData.pendingRequests[ inputId ] = xhr;
				return xhr;
			},
			processResults: function ( data, params ) {
				const results = self.normalizeRemoteResults( data );
				self.rememberResultsPage( params && params.term ? params.term : '', results );
				return {
					results: results
				};
			}
		};
	};


	comboboxProto.refresh = function ( element ) {
		const $element = $( element );
		const dependentValues = $element.data( 'autocompletevalues' );
		const currentValue = $element.val() || $element.attr( 'data-value' ) || '';
		let currentLabel = currentValue;
		let shouldKeepValue = true;
		const currentOption = $element.find( 'option:selected' );

		this.$element = $element;
		this.id = $element.attr( 'id' );
		this.autocompletedatatype = $element.attr( 'autocompletedatatype' );
		this.autocompletesettings = ( $element.attr( 'autocompletesettings' ) || '' ).replace( /\'/g, "'" );
		this.existingValuesOnly = $element.attr( 'existingvaluesonly' ) === 'true';

		const isDependentField = this.dependentOn() !== null;

		if ( currentOption.length ) {
			currentLabel = currentOption.text() || currentLabel;
		}

		if ( isDependentField && Array.isArray( dependentValues ) && currentValue !== '' ) {
			shouldKeepValue = dependentValues.indexOf( currentValue ) !== -1 || !this.existingValuesOnly;
		}

		if ( $element.data( 'select2' ) ) {
			this.destroy( $element );
		}
		$element.off( '.pfComboBox' );
		$element.removeClass( 'pf-combobox-initialized' );
		$element.find( 'option' ).not( '[value=""]' ).remove();

		if ( shouldKeepValue && currentValue !== '' ) {
			$element.attr( 'data-value', currentValue );
			$element.attr( 'data-label', currentLabel );
			if ( $element.find( 'option[value="' + this.escapeSelectorValue( currentValue ) + '"]' ).length === 0 ) {
				$element.append( new Option( currentLabel, currentValue, false, false ) );
			}
		} else {
			$element.attr( 'data-value', '' );
			$element.attr( 'data-label', '' );
			$element.val( '' );
		}

		this.apply( $element );

		if ( !shouldKeepValue && currentValue !== '' ) {
			$element.trigger( 'change' );
		}
	};

	comboboxProto.getSelect2Options = function () {
		const self = this;
		const placeholder = this.$element.attr( 'placeholder' ) || '';
		const hasRemoteAutocomplete = this.autocompletedatatype !== undefined && this.autocompletedatatype !== '';
		const select2Options = {
			width: '100%',
			placeholder: placeholder,
			allowClear: this.$element.closest( '.mandatoryFieldSpan' ).length === 0,
			tags: !this.existingValuesOnly,
			containerCssClass: 'pf-select2-container pf-combobox-widget',
			dropdownCssClass: 'pf-select2-dropdown pf-combobox-dropdown',
			templateResult: function ( result ) {
				const text = result.text || result.id || '';
				const term = ( self.$element.data( 'select2' ) && self.$element.data( 'select2' ).dropdown && self.$element.data( 'select2' ).dropdown.$search ) ? self.$element.data( 'select2' ).dropdown.$search.val() : '';
				if ( result.loading || term === '' ) {
					return text;
				}
				return self.escapeMarkupAndAddHTML( self.textHighlight( text, term ) );
			},
			escapeMarkup: function ( markup ) {
				return markup;
			},
			language: {
				inputTooShort: function () {
					return mw.msg( 'pf-autocomplete-input-too-short', self.getMinimumInputLength() );
				},
				noResults: function () {
					return mw.msg( 'pf-autocomplete-no-matches' );
				},
				searching: function () {
					return mw.msg( 'pf-autocomplete-searching' );
				}
			},
			createTag: function ( params ) {
				const term = ( params.term || '' ).trim();
				if ( self.existingValuesOnly || term === '' ) {
					return null;
				}
				return {
					id: term,
					text: term,
					title: term,
					newTag: true
				};
			}
		};

		if ( hasRemoteAutocomplete && this.dependentOn() === null ) {
			select2Options.minimumInputLength = this.getMinimumInputLength();
			select2Options.ajax = this.getAjaxOptions();
		} else {
			select2Options.data = this.getLocalData();
		}

		return select2Options;
	};

	pf.ComboBoxInput.prototype = comboboxProto;
	pf.ComboBoxInput.prototype.constructor = pf.ComboBoxInput;
}( jQuery, mediaWiki, pageforms ) );
