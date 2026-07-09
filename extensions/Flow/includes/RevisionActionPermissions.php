<?php

namespace Flow;

use Closure;
use Flow\Collection\CollectionCache;
use Flow\Collection\PostCollection;
use Flow\Exception\DataModelException;
use Flow\Model\AbstractRevision;
use Flow\Model\PostRevision;
use Flow\Model\PostSummary;
use Flow\Model\Workflow;
use MediaWiki\MediaWikiServices;
use MediaWiki\User\User;

/**
 * Role based security for revisions based on moderation state
 */
class RevisionActionPermissions {
	/**
	 * @var FlowActions
	 */
	protected $actions;

	/**
	 * @var User
	 */
	protected $user;

	/**
	 * Per-request memoization for permission checks.
	 *
	 * @var bool[]
	 */
	protected $isAllowedCache = [];

	/**
	 * Per-request cache of topic root revisions keyed by topic id.
	 *
	 * @var AbstractRevision[]
	 */
	protected $rootRevisionCache = [];

	/**
	 * Per-request cache of board workflows keyed by workflow id.
	 *
	 * @var Workflow[]
	 */
	protected $boardWorkflowCache = [];

	/**
	 * Per-request cache of root permission checks.
	 *
	 * @var bool[]
	 */
	protected $rootAllowedCache = [];

	/**
	 * Per-request cache of board permission checks.
	 *
	 * @var bool[]
	 */
	protected $boardAllowedCache = [];

	/**
	 * @param FlowActions $actions
	 * @param User $user
	 */
	public function __construct( FlowActions $actions, User $user ) {
		$this->user = $user;
		$this->actions = $actions;
	}

	/**
	 * Get the name of all the actions the user is allowed to perform.
	 *
	 * @param AbstractRevision|null $revision The revision to check permissions against
	 * @return array Array of action names that are allowed
	 */
	public function getAllowedActions( ?AbstractRevision $revision = null ) {
		$allowed = [];
		foreach ( array_keys( $this->actions->getActions() ) as $action ) {
			if ( $this->isAllowedAny( $revision, $action ) ) {
				$allowed[] = $action;
			}
		}
		return $allowed;
	}

	/**
	 * Check if a user is allowed to perform a certain action.
	 *
	 * @param AbstractRevision $revision
	 * @param string $action
	 * @return bool
	 */
	public function isAllowed( AbstractRevision $revision, $action ) {
		$revisionId = $revision->getRevisionId()->getAlphadecimal();
		$cacheKey = $revisionId . ':' . $action;
		if ( array_key_exists( $cacheKey, $this->isAllowedCache ) ) {
			return $this->isAllowedCache[$cacheKey];
		}

		$result = $this->computeIsAllowed( $revision, $action );
		$this->isAllowedCache[$cacheKey] = $result;

		return $result;
	}

	/**
	 * @param AbstractRevision $revision
	 * @param string $action
	 * @return bool
	 */
	protected function computeIsAllowed( AbstractRevision $revision, $action ) {
		// check if we're allowed to $action on this revision
		if ( !$this->isRevisionAllowed( $revision, $action ) ) {
			return false;
		}

		$root = $this->getCachedRoot( $revision );
		// see if we're allowed to perform $action on anything inside this root
		if ( !$revision->getRevisionId()->equals( $root->getRevisionId() ) &&
			!$this->isRootAllowedCached( $root, $action )
		) {
			return false;
		}

		$workflow = $this->getCachedBoardWorkflow( $revision );
		// see if we're allowed to perform $action on anything inside this board
		if ( !$this->isBoardAllowedCached( $workflow, $action ) ) {
			return false;
		}

		/** @var CollectionCache $cache */
		$cache = Container::get( 'collection.cache' );
		$last = $cache->getLastRevisionFor( $revision );
		// Also check if the user would be allowed to perform this
		// against the most recent revision - the last revision is the
		// current state of an object, so checking against a revision at
		// one point in time alone isn't enough.
		$isLastRevision = $last->getRevisionId()->equals( $revision->getRevisionId() );
		if ( !$isLastRevision && !$this->isRevisionAllowed( $last, $action ) ) {
			return false;
		}

		return true;
	}

