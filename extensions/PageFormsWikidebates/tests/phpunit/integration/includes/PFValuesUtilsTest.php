<?php

use MediaWiki\Title\Title;

/**
 * @covers \PFValuesUtils
 * @group PageForms
 * @group Database
 */
class PFValuesUtilsTest extends MediaWikiIntegrationTestCase {
	protected function setUp(): void {
		parent::setUp();
		$this->setMwGlobals( [
			'wgPageFormsUseDisplayTitle' => false,
			'wgPageFormsMaxAutocompleteValues' => 3,
		] );
	}

	private function addMember( string $name, string $category, int $namespace = NS_MAIN ): int {
		$page = $this->getExistingTestPage( Title::makeTitle( $namespace, $name ) );
		$db = $this->getDb();
		$db->insert( 'categorylinks', [
			'cl_from' => $page->getId(),
			'cl_to' => $category,
			'cl_sortkey' => $name,
			'cl_timestamp' => $db->timestamp(),
			'cl_type' => $namespace === NS_CATEGORY ? 'subcat' : 'page',
		], __METHOD__ );
		return $page->getId();
	}

	public function testPageLimitDoesNotHideSubcategories(): void {
		for ( $i = 0; $i < 5; $i++ ) {
			$this->addMember( 'Direct' . $i, 'PFRoot' );
		}
		$this->addMember( 'PFChild', 'PFRoot', NS_CATEGORY );
		$this->addMember( 'Descendant', 'PFChild' );

		$values = PFValuesUtils::getAllPagesForCategory( 'PFRoot', 2 );
		$this->assertArrayHasKey( 'Descendant', $values );
		$this->assertArrayNotHasKey( 'Category:PFChild', $values );
		$this->assertCount( 4, $values, 'The page limit still applies separately to each category' );
	}

	public function testSearchTraversesNonMatchingCategoriesAndRespectsDepth(): void {
		$this->addMember( 'PFBranch', 'PFRoot', NS_CATEGORY );
		$this->addMember( 'PFDeep', 'PFBranch', NS_CATEGORY );
		$this->addMember( 'NeedleLeaf', 'PFDeep' );

		$this->assertSame( [], PFValuesUtils::getAllPagesForCategory( 'PFRoot', 2, 'Needle' ) );
		$this->assertSame( [ 'NeedleLeaf' => 'NeedleLeaf' ],
			PFValuesUtils::getAllPagesForCategory( 'PFRoot', 3, 'Needle' ) );
	}

	public function testCyclesAndSharedMembersDoNotDuplicateResults(): void {
		$this->addMember( 'PFLeft', 'PFRoot', NS_CATEGORY );
		$this->addMember( 'PFRight', 'PFRoot', NS_CATEGORY );
		$this->addMember( 'PFRoot', 'PFLeft', NS_CATEGORY );
		$this->addMember( 'SharedLeaf', 'PFLeft' );
		$this->addMember( 'SharedLeaf', 'PFRight' );

		$this->assertSame( [ 'SharedLeaf' => 'SharedLeaf' ],
			PFValuesUtils::getAllPagesForCategory( 'PFRoot', 10 ) );
	}

	public function testDisplayTitleMatchingAndDefaultSortArePreserved(): void {
		$this->setMwGlobals( 'wgPageFormsUseDisplayTitle', true );
		$first = $this->addMember( 'CanonicalFirst', 'PFRoot' );
		$second = $this->addMember( 'CanonicalSecond', 'PFRoot' );
		$this->getDb()->insert( 'page_props', [
			[ 'pp_page' => $first, 'pp_propname' => 'displaytitle', 'pp_value' => 'Needle Zebra' ],
			[ 'pp_page' => $first, 'pp_propname' => 'defaultsort', 'pp_value' => 'Z' ],
			[ 'pp_page' => $second, 'pp_propname' => 'displaytitle', 'pp_value' => 'Needle Alpha' ],
			[ 'pp_page' => $second, 'pp_propname' => 'defaultsort', 'pp_value' => 'A' ],
		], __METHOD__ );

		$this->assertSame( [ 'CanonicalSecond' => 'Needle Alpha', 'CanonicalFirst' => 'Needle Zebra' ],
			PFValuesUtils::getAllPagesForCategory( 'PFRoot', 1, 'Needle' ) );
	}
}
