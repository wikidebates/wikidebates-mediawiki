<?php

namespace MediaWiki\Maintenance;

use CommentStoreComment;
use MediaWiki\Content\ContentHandler;
use MediaWiki\MediaWikiServices;
use MediaWiki\Title\Title;

require_once dirname( __DIR__, 3 ) . '/maintenance/Maintenance.php';

class AddDateCreation extends Maintenance {
	private const DEFAULT_CATEGORIES = [
		'fr' => 'Articles sans date de création',
		'en' => 'Articles without creation date',
	];

	private const EDIT_SUMMARIES = [
		'fr' => 'Ajout de la date de création',
		'en' => 'Creation date added',
	];

	private const DATE_PARAMS = [
		'fr' => 'date-création',
		'en' => 'creation-date',
	];

	public function __construct() {
		parent::__construct();

		$this->addDescription( 'Adds the creation date parameter to a single page or to all main-namespace pages in a category.' );
		$this->addOption( 'category', 'Category name to process', false, true );
		$this->addOption( 'page', 'Exact page title to process', false, true );
		$this->addOption( 'dry-run', 'Show changes without saving them' );
		$this->addOption( 'sleep', 'Delay between pages in seconds', false, true );
		$this->addOption( 'limit', 'Maximum number of pages to process', false, true );
	}

	public function execute() {
		$category = $this->getOption( 'category', null );
		$page = $this->getOption( 'page', null );
		$dryRun = $this->hasOption( 'dry-run' );
		$sleep = (float)$this->getOption( 'sleep', 0 );
		$limit = (int)$this->getOption( 'limit', 0 );
		$lang = $this->detectLang();

		if ( $page === null && $category === null ) {
			$category = $this->getDefaultCategory( $lang );
		}

		if ( $category !== null && $page !== null ) {
			$this->fatalError( 'You must use either --category= or --page=, not both.' );
		}

		if ( $sleep < 0 ) {
			$this->fatalError( 'The --sleep value must be greater than or equal to 0.' );
		}

		if ( $limit < 0 ) {
			$this->fatalError( 'The --limit value must be greater than or equal to 0.' );
		}

		$services = MediaWikiServices::getInstance();
		$dbProvider = $services->getConnectionProvider();
		$dbr = $dbProvider->getReplicaDatabase();
		$wikiPageFactory = $services->getWikiPageFactory();
		$userFactory = $services->getUserFactory();

		$user = $userFactory->newFromName( 'Wikirobot' );
		if ( !$user || !$user->isRegistered() ) {
			$this->fatalError( 'The user account "Wikirobot" does not exist or is not registered.' );
		}

		$summaryText = $this->getEditSummary( $lang );
		$dateParam = $this->getDateParam( $lang );

		$total = 0;
		$done = 0;
		$skipped = 0;

		if ( $page !== null ) {
			$title = Title::newFromText( $page );
			if ( !$title ) {
				$this->fatalError( 'Invalid page title: ' . $page );
			}

			$this->processTitle(
				$title,
				$dbr,
				$wikiPageFactory,
				$user,
				$summaryText,
				$dateParam,
				$dryRun,
				$done,
				$skipped,
				$total
			);

			if ( $sleep > 0 ) {
				usleep( (int)( $sleep * 1000000 ) );
			}
		} else {
			$categoryDbKey = str_replace( ' ', '_', $category );

			$query = $dbr->newSelectQueryBuilder()
				->select( [ 'page_namespace', 'page_title' ] )
				->from( 'categorylinks' )
				->join( 'page', null, 'page_id = cl_from' )
				->where( [
					'cl_to' => $categoryDbKey,
					'page_namespace' => NS_MAIN,
				] )
				->orderBy( 'page_id', 'ASC' )
				->caller( __METHOD__ );

			if ( $limit > 0 ) {
				$query->limit( $limit );
			}

			$res = $query->fetchResultSet();

			foreach ( $res as $row ) {
				$title = Title::makeTitle( (int)$row->page_namespace, $row->page_title );

				$this->processTitle(
					$title,
					$dbr,
					$wikiPageFactory,
					$user,
					$summaryText,
					$dateParam,
					$dryRun,
					$done,
					$skipped,
					$total
				);

				if ( $sleep > 0 ) {
					usleep( (int)( $sleep * 1000000 ) );
				}
			}
		}

		$this->output( "\nDone. Total=$total, modified=$done, skipped=$skipped\n" );
	}

