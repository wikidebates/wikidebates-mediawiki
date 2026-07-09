<?php

namespace MediaWiki\Extension\Wikidebates;

use CommentStoreComment;
use MediaWiki\Content\ContentHandler;
use MediaWiki\MediaWikiServices;
use MediaWiki\Revision\SlotRecord;

class AutoParentLink {

	private const LOG_CHANNEL = 'Wikidebates-autoparent';

	private const WIKI_CONFIG = [
		'fr' => [
			'argumentTemplate' => 'Argument',
			'debateTemplate' => 'Débat',
			'initializationParam' => 'initialisation',
			'childPageParam' => 'page',
			'childDisplayTitleParam' => 'titre-affiché',
			'childWarningsParam' => 'avertissements',
			'types' => [
				'Argument pour' => [
					'parameter' => 'arguments-pour',
					'template' => 'Argument pour',
					'order' => 'debate',
					'parentTemplate' => 'Débat',
				],
				'Argument contre' => [
					'parameter' => 'arguments-contre',
					'template' => 'Argument contre',
					'order' => 'debate',
					'parentTemplate' => 'Débat',
				],
				'Justification' => [
					'parameter' => 'justifications',
					'template' => 'Justification',
					'order' => 'argument',
					'parentTemplate' => 'Argument',
				],
				'Objection' => [
					'parameter' => 'objections',
					'template' => 'Objection',
					'order' => 'argument',
					'parentTemplate' => 'Argument',
				],
			],
			'orderDebate' => [
				'sujet',
				'sujet-complet',
				'avancement',
				'avertissements-titre',
				'avertissements-débat',
				'introduction',
				'articles-Wikipédia',
				'arguments-pour',
				'arguments-contre',
				'bibliographie-pour',
				'bibliographie-contre',
				'bibliographie-ni-pour-ni-contre',
				'sitographie-pour',
				'sitographie-contre',
				'sitographie-ni-pour-ni-contre',
				'vidéographie-pour',
				'vidéographie-contre',
				'vidéographie-ni-pour-ni-contre',
				'débats-connexes',
				'rubriques',
				'mots-clés',
				'interlangue',
				'date-création',
			],
			'orderArgument' => [
				'initialisation',
				'nom',
				'avertissements-titre',
				'avertissements-argument',
				'avertissements-résumé',
				'résumé',
				'citations',
				'avertissements-références',
				'références-bibliographiques',
				'références-sitographiques',
				'références-vidéographiques',
				'avertissements-justifications',
				'justifications',
				'avertissements-objections',
				'objections',
				'débat-détaillé',
				'rubriques',
				'mots-clés',
				'interlangue',
				'date-création',
			],
		],
		'en' => [
			'argumentTemplate' => 'Argument',
			'debateTemplate' => 'Debate',
			'initializationParam' => 'initialization',
			'childPageParam' => 'page',
			'childDisplayTitleParam' => 'displayed-title',
			'childWarningsParam' => 'warnings',
			'types' => [
				'Pro argument' => [
					'parameter' => 'pro-arguments',
					'template' => 'Pro argument',
					'order' => 'debate',
					'parentTemplate' => 'Debate',
				],
				'Con argument' => [
					'parameter' => 'con-arguments',
					'template' => 'Con argument',
					'order' => 'debate',
					'parentTemplate' => 'Debate',
				],
				'Justification' => [
					'parameter' => 'justifications',
					'template' => 'Justification',
					'order' => 'argument',
					'parentTemplate' => 'Argument',
				],
				'Objection' => [
					'parameter' => 'objections',
					'template' => 'Objection',
					'order' => 'argument',
					'parentTemplate' => 'Argument',
				],
			],
			'orderDebate' => [
				'topic',
				'complete-topic',
				'progress',
				'title-warnings',
				'debate-warnings',
				'introduction',
				'wikipedia-articles',
				'pro-arguments',
				'con-arguments',
				'pro-bibliography',
				'con-bibliography',
				'bibliography',
				'pro-webliography',
				'con-webliography',
				'webliography',
				'pro-videography',
				'con-videography',
				'videography',
				'related-debates',
				'sections',
				'keywords',
				'creation-date',
			],
			'orderArgument' => [
				'initialization',
				'name',
				'title-warnings',
				'argument-warnings',
				'summary-warnings',
				'summary',
				'quotes',
				'reference-warnings',
				'bibliography',
				'webliography',
				'videography',
				'justification-warnings',
				'justifications',
				'objection-warnings',
				'objections',
				'detailed-debate',
				'sections',
				'keywords',
				'creation-date',
			],
		],
	];