	/**
	 * Check if a user is allowed to perform certain actions.
	 *
	 * @param AbstractRevision|null $revision
	 * @param string $action Multiple parameters to check if either of the provided actions are allowed
	 * @return bool
	 */
	public function isAllowedAny( ?AbstractRevision $revision, $action /* [, $action2 [, ... ]] */ ) {
		$actions = func_get_args();
		// Pull $revision out of the actions list
		array_shift( $actions );

		foreach ( $actions as $action ) {
			if ( $this->isAllowed( $revision, $action ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if a user is allowed to perform a certain action, against the latest
	 * root(topic) post related to the provided revision.  This is required for
	 * things like preventing replies to locked topics.
	 *
	 * @param AbstractRevision $root
	 * @param string $action
	 * @return bool
	 */
	public function isRootAllowed( AbstractRevision $root, $action ) {
		// If the `root-permissions` key is not set then it is allowed
		if ( !$this->actions->hasValue( $action, 'root-permissions' ) ) {
			return true;
		}

		$permission = $this->getPermission( $root, $action, 'root-permissions' );

		// If `root-permissions` is defined but not for the current state
		// then action is denied
		if ( $permission === null ) {
			return false;
		}

		return MediaWikiServices::getInstance()->getPermissionManager()
			->userHasAnyRight( $this->user, ...(array)$permission );
	}

	/**
	 * Check if a user is allowed to perform a certain action, depending on the
	 * status (deleted?) of the board.
	 *
	 * @param Workflow $workflow
	 * @param string $action
	 * @return bool
	 */
	public function isBoardAllowed( Workflow $workflow, $action ) {
		$permissions = $this->actions->getValue( $action, 'core-delete-permissions' );

		// If user is allowed to see deleted page content, there's no need to
		// even check if it's been deleted (additional storage lookup)
		$allowed = MediaWikiServices::getInstance()->getPermissionManager()
			->userHasAnyRight( $this->user, ...(array)$permissions );
		if ( $allowed ) {
			return true;
		}

		return !$workflow->isDeleted();
	}

	/**
	 * Check if a user is allowed to perform a certain action, only against 1
	 * specific revision (whereas the default isAllowed() will check if the
	 * given $action is allowed for both given and the most current revision)
	 *
	 * @param AbstractRevision|null $revision
	 * @param string $action
	 * @return bool
	 */
	public function isRevisionAllowed( ?AbstractRevision $revision, $action ) {
		// Users must have the core 'edit' permission to perform any write action in flow
		$performsWrites = $this->actions->getValue( $action, 'performs-writes' );
		$pm = MediaWikiServices::getInstance()->getPermissionManager();
		if ( $performsWrites && !$pm->userHasRight( $this->user, 'edit' ) ) {
			return false;
		}

		$permission = $this->getPermission( $revision, $action );

		// If no permission is defined for this state, then the action is not allowed
		// check if permission is set for this action
		if ( $permission === null ) {
			return false;
		}

		// Check if user is allowed to perform action against this revision
		return $pm->userHasAnyRight( $this->user, ...(array)$permission );
	}

	/**
	 * Returns the permission specified in FlowActions for the given action
	 * against the given revision's moderation state.
	 *
	 * @param AbstractRevision|null $revision
	 * @param string $action
	 * @param string $type
	 * @return Closure|string
	 */
	public function getPermission( ?AbstractRevision $revision, $action, $type = 'permissions' ) {
		// $revision may be null if the revision has yet to be created
		$moderationState = AbstractRevision::MODERATED_NONE;
		if ( $revision !== null ) {
			$moderationState = $revision->getModerationState();
		}
		$permission = $this->actions->getValue( $action, $type, $moderationState );

		// Some permissions may be more complex to be defined as simple array
		// values, in which case they're a Closure (which will accept
		// AbstractRevision & FlowActionPermissions as arguments)
		if ( $permission instanceof Closure ) {
			$permission = $permission( $revision, $this );
		}

		return $permission;
	}


	/**
	 * Warm per-request caches used by topic list rendering.
	 *
	 * @param AbstractRevision[] $revisions
	 * @return void
	 */
	public function primeCacheForView( array $revisions ) {
		foreach ( $revisions as $revision ) {
			if ( !( $revision instanceof AbstractRevision ) ) {
				continue;
			}

			$this->getCachedRoot( $revision );
			$this->getCachedBoardWorkflow( $revision );
		}
	}

	/**
	 * @param AbstractRevision $revision
	 * @return AbstractRevision
	 */
	protected function getCachedRoot( AbstractRevision $revision ) {
		$topicKey = $this->getTopicCacheKey( $revision );
		if ( isset( $this->rootRevisionCache[$topicKey] ) ) {
			return $this->rootRevisionCache[$topicKey];
		}

		$root = $this->getRoot( $revision );
		$this->rootRevisionCache[$topicKey] = $root;

		return $root;
	}

	/**
	 * @param AbstractRevision $revision
	 * @return Workflow
	 */
	protected function getCachedBoardWorkflow( AbstractRevision $revision ) {
		$workflowKey = $this->getBoardWorkflowCacheKey( $revision );
		if ( isset( $this->boardWorkflowCache[$workflowKey] ) ) {
			return $this->boardWorkflowCache[$workflowKey];
		}

		$collection = $revision->getCollection();
		$workflow = $collection->getBoardWorkflow();
		$this->boardWorkflowCache[$workflowKey] = $workflow;

		return $workflow;
	}

	/**
	 * @param AbstractRevision $root
	 * @param string $action
	 * @return bool
	 */
	protected function isRootAllowedCached( AbstractRevision $root, $action ) {
		$cacheKey = $root->getRevisionId()->getAlphadecimal() . ':' . $action;
		if ( array_key_exists( $cacheKey, $this->rootAllowedCache ) ) {
			return $this->rootAllowedCache[$cacheKey];
		}

		$result = $this->isRootAllowed( $root, $action );
		$this->rootAllowedCache[$cacheKey] = $result;

		return $result;
	}

	/**
	 * @param Workflow $workflow
	 * @param string $action
	 * @return bool
	 */
	protected function isBoardAllowedCached( Workflow $workflow, $action ) {
		$cacheKey = $workflow->getId()->getAlphadecimal() . ':' . $action;
		if ( array_key_exists( $cacheKey, $this->boardAllowedCache ) ) {
			return $this->boardAllowedCache[$cacheKey];
		}

		$result = $this->isBoardAllowed( $workflow, $action );
		$this->boardAllowedCache[$cacheKey] = $result;

		return $result;
	}

	/**
	 * @param AbstractRevision $revision
	 * @return string
	 */
	protected function getTopicCacheKey( AbstractRevision $revision ) {
		if ( $revision instanceof PostSummary ) {
			return $revision->getSummaryTargetId()->getAlphadecimal();
		}

		try {
			return $revision->getCollection()->getWorkflowId()->getAlphadecimal();
		} catch ( DataModelException $e ) {
			return $revision->getRevisionId()->getAlphadecimal();
		}
	}

	/**
	 * @param AbstractRevision $revision
	 * @return string
	 */
	protected function getBoardWorkflowCacheKey( AbstractRevision $revision ) {
		try {
			return $revision->getCollection()->getBoardWorkflow()->getId()->getAlphadecimal();
		} catch ( DataModelException $e ) {
			return $this->getTopicCacheKey( $revision );
		}
	}
	/**
	 * @param AbstractRevision $revision
	 * @return AbstractRevision
	 */
	protected function getRoot( AbstractRevision $revision ) {
		if ( $revision instanceof PostSummary ) {
			$topicId = $revision->getSummaryTargetId();
		} elseif ( $revision instanceof PostRevision && !$revision->isTopicTitle() ) {
			try {
				$topicId = $revision->getCollection()->getWorkflowId();
			} catch ( DataModelException $e ) {
				// failed to locate root post (most likely in unit tests, where
				// we didn't store the tree)
				return $revision;
			}
		} else {
			// if we can't the revision it back to a root, this revision is root
			return $revision;
		}

		$collection = PostCollection::newFromId( $topicId );
		return $collection->getLastRevision();
	}

	/**
	 * @return User
	 */
	public function getUser() {
		return $this->user;
	}

	/**
	 * @return FlowActions
	 */
	public function getActions() {
		return $this->actions;
	}

	/**
	 * @param User $user
	 */
	public function setUser( User $user ) {
		$this->user = $user;
	}
}