	private function processTitle(
		Title $title,
		$dbr,
		$wikiPageFactory,
		$user,
		string $summaryText,
		string $dateParam,
		bool $dryRun,
		int &$done,
		int &$skipped,
		int &$total
	): void {
		$total++;

		if ( !$title->exists() ) {
			$this->output( 'SKIP page does not exist: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		if ( $title->getNamespace() !== NS_MAIN ) {
			$this->output( 'SKIP page is not in the main namespace: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		$wikiPage = $wikiPageFactory->newFromTitle( $title );
		$content = $wikiPage->getContent();

		if ( !$content ) {
			$this->output( 'SKIP empty content: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		if ( !method_exists( $content, 'getText' ) ) {
			$this->output( 'SKIP non-text content: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		$text = $content->getText();

		if ( preg_match( '/\|\s*' . preg_quote( $dateParam, '/' ) . '\s*=/', $text ) ) {
			$this->output( 'SKIP parameter already present: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		$pageId = $title->getArticleID();
		if ( !$pageId ) {
			$this->output( 'SKIP could not determine page ID: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		$creationTs = $this->getCreationTimestamp( $dbr, $pageId );
		if ( !$creationTs ) {
			$this->output( 'SKIP could not determine creation date: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		$dateCreation = substr( $creationTs, 0, 4 ) . '-' . substr( $creationTs, 4, 2 ) . '-' . substr( $creationTs, 6, 2 );

		$newText = preg_replace(
			'/}}\s*$/',
			'|' . $dateParam . '=' . $dateCreation . "\n}}",
			$text,
			1,
			$count
		);

		if ( !$count ) {
			$this->output( 'SKIP page does not end with }}: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		if ( $newText === $text ) {
			$this->output( 'SKIP no change needed: ' . $title->getPrefixedText() . "\n" );
			$skipped++;
			return;
		}

		if ( $dryRun ) {
			$this->output( 'DRY-RUN: ' . $title->getPrefixedText() . ' -> ' . $dateCreation . ' (' . $dateParam . ')' . "\n" );
			$done++;
			return;
		}

		$pageUpdater = $wikiPage->newPageUpdater( $user );
		$newContent = ContentHandler::makeContent( $newText, $title );
		$pageUpdater->setContent( 'main', $newContent );

		$summary = CommentStoreComment::newUnsavedComment( $summaryText );

		$pageUpdater->saveRevision(
			$summary,
			EDIT_UPDATE | EDIT_SUPPRESS_RC | EDIT_FORCE_BOT
		);

		$this->output( 'OK: ' . $title->getPrefixedText() . ' -> ' . $dateCreation . ' (' . $dateParam . ')' . "\n" );
		$done++;
	}

	private function detectLang(): string {
		$wiki = (string)$this->getOption( 'wiki', '' );
		$wiki = strtolower( trim( $wiki ) );

		if ( $wiki === 'fr' || str_starts_with( $wiki, 'fr' ) ) {
			return 'fr';
		}

		if ( $wiki === 'en' || str_starts_with( $wiki, 'en' ) ) {
			return 'en';
		}

		return 'en';
	}

	private function getDefaultCategory( string $lang ): string {
		return self::DEFAULT_CATEGORIES[$lang] ?? self::DEFAULT_CATEGORIES['en'];
	}

	private function getEditSummary( string $lang ): string {
		return self::EDIT_SUMMARIES[$lang] ?? self::EDIT_SUMMARIES['en'];
	}

	private function getDateParam( string $lang ): string {
		return self::DATE_PARAMS[$lang] ?? self::DATE_PARAMS['en'];
	}

	private function getCreationTimestamp( $dbr, int $pageId ): ?string {
		$row = $dbr->newSelectQueryBuilder()
			->select( [ 'rev_timestamp' ] )
			->from( 'revision' )
			->where( [ 'rev_page' => $pageId ] )
			->orderBy( 'rev_id', 'ASC' )
			->limit( 1 )
			->caller( __METHOD__ )
			->fetchRow();

		return $row->rev_timestamp ?? null;
	}
}

$maintClass = AddDateCreation::class;
require_once RUN_MAINTENANCE_IF_MAIN;