	public static function onPageSaveComplete(
		$wikiPage,
		$user,
		$summary,
		$flags,
		$revisionRecord,
		$editResult
	): void {
		if ( !method_exists( $editResult, 'isNew' ) || !$editResult->isNew() ) {
			return;
		}

		$title = $wikiPage->getTitle();
		$config = self::getWikiConfig();

		if ( $title->getNamespace() !== NS_MAIN ) {
			return;
		}

		$content = $wikiPage->getContent( SlotRecord::MAIN );
		if ( !$content ) {
			self::logProblem( 'Contenu principal absent pour page=' . $title->getPrefixedText() );
			return;
		}

		$text = ContentHandler::getContentText( $content );
		if ( $text === null || $text === '' ) {
			self::logProblem( 'Texte principal vide pour page=' . $title->getPrefixedText() );
			return;
		}

        $trimmedText = ltrim( $text );
        $expectedStart = '{{' . $config['argumentTemplate'];

        if ( substr( $trimmedText, 0, strlen( $expectedStart ) ) !== $expectedStart ) {
            return;
        }

		$childTemplate = self::parseTopLevelTemplate( $text );
		if ( $childTemplate === null ) {
			self::logProblem( 'Impossible de parser le modèle enfant sur page=' . $title->getPrefixedText() );
			return;
		}

		if ( $childTemplate['name'] !== $config['argumentTemplate'] ) {
			self::logProblem(
				'Le modèle principal enfant est inattendu sur page='
				. $title->getPrefixedText()
				. '; attendu=' . $config['argumentTemplate']
				. '; trouvé=' . $childTemplate['name']
			);
			return;
		}

		$initialisation = self::getParameterValue( $childTemplate['parts'], $config['initializationParam'] );
		if ( $initialisation === null || trim( $initialisation ) === '' ) {
			self::logProblem(
				'Paramètre ' . $config['initializationParam'] . ' absent sur page=' . $title->getPrefixedText()
			);
			return;
		}

		$parsedInit = self::parseInitialisation( $initialisation, $config );
		if ( $parsedInit === null ) {
			self::logProblem(
				'Initialisation invalide sur page=' . $title->getPrefixedText() . '; valeur=' . $initialisation
			);
			return;
		}

		$type = $parsedInit['type'];
		$parentId = $parsedInit['parentId'];
		$map = $config['types'][$type];

		$services = MediaWikiServices::getInstance();
		$wikiPageFactory = $services->getWikiPageFactory();
		$permissionManager = $services->getPermissionManager();

		$parentPage = $wikiPageFactory->newFromID( $parentId );
		if ( !$parentPage ) {
			self::logProblem(
				'Parent introuvable pour page=' . $title->getPrefixedText() . '; page_id=' . $parentId
			);
			return;
		}

		$parentTitle = $parentPage->getTitle();
		if ( !$parentTitle || !$parentTitle->exists() ) {
			self::logProblem(
				'Parent inexistant pour page=' . $title->getPrefixedText() . '; page_id=' . $parentId
			);
			return;
		}

		if ( $parentTitle->equals( $title ) ) {
			self::logProblem( 'Le parent est la page elle-même pour page=' . $title->getPrefixedText() );
			return;
		}

		if ( !$permissionManager->userCan( 'edit', $user, $parentTitle ) ) {
			self::logProblem(
				'Droits insuffisants pour modifier le parent=' . $parentTitle->getPrefixedText()
				. '; page enfant=' . $title->getPrefixedText()
			);
			return;
		}

		$parentContent = $parentPage->getContent( SlotRecord::MAIN );
		if ( !$parentContent ) {
			self::logProblem( 'Contenu parent absent pour parent=' . $parentTitle->getPrefixedText() );
			return;
		}

		$parentText = ContentHandler::getContentText( $parentContent );
		if ( $parentText === null || $parentText === '' ) {
			self::logProblem( 'Texte parent vide pour parent=' . $parentTitle->getPrefixedText() );
			return;
		}

		$expectedParentTemplate = $map['parentTemplate'];

		if ( !preg_match( '/^\{\{' . preg_quote( $expectedParentTemplate, '/' ) . '\b/u', $parentText ) ) {
			self::logProblem(
				'La page parent ne commence pas par le modèle attendu; parent='
				. $parentTitle->getPrefixedText()
				. '; attendu=' . $expectedParentTemplate
			);
			return;
		}

		$parentTemplate = self::parseTopLevelTemplate( $parentText );
		if ( $parentTemplate === null ) {
			self::logProblem( 'Impossible de parser le modèle parent=' . $parentTitle->getPrefixedText() );
			return;
		}

		if ( $parentTemplate['name'] !== $expectedParentTemplate ) {
			self::logProblem(
				'Le modèle principal parent est inattendu; parent='
				. $parentTitle->getPrefixedText()
				. '; attendu=' . $expectedParentTemplate
				. '; trouvé=' . $parentTemplate['name']
			);
			return;
		}

		$parameterName = $map['parameter'];
		$templateName = $map['template'];
		$order = $map['order'] === 'debate' ? $config['orderDebate'] : $config['orderArgument'];
		$childPageName = $title->getText();

		$currentValue = self::getParameterValue( $parentTemplate['parts'], $parameterName );
		if ( $currentValue !== null && self::parameterContainsChild( $currentValue, $templateName, $childPageName, $config ) ) {
			return;
		}

		$childBlock = self::buildChildBlock( $templateName, $childPageName, $config );

		$updatedParts = self::upsertParameterInParts(
			$parentTemplate['parts'],
			$parameterName,
			$childBlock,
			$order
		);

		if ( $updatedParts === null ) {
			self::logProblem(
				'Échec d’insertion dans le paramètre=' . $parameterName
				. '; parent=' . $parentTitle->getPrefixedText()
				. '; enfant=' . $childPageName
			);
			return;
		}

		$newTemplateText = self::joinTemplateParts( $updatedParts );
		$newParentText =
			substr( $parentText, 0, $parentTemplate['start'] ) .
			$newTemplateText .
			substr( $parentText, $parentTemplate['end'] );

		if ( $newParentText === $parentText ) {
			self::logProblem(
				'Aucun changement effectif après modification; parent=' . $parentTitle->getPrefixedText()
				. '; enfant=' . $childPageName
			);
			return;
		}

		$newContent = ContentHandler::makeContent( $newParentText, $parentTitle );

		$pageUpdater = $parentPage->newPageUpdater( $user );
		$pageUpdater->setContent( SlotRecord::MAIN, $newContent );
      	$pageUpdater->addTag( 'argument added' );
		$pageUpdater->saveRevision(
			CommentStoreComment::newUnsavedComment(
				self::buildEditSummary( $type, $childPageName, $config )
			)
		);
	}

