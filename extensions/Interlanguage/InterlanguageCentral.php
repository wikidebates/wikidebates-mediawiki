<?php

$wgInterlanguageCentralExtensionIndexUrl = "";

$wgExtensionCredits['parserhook'][] = [
	'name' => 'Interlanguage Central',
	'author' => 'Nikola Smolenski',
	'url' => 'https://www.mediawiki.org/wiki/Extension:Interlanguage',
	'version' => '2.0.0',
	'descriptionmsg' => 'interlanguagecentral-desc',
];

$wgMessagesDirs['InterlanguageCentral'] = __DIR__ . '/i18n/central';

$wgAutoloadClasses['InterlanguageCentralExtensionPurgeJob'] =
	__DIR__ . '/InterlanguageCentralExtensionPurgeJob.php';
