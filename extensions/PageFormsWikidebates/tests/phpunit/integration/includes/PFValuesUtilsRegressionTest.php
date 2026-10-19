<?php

/**
 * @covers PFValuesUtils
 * @group Database
 * @group PageForms
 */
class PFValuesUtilsRegressionTest extends MediaWikiIntegrationTestCase {

	public function testSortingPreservesNumericTitlesAndTrailingAtSigns(): void {
		$this->assertSame(
			[ 123 => 'Numeric', 'Email@' => 'Email', 'Double@@' => 'Double', 'Zulu' => 'Last' ],
			PFValuesUtils::fixedMultiSort(
				[ 'Zulu' => 'D', 123 => 'A', 'Email@' => 'B', 'Double@@' => 'C' ],
				[ 'Zulu@' => 'Last', '123@' => 'Numeric', 'Email@@' => 'Email', 'Double@@@' => 'Double' ]
			)
		);
	}

	public function testCategoryTraversalPreservesTitlesAndHandlesCycles(): void {
		$this->setMwGlobals( [
			'wgPageFormsUseDisplayTitle' => false,
			'wgPageFormsMaxLocalAutocompleteValues' => 100,
		] );
		$this->insertPage( 'Category:PFRegressionRoot', '[[Category:PFRegressionChild]]' );
		$this->insertPage( 'Category:PFRegressionChild', '[[Category:PFRegressionRoot]]' );
		$this->insertPage( 'PF Regression Email@', '[[Category:PFRegressionRoot]]' );
		$this->insertPage( 'PF Regression Child', '[[Category:PFRegressionChild]]' );
		$this->insertPage( 'PF Regression Shared', '[[Category:PFRegressionRoot]][[Category:PFRegressionChild]]' );

		$values = PFValuesUtils::getAllPagesForCategory( 'PFRegressionRoot', 5 );
		$this->assertCount( 3, $values );
		$this->assertSame( 'PF Regression Email@', $values['PF Regression Email@'] );
		$this->assertArrayHasKey( 'PF Regression Child', $values );
		$this->assertArrayHasKey( 'PF Regression Shared', $values );
		$this->assertSame(
			[ 'PFRegressionRoot' ],
			PFValuesUtils::getAllPagesForCategory( 'PFRegressionRoot', 0 )
		);
	}
}