	private static function getWikiConfig(): array {
		$lang = MediaWikiServices::getInstance()->getContentLanguage()->getCode();

		if ( isset( self::WIKI_CONFIG[$lang] ) ) {
			return self::WIKI_CONFIG[$lang];
		}

		return self::WIKI_CONFIG['fr'];
	}

	private static function buildEditSummary( string $type, string $title, array $config ): string {
		$isFr = ( $config['debateTemplate'] === 'Débat' );

		if ( $type === 'Argument pour' || $type === 'Pro argument' ) {
			return $isFr
				? sprintf( '/* Arguments « pour » */ Ajout de l’argument : « %s »', $title )
				: sprintf( '/* Pro arguments */ Added argument: “%s”', $title );
		}

		if ( $type === 'Argument contre' || $type === 'Con argument' ) {
			return $isFr
				? sprintf( '/* Arguments « contre » */ Ajout de l’argument : « %s »', $title )
				: sprintf( '/* Con arguments */ Added argument: “%s”', $title );
		}

		if ( $type === 'Justification' ) {
			return $isFr
				? sprintf( '/* Justifications */ Ajout de l’argument : « %s »', $title )
				: sprintf( '/* Justifications */ Added argument: “%s”', $title );
		}

		return $isFr
			? sprintf( '/* Objections */ Ajout de l’objection : « %s »', $title )
			: sprintf( '/* Objections */ Added objection: “%s”', $title );
	}

