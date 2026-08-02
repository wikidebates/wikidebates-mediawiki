<?php

use MediaWiki\Maintenance\Maintenance;
use MediaWiki\MediaWikiServices;

class FindTranslateRobotPages extends Maintenance {

	public function __construct() {
		parent::__construct();

		$this->addDescription(
			'Lists existing pages whose first revision was created by Translate-Robot.'
		);
	}

	public function execute() {
		$services = MediaWikiServices::getInstance();
		$dbr = $services
			->getConnectionProvider()
			->getReplicaDatabase();

		$result = $dbr->newSelectQueryBuilder()
			->select( [
				'page_namespace',
				'page_title',
			] )
			->from( 'page' )
			->join(
				'revision',
				null,
				[
					'rev_page = page_id',
					'rev_parent_id' => 0,
				]
			)
			->join(
				'actor',
				null,
				'actor_id = rev_actor'
			)
			->where( [
				'actor_name' => 'Translate-Robot',
			] )
			->orderBy( [
				'page_namespace',
				'page_title',
			] )
			->caller( __METHOD__ )
			->fetchResultSet();

		$titleFactory = $services->getTitleFactory();

		foreach ( $result as $row ) {
			$title = $titleFactory->makeTitle(
				(int)$row->page_namespace,
				$row->page_title
			);

			$this->output(
				$title->getPrefixedText() . PHP_EOL
			);
		}
	}
}

$maintClass = FindTranslateRobotPages::class;
