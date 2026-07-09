/*
 * ext.pf.select2.base.js
 *
 * Base class to handle autocomplete for various input types using the Select2
 * JS library.
 *
 * @file
 *
 * @licence GNU GPL v2+
 * @author Jatin Mehta
 * @author Priyanshu Varshney
 * @author Yaron Koren
 */

( function ( $, mw, pf ) {
	'use strict';
	/**
	 * Inheritance class for the pf.select2 constructor
	 *
	 * @class
	 */
	pf.select2 = pf.select2 || {};

	/**
	 * @class
	 * @constructor
	 */
	pf.select2.base = function() {

	};

	pf.select2.base.prototype = {
		/*
		 * Applies select2 to the HTML element
		 *
		 * @param {HTMLElement} element
		 *
		 */
		apply: function( element ) {
			const existingValuesOnly = (element.attr("existingvaluesonly") == "true");
			this.$element = element;
			this.existingValuesOnly = existingValuesOnly;
			this.id = element.attr( "id" );
			this.autocompletedatatype = element.attr( "autocompletedatatype" );
			this.autocompletesettings = element.attr( "autocompletesettings" );
			try {
				const opts = this.setOptions();
				// element.val() would be simpler, but for some
				// reason it returns the wrong value.
				let origValue = element.attr('value');
				// We call empty() in case this input was
				// modified due to "values dependent on", and
				// the old set of allowed values needs to
				// be removed.
				element.empty();
				const $input = element.select2(opts);

				// We need an empty string as the first option; otherwise,
				// if it's non-empty string, Select2 might pick it and
				// display it as its value even if we remove it.
				const newEmptyOption = new Option( "", "", false, false );
				$input.append(newEmptyOption).trigger('change');

				if ( origValue === undefined ) {
					origValue = "";
				}
				if ( this.getAutocompleteOpts().autocompletedatatype !== undefined && this.dependentOn() === null ) {
					const data = {
						id: origValue,
						text: origValue
					};
					// This is needed after the empty() call,
					// to create an option element to restore
					// correct value in remote autocompletion.
					const newOption = new Option(data.text, data.id, false, false);
					$input.append(newOption).trigger('change');
				}
				// This is required so that the existing value
				// can be displayed.
				$input.val(origValue).trigger('change');
				const inputData = $input.data("select2");
				let rawValue = "";

				$(inputData.dropdown.$searchContainer).on("keydown",(e) => {
					if ( existingValuesOnly ) {
						return ;
					}
					if ( e.key === 'Tab' ) {
						const valHighlighted = inputData.$results.find('.select2-results__option--highlighted')[0];
						if ( valHighlighted !== undefined ){
							rawValue = valHighlighted.textContent;
						};
						if ( !$input.find( "option[value='" + rawValue + "']" ).length ) {
							// Does this ever get called?
							const newOption = new Option( rawValue, rawValue, false, false );
							$input.append(newOption).trigger( 'change' );
						}
						if ( rawValue !== '' ) {
							$input.val(rawValue).trigger("change");
						}
					}
				});
				element.on( "change", this.onChange );
			} catch (e) {
				window.console.log(e);
			}
		},
		/*
		 * Used to remove the Select2 applied to the HTML element;
		 * the selected value will remain preserved.
		 *
		 * @param {HTMLElement} element
		 *
		 */
		destroy: function( element ) {
			element.select2( "destroy" );
		},
	 	/*
		 * If a field is dependent on some other field in the form
		 * then it returns its name.
		 *
		 * @return {string}
		 *
		 */

		getCurrentElement: function() {
			if ( this.$element && this.$element.length ) {
				return this.$element;
			}
			if ( this.id !== undefined ) {
				return $( '#' + this.id );
			}
			return $();
		},
		dependentOn: function() {
			const $element = this.getCurrentElement();
			const name_attr = this.nameAttr( $element );
			const name = $element.attr( name_attr );

			const wgPageFormsDependentFields = mw.config.get( 'wgPageFormsDependentFields' );
			for ( let i = 0; i < wgPageFormsDependentFields.length; i++ ) {
				const dependentFieldPair = wgPageFormsDependentFields[i];
				if ( dependentFieldPair[1] === name ) {
					return dependentFieldPair[0];
				}
			}
			return null;
		},
		/*
		 * Returns the array of names of fields in the form which are dependent
		 * on the field passed as a param to this function,
		 *
		 * @param {HTMLElement} element
		 *
		 * @return {associative array} dependent_on_me
		 *
		 */
		dependentOnMe: function( element ) {
			const name_attr = this.nameAttr(element);
			const name = element.attr( name_attr );
			const dependent_on_me = [];

			const wgPageFormsDependentFields = mw.config.get( 'wgPageFormsDependentFields' );
			for ( let i = 0; i < wgPageFormsDependentFields.length; i++ ) {
				const dependentFieldPair = wgPageFormsDependentFields[i];
				if ( dependentFieldPair[0] === name ) {
					dependent_on_me.push(dependentFieldPair[1]);
				}
			}

			return dependent_on_me;
		},
		/*
		 * Returns the name attribute of the field depending on
		 * whether it is a part of a multiple instance template or not
		 *
		 * @param {HTMLElement} element
		 *
		 * @return {string}
		 *
		 */
		nameAttr: function( element ) {
			return this.partOfMultiple( element ) ? "origname" : "name";
		},
		/*
		 * Checks whether the field is part of a multiple instance template or not
		 *
		 * @param {HTMLElement} element
		 *
		 * @return {boolean}
		 *
		 */
		partOfMultiple: function( element ) {
			return element.attr( "origname" ) !== undefined ? true : false;
		},
		/*
		 * Gives dependent field options which include
		 * property, base property and base value
		 *
		 * @param {string} dep_on
		 *
		 * @return {object} dep_field_opts
		 *
		 */
		getDependentFieldOpts: function( dep_on ) {
			const $element = this.getCurrentElement();
			const dep_field_opts = {};
			let $base_element;

			if ( this.partOfMultiple( $element ) ) {
				$base_element = $element.closest( ".multipleTemplateInstance" )
					.find( '[origname ="' + dep_on + '" ]' );
			} else {
				$base_element = $('[name ="' + dep_on + '" ]');
			}
			dep_field_opts.base_value = $base_element.val();
			dep_field_opts.base_prop = mw.config.get( 'wgPageFormsFieldProperties' )[dep_on] ||
				$base_element.attr( "autocompletesettings" );
			dep_field_opts.prop = ( $element.attr( "autocompletesettings" ) || '' ).split( "," )[0];

			return dep_field_opts;
		},
		/*
		 * Gives autocomplete options for a field
		 *
		 * @return {object} autocomplete_opts
		 *
		 */
		getAutocompleteOpts: function() {
			const $element = this.getCurrentElement();
			const input_id = this.id !== undefined ? '#' + this.id : '#undefined';
			const autocomplete_opts = {};
			const autocompletedatatype = this.autocompletedatatype !== undefined ? this.autocompletedatatype : $element.attr( "autocompletedatatype" );
			const autocompletesettings = this.autocompletesettings !== undefined ? this.autocompletesettings : $element.attr( "autocompletesettings" );

			if ( autocompletesettings === undefined ) {
				throw "Error: No autocomplete settings set for input " + input_id;
			}

			this.autocompletedatatype = autocompletedatatype;
			this.autocompletesettings = autocompletesettings;
			autocomplete_opts.autocompletedatatype = autocompletedatatype;
			autocomplete_opts.autocompletesettings = autocompletesettings;
			return autocomplete_opts;
		},

		/**
		 * Escape out any HTML, and then add our own HTML to display
		 * the correct bolding.
		 * The first part of this function is directly copied from
		 * Utils::escapeMarkup() in the Select2 code. @TODO: figure out
		 * how to just call that code directly.
		 *
		 * @param {Mixed} markup
		 * @return {Mixed}
		 */
		escapeMarkupAndAddHTML: function( markup ) {
			const replaceMap = {
				'\\': '&#92;',
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				'\'': '&#39;',
				'/': '&#47;'
			};

			// Do not try to escape the markup if it's not a string
			if (typeof markup !== 'string') {
				return markup;
			}

			const escapedMarkup = String(markup).replace(/[&<>"'\/\\]/g, (match) => replaceMap[match])

			const boldStart = String.fromCharCode(1);
			const boldEnd = String.fromCharCode(2);
			return '<span class="select2-match-entire">' +
				escapedMarkup
				.replace(boldStart, '<span class="select2-match"><b>')
				.replace(boldEnd, '</b></span>') +
				'</span>';
		},

		/*
		 * Refreshes the field if there is a change
		 * in the autocomplete values.
		 *
		 * @param {HTMLElement} element
		 *
		 */
		refresh: function( element ) {
			this.destroy($(element));
			this.apply($(element));
		},
		/*
		 * Removes diacritics from the string and replaces
		 * them with English characters.
		 * This code is basically copied from:
		 * http://jpfiddle.net/potherca/Gtmr2/
		 *
		 * @param {string} text
		 *
		 * @return {string}
		 *
		 */
		removeDiacritics: function( text ) {
			const str = text === undefined || text === null ? '' : text.toString();

			if ( typeof str.normalize === 'function' ) {
				return str.normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' );
			}

			const diacriticsMap = {
				'Á': 'A', 'Â': 'A', 'Ä': 'A', 'À': 'A', 'Ã': 'A', 'Å': 'A',
				'É': 'E', 'Ê': 'E', 'Ë': 'E', 'È': 'E',
				'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ì': 'I',
				'Ó': 'O', 'Ô': 'O', 'Ö': 'O', 'Ò': 'O', 'Õ': 'O',
				'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ù': 'U',
				'Ý': 'Y', 'Ÿ': 'Y', 'Ç': 'C', 'Ñ': 'N',
				'á': 'a', 'â': 'a', 'ä': 'a', 'à': 'a', 'ã': 'a', 'å': 'a',
				'é': 'e', 'ê': 'e', 'ë': 'e', 'è': 'e',
				'í': 'i', 'î': 'i', 'ï': 'i', 'ì': 'i',
				'ó': 'o', 'ô': 'o', 'ö': 'o', 'ò': 'o', 'õ': 'o',
				'ú': 'u', 'û': 'u', 'ü': 'u', 'ù': 'u',
				'ý': 'y', 'ÿ': 'y', 'ç': 'c', 'ñ': 'n', 'œ': 'oe', 'Œ': 'OE'
			};

			return str.replace( /[-￿]/g, ( key ) => diacriticsMap[key] || key );
		},
		textHighlight: function( text, term ) {
			if ( text === undefined ) {
				text = "";
			}
			let markup = "";
			const remove_diacritics = pf.select2.base.prototype.removeDiacritics;
			const no_diac_text = remove_diacritics(text);
			const no_diac_term = remove_diacritics(term);
			let start = no_diac_text.toUpperCase().indexOf(no_diac_term.toString().toUpperCase());
			if ( start !== 0 && !mw.config.get( 'wgPageFormsAutocompleteOnAllChars' ) ) {
				start = no_diac_text.toUpperCase().indexOf(" " + no_diac_term.toString().toUpperCase());
				if ( start !== -1 ) {
					start = start + 1;
				}
			}

			if ( start !== -1 ) {
				const boldStart = String.fromCharCode(1);
				const boldEnd = String.fromCharCode(2);
				markup = text.slice(0, Math.max(0, start)) + boldStart +
					text.substr(start,term.length) + boldEnd +
					text.substr(start + term.length, text.length);
			} else {
				markup = (text);
			}
			return markup;
		},
	};
}( jQuery, mediaWiki, pageforms ) );