	private static function parseInitialisation( string $value, array $config ): ?array {
		$value = trim( $value );
		$parts = explode( '@', $value, 2 );

		if ( count( $parts ) !== 2 ) {
			return null;
		}

		$type = trim( $parts[0] );
		$parentId = (int)trim( $parts[1] );

		if ( $type === '' || $parentId <= 0 ) {
			return null;
		}

		if ( !isset( $config['types'][$type] ) ) {
			return null;
		}

		return [
			'type' => $type,
			'parentId' => $parentId,
		];
	}

	private static function buildChildBlock( string $templateName, string $pageName, array $config ): string {
		return '{{' . $templateName . "\n"
			. '|' . $config['childPageParam'] . '=' . $pageName . "\n"
			. '|' . $config['childDisplayTitleParam'] . '=' . $pageName . "\n"
			. '}}';
	}

	private static function parameterContainsChild(
		string $value,
		string $templateName,
		string $pageName,
		array $config
	): bool {
		$quotedTemplate = preg_quote( $templateName, '/' );
		$quotedPage = preg_quote( $pageName, '/' );
		$quotedPageParam = preg_quote( $config['childPageParam'], '/' );
		$quotedDisplayParam = preg_quote( $config['childDisplayTitleParam'], '/' );

		$patternPage =
			'/\{\{\s*' . $quotedTemplate . '\b[\s\S]*?\|\s*' . $quotedPageParam . '\s*=\s*' . $quotedPage . '\s*(?:\n|\||\}\})/u';

		$patternDisplay =
			'/\{\{\s*' . $quotedTemplate . '\b[\s\S]*?\|\s*' . $quotedDisplayParam . '\s*=\s*' . $quotedPage . '\s*(?:\n|\||\}\})/u';

		return (bool)preg_match( $patternPage, $value ) || (bool)preg_match( $patternDisplay, $value );
	}

	private static function upsertParameterInParts(
		array $parts,
		string $parameterName,
		string $childBlock,
		array $order
	): ?array {
		if ( count( $parts ) === 0 ) {
			return null;
		}

		$targetIndex = null;

		foreach ( $parts as $index => $part ) {
			if ( $index === 0 ) {
				continue;
			}

			$eqPos = self::findTopLevelEquals( $part );
			if ( $eqPos === null ) {
				continue;
			}

			$name = trim( substr( $part, 0, $eqPos ) );
			if ( $name === $parameterName ) {
				$targetIndex = $index;
				break;
			}
		}

		if ( $targetIndex !== null ) {
			$eqPos = self::findTopLevelEquals( $parts[$targetIndex] );
			if ( $eqPos === null ) {
				return null;
			}

			$currentRawValue = substr( $parts[$targetIndex], $eqPos + 1 );

			$newValue = trim( $currentRawValue ) === ''
				? $childBlock
				: rtrim( $currentRawValue, "\n\r " ) . $childBlock;

			$parts[$targetIndex] = $parameterName . '=' . $newValue;

			return $parts;
		}

		$newPart = $parameterName . '=' . $childBlock;
		$insertAt = self::findInsertionIndex( $parts, $order, $parameterName );
		array_splice( $parts, $insertAt, 0, [ $newPart ] );

		return $parts;
	}

	private static function findInsertionIndex( array $parts, array $order, string $parameterName ): int {
		$targetPos = array_search( $parameterName, $order, true );
		if ( $targetPos === false ) {
			return count( $parts );
		}

		for ( $i = $targetPos + 1; $i < count( $order ); $i++ ) {
			$nextName = $order[$i];

			foreach ( $parts as $partIndex => $part ) {
				if ( $partIndex === 0 ) {
					continue;
				}

				$eqPos = self::findTopLevelEquals( $part );
				if ( $eqPos === null ) {
					continue;
				}

				if ( trim( substr( $part, 0, $eqPos ) ) === $nextName ) {
					return $partIndex;
				}
			}
		}

		return count( $parts );
	}

	private static function getParameterValue( array $parts, string $parameterName ): ?string {
		foreach ( $parts as $index => $part ) {
			if ( $index === 0 ) {
				continue;
			}

			$eqPos = self::findTopLevelEquals( $part );
			if ( $eqPos === null ) {
				continue;
			}

			if ( trim( substr( $part, 0, $eqPos ) ) === $parameterName ) {
				return trim( substr( $part, $eqPos + 1 ) );
			}
		}

		return null;
	}

