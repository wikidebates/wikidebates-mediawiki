<?php

namespace MediaWiki\Extension\Wikidebates;

use MediaWiki\Auth\AbstractPreAuthenticationProvider;
use StatusValue;

class RequireEmailPreAuthenticationProvider extends AbstractPreAuthenticationProvider {

	public function testForAccountCreation( $user, $creator, array $reqs ) {
		$email = null;

		foreach ( $reqs as $req ) {
			if ( property_exists( $req, 'email' ) ) {
				$email = $req->email;
				break;
			}
		}

		if ( trim( (string)$email ) === '' ) {
			return StatusValue::newFatal( 'Email address is required.' );
		}

		return StatusValue::newGood();
	}

}
