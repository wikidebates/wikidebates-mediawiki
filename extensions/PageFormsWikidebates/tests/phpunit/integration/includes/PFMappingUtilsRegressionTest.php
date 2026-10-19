<?php

/**
 * @covers PFMappingUtils
 * @group Database
 * @group PageForms
 */
class PFMappingUtilsRegressionTest extends MediaWikiIntegrationTestCase {

	/** @dataProvider provideUnavailableTemplates */
	public function testUnavailableMappingTemplatePreservesValues( string $template ): void {
		$this->assertSame(
			[ 'Alpha' => 'Alpha', 0 => '0', 'Email@' => 'Email@' ],
			PFMappingUtils::getValuesWithMappingTemplate( [ 'Alpha', '0', 'Email@' ], $template )
		);
	}

	public static function provideUnavailableTemplates(): array {
		return [
			'missing template' => [ 'PFRegressionMissingTemplate' ],
			'invalid template title' => [ 'Invalid[Template' ],
			'empty template title' => [ '' ],
		];
	}

	public function testEmptyValuesNeedNoMapping(): void {
		$this->assertSame( [], PFMappingUtils::getValuesWithMappingTemplate( [], 'Invalid[Template' ) );
	}
}