	private static function parseTopLevelTemplate( string $text ): ?array {
		$start = strpos( $text, '{{' );
		if ( $start === false ) {
			return null;
		}

		$end = self::findMatchingTemplateEnd( $text, $start );
		if ( $end === null ) {
			return null;
		}

		$templateText = substr( $text, $start, $end - $start );

		if ( substr( $templateText, -2 ) !== '}}' ) {
			return null;
		}

		$innerText = substr( $templateText, 0, -2 );
		$parts = self::splitTopLevelPipes( $innerText );

		if ( !$parts ) {
			return null;
		}

		if ( !preg_match( '/^\{\{\s*([^\|\}\n]+)/u', trim( $parts[0] ), $m ) ) {
			return null;
		}

		return [
			'start' => $start,
			'end' => $end,
			'parts' => $parts,
			'name' => trim( $m[1] ),
		];
	}

	private static function joinTemplateParts( array $parts ): string {
		if ( !$parts ) {
			return '';
		}

		$first = rtrim( $parts[0] );
		$first = preg_replace( "/\n+$/u", '', $first );

		$out = $first;

		for ( $i = 1; $i < count( $parts ); $i++ ) {
			$part = trim( $parts[$i] );
			$out .= "\n|" . $part;
		}

		return $out . "\n}}";
	}

	private static function splitTopLevelPipes( string $templateText ): array {
		$len = strlen( $templateText );
		$parts = [];
		$buffer = '';
		$depthCurly = 0;
		$depthSquare = 0;

		for ( $i = 0; $i < $len; $i++ ) {
			$ch = $templateText[$i];
			$next = $i + 1 < $len ? $templateText[$i + 1] : '';

			if ( $ch === '{' && $next === '{' ) {
				$depthCurly++;
				$buffer .= '{{';
				$i++;
				continue;
			}

			if ( $ch === '}' && $next === '}' ) {
				$depthCurly = max( 0, $depthCurly - 1 );
				$buffer .= '}}';
				$i++;
				continue;
			}

			if ( $ch === '[' && $next === '[' ) {
				$depthSquare++;
				$buffer .= '[[';
				$i++;
				continue;
			}

			if ( $ch === ']' && $next === ']' ) {
				$depthSquare = max( 0, $depthSquare - 1 );
				$buffer .= ']]';
				$i++;
				continue;
			}

			if ( $ch === '|' && $depthCurly === 1 && $depthSquare === 0 ) {
				$parts[] = $buffer;
				$buffer = '';
				continue;
			}

			$buffer .= $ch;
		}

		if ( $buffer !== '' ) {
			$parts[] = $buffer;
		}

		return $parts;
	}

	private static function findTopLevelEquals( string $text ): ?int {
		$len = strlen( $text );
		$depthCurly = 0;
		$depthSquare = 0;

		for ( $i = 0; $i < $len; $i++ ) {
			$ch = $text[$i];
			$next = $i + 1 < $len ? $text[$i + 1] : '';

			if ( $ch === '{' && $next === '{' ) {
				$depthCurly++;
				$i++;
				continue;
			}

			if ( $ch === '}' && $next === '}' ) {
				$depthCurly = max( 0, $depthCurly - 1 );
				$i++;
				continue;
			}

			if ( $ch === '[' && $next === '[' ) {
				$depthSquare++;
				$i++;
				continue;
			}

			if ( $ch === ']' && $next === ']' ) {
				$depthSquare = max( 0, $depthSquare - 1 );
				$i++;
				continue;
			}

			if ( $ch === '=' && $depthCurly === 0 && $depthSquare === 0 ) {
				return $i;
			}
		}

		return null;
	}

	private static function findMatchingTemplateEnd( string $text, int $start ): ?int {
		$len = strlen( $text );
		$depth = 0;

		for ( $i = $start; $i < $len - 1; $i++ ) {
			$pair = $text[$i] . $text[$i + 1];

			if ( $pair === '{{' ) {
				$depth++;
				$i++;
				continue;
			}

			if ( $pair === '}}' ) {
				$depth--;
				$i++;

				if ( $depth === 0 ) {
					return $i + 1;
				}
			}
		}

		return null;
	}

	private static function logProblem( string $message ): void {
		wfDebugLog( self::LOG_CHANNEL, '[AutoParentLink][PROBLEM] ' . $message );
	}
}
