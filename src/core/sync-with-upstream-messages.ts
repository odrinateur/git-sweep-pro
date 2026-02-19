/**
 * Centralized user-visible strings for the Sync With Upstream workflow.
 * Kept in English to match command palette titles in package.json.
 */
const PREFIX = 'Git Sweep Pro:';

export const syncMessages = {
	noWorkspace: `${PREFIX} No workspace folder is open.`,
	notGitRepo: `${PREFIX} The selected workspace folder is not a Git repository.`,
	gitNotInstalled: `${PREFIX} Git is not installed or not available in PATH.`,
	errorGeneric: (msg: string) => `${PREFIX} ${msg}`,

	// runSyncFlow
	couldNotDetermineBranch: `${PREFIX} Could not determine current branch (detached HEAD?).`,
	noBranchesForSync: `${PREFIX} No other branches available for sync.`,
	pickBranchTitle: 'Sync With Upstream: Choose branch to sync with',
	pickBranchPlaceholder: 'Local or remote branch',
	operationCancelled: 'Operation cancelled.',
	fetchingRemotes: `${PREFIX} Fetching remotes...`,
	creatingTempBranch: (ref: string) => `${PREFIX} Creating temporary branch for ${ref}...`,
	pulling: (ref: string) => `${PREFIX} Pulling ${ref}...`,
	checkingOut: (ref: string) => `${PREFIX} Checking out ${ref}...`,
	returningTo: (branch: string) => `${PREFIX} Returning to ${branch}...`,
	rebasing: (ref: string) => `${PREFIX} Rebasing onto ${ref}...`,
	forcePush: `${PREFIX} Force push...`,
	recoveringStash: `${PREFIX} Recovering stash...`,
	rebaseConflicts: `${PREFIX} Rebase conflicts. Resolve them, then run "Sync With Upstream (Resume)" to continue.`,
	pushFailed: (msg: string) => `${PREFIX} Push failed: ${msg}`,
	rebaseOkStashFailed: `${PREFIX} Rebase succeeded but stash pop failed. Use "git stash pop" manually.`,
	stashPopFailed: `${PREFIX} Stash could not be recovered. Use "git stash pop" manually.`,
	syncedWith: (branch: string, upstream: string) => `${PREFIX} ${branch} synced with ${upstream}.`,
	syncedSuccess: (branch: string) => `${PREFIX} ${branch} synced successfully.`,

	// runResumeFlow
	noRebaseNothingToResume: `${PREFIX} No rebase in progress and no saved state. Nothing to resume.`,
	rebaseInOtherWorkspace: `${PREFIX} A rebase is in progress in another workspace. Open the correct folder.`,
	couldNotDetermineRebaseBranch: `${PREFIX} Could not determine branch for in-progress rebase.`,
	remainingConflicts: `${PREFIX} Conflicts remain. Resolve them and run "Sync With Upstream (Resume)" again.`,
	rebaseOkPushFailed: (msg: string) => `${PREFIX} Rebase OK but push failed: ${msg}`,
	rebaseContinue: `${PREFIX} Rebase --continue...`,
	rebaseAlreadyInProgress: `${PREFIX} A rebase is already in progress. Use "Sync With Upstream (Resume)" to continue.`,

	// output panel
	outputHeader: '--- Sync With Upstream ---',
	outputResumeHeader: '--- Sync With Upstream: Resume ---',
	outputRebasePaused: '--- Rebase paused (conflicts) ---',
	outputComplete: '--- Sync With Upstream complete ---',
	outputFailed: '--- Sync With Upstream failed ---',
	outputResumeComplete: '--- Resume complete ---',
	nothingToResume: 'Nothing to resume.',
	infoNoStash: '[info] No changes to stash.',
	infoPullSkipped: '[info] Pull skipped (already up to date or no upstream).',
	infoPullSkippedLocal: '[info] Pull skipped.',
	infoTempBranchNotDeleted: (branch: string) => `[info] Temporary branch ${branch} not deleted.`,
	infoLocalBranchSynced: (local: string, remote: string) => `Local branch ${local} synced with ${remote}.`,
	infoUpdateSkipped: (branch: string) => `[info] Update of ${branch} skipped.`,
	infoNoRebaseInProgress:
		'[info] No rebase in progress (already completed manually?). Proceeding to push and cleanup.',
} as const;
