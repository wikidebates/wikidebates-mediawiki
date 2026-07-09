<?php

namespace MediaWiki\Extension\Wikidebates;

use Content;
use TextContent;

class ContentHelper {

	public static function getText( Content $content ): string {
		if ( $content instanceof TextContent ) {
			return $content->getText();
		}

		if ( method_exists( $content, 'getNativeData' ) ) {
			$data = $content->getNativeData();

			if ( is_string( $data ) ) {
				return $data;
			}
		}

		return method_exists( $content, 'serialize' )
			? (string)$content->serialize()
			: '';
	}
}
