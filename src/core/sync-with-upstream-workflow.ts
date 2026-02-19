import * as path from 'node:path';
import { parseBranches } from './branch-list';
import {
	clearMemento,
	getMemento,
	isRebaseInProgress,
	readRebaseHeadName,
	saveMemento,
	TEMP_BRANCH_PREFIX,
	type SyncWithUpstreamDeps,
} from './sync-with-upstream-state';

export type { SyncWithUpstreamDeps } from './sync-with-upstream-state';
import type { QuickPickItemLike } from './sweep-workflow';

async function runSyncFlow(deps: SyncWithUpstreamDeps): Promise<void> {
	const workspaceRoot = deps.getWorkspaceRoot();
	if (!workspaceRoot) {
		deps.ui.showErrorMessage('Git Sweep Pro: Aucun dossier de workspace ouvert.');
		return;
	}

	const gitDir = path.join(workspaceRoot, '.git');
	if (!deps.fileExists(gitDir)) {
		deps.ui.showErrorMessage('Git Sweep Pro: Ce dossier n\'est pas un dépôt Git.');
		return;
	}

	deps.output.show(true);
	deps.output.appendLine('--- Sync With Upstream ---');
	deps.output.appendLine(`Workspace: ${workspaceRoot}`);

	const runGit = (args: string[]) => deps.runGitCommand(args, workspaceRoot);

	try {
		await deps.ui.withProgress(
			{ title: 'Git Sweep Pro: Récupération des remotes...' },
			() => runGit(['fetch', '-p'])
		);

		const [currentBranchResult, branchListResult] = await Promise.all([
			runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
			runGit(['branch', '-a']),
		]);

		const featureBranch = currentBranchResult.stdout.trim();
		if (!featureBranch || featureBranch === 'HEAD') {
			deps.ui.showErrorMessage(
				'Git Sweep Pro: Impossible de déterminer la branche actuelle (HEAD détaché ?).'
			);
			return;
		}

		const branchItems = parseBranches(branchListResult.stdout);
		if (branchItems.length === 0) {
			deps.ui.showInformationMessage(
				'Git Sweep Pro: Aucune autre branche disponible pour la synchronisation.'
			);
			return;
		}

		const quickPickItems = branchItems.map((b) => ({
			label: b.isRemote ? `${b.label} (remote)` : b.label,
			description: b.isRemote ? undefined : 'local',
			picked: false,
		}));

		const selected = await deps.ui.showQuickPick(quickPickItems, {
			canPickMany: false,
			ignoreFocusOut: true,
			matchOnDescription: true,
			title: 'Sync With Upstream: Choisir la branche à synchroniser',
			placeHolder: 'Branche locale ou distante',
		});

		const selectedItem: QuickPickItemLike | undefined =
			selected === undefined || Array.isArray(selected) ? undefined : (selected as QuickPickItemLike);
		if (!selectedItem) {
			deps.output.appendLine('Opération annulée.');
			return;
		}

		const chosenLabel = selectedItem.label;
		const targetItem = branchItems.find((b) => {
			const label = b.isRemote ? `${b.label} (remote)` : b.label;
			return label === chosenLabel;
		});
		if (!targetItem) {
			return;
		}

		const upstreamRef = targetItem.ref;
		let hasStash = false;

		try {
			const stashResult = await runGit(['stash', 'push', '-u', '-m', 'gsp-sync-with-upstream']);
			hasStash = !stashResult.stdout.includes('No local changes to save');
		} catch {
			deps.output.appendLine('[info] Aucun changement à stasher.');
		}

		let branchToRebaseOnto = upstreamRef;
		const isRemote = targetItem.isRemote;

		if (isRemote) {
			const safeSuffix = upstreamRef.replace(/[/\s]/g, '_').slice(0, 40);
			const tempBranch = `${TEMP_BRANCH_PREFIX}${safeSuffix}`;

			await deps.ui.withProgress(
				{ title: `Git Sweep Pro: Création branche temporaire sur ${upstreamRef}...` },
				() => runGit(['checkout', '-B', tempBranch, upstreamRef])
			);

			try {
				const slashIdx = upstreamRef.indexOf('/');
				const remoteName = upstreamRef.slice(0, slashIdx);
				const branchName = upstreamRef.slice(slashIdx + 1);
				await deps.ui.withProgress(
					{ title: `Git Sweep Pro: Pull sur ${upstreamRef}...` },
					() => runGit(['pull', remoteName, branchName])
				);
			} catch {
				deps.output.appendLine('[info] Pull ignoré (déjà à jour ou sans upstream).');
			}

			branchToRebaseOnto = tempBranch;
		} else {
			await deps.ui.withProgress(
				{ title: `Git Sweep Pro: Checkout ${upstreamRef}...` },
				() => runGit(['checkout', upstreamRef])
			);

			try {
				await deps.ui.withProgress(
					{ title: `Git Sweep Pro: Pull sur ${upstreamRef}...` },
					() => runGit(['pull'])
				);
			} catch {
				deps.output.appendLine('[info] Pull ignoré.');
			}
		}

		await deps.ui.withProgress(
			{ title: `Git Sweep Pro: Retour sur ${featureBranch}...` },
			() => runGit(['checkout', featureBranch])
		);

		try {
			await deps.ui.withProgress(
				{ title: `Git Sweep Pro: Rebase sur ${upstreamRef}...` },
				() => runGit(['rebase', branchToRebaseOnto])
			);
		} catch (rebaseError) {
			const err = rebaseError as Error & { stderr?: string };
			const msg = [err.message, err.stderr ?? ''].join(' ').toLowerCase();
			const isConflict = msg.includes('conflict') || msg.includes('could not apply');

			if (isConflict) {
				await saveMemento(deps, {
					workspaceRoot,
					featureBranch,
					hasStash,
					upstreamRef,
					...(isRemote && { tempBranchToCleanup: branchToRebaseOnto }),
				});
				deps.ui.showInformationMessage(
					'Git Sweep Pro: Conflits de rebase. Résolvez-les, puis exécutez "Sync With Upstream: Reprendre" pour continuer.'
				);
				deps.output.appendLine('--- Rebase en pause (conflits) ---');
				return;
			}
			throw rebaseError;
		}

		try {
			await deps.ui.withProgress(
				{ title: 'Git Sweep Pro: Force push...' },
				() => runGit(['push', '--force-with-lease'])
			);
		} catch (pushError) {
			const msg = pushError instanceof Error ? pushError.message : String(pushError);
			deps.ui.showErrorMessage(`Git Sweep Pro: Échec du push: ${msg}`);
			await runGit(['rebase', '--abort']).catch(() => {});
			throw pushError;
		}

		if (isRemote) {
			try {
				await runGit(['branch', '-D', branchToRebaseOnto]);
			} catch {
				deps.output.appendLine(`[info] Branche temporaire ${branchToRebaseOnto} non supprimée.`);
			}
			const slashIdx = upstreamRef.indexOf('/');
			const localUpstream = slashIdx > 0 ? upstreamRef.slice(slashIdx + 1) : upstreamRef;
			try {
				await runGit(['branch', '-f', localUpstream, upstreamRef]);
				deps.output.appendLine(`Branche locale ${localUpstream} synchronisée avec ${upstreamRef}.`);
			} catch {
				deps.output.appendLine(`[info] Mise à jour de ${localUpstream} ignorée.`);
			}
		}

		if (hasStash) {
			try {
				await deps.ui.withProgress(
					{ title: 'Git Sweep Pro: Récupération du stash...' },
					() => runGit(['stash', 'pop'])
				);
			} catch (popError) {
				deps.ui.showErrorMessage(
					`Git Sweep Pro: Le rebase a réussi mais stash pop a échoué. Utilisez "git stash pop" manuellement.`
				);
				deps.output.appendLine(`[stash-pop-error] ${popError}`);
			}
		}

		deps.output.appendLine('--- Sync With Upstream terminé ---');
		deps.ui.showInformationMessage(`Git Sweep Pro: ${featureBranch} synchronisée avec ${upstreamRef}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const lowerMessage = message.toLowerCase();

		if (lowerMessage.includes('not a git repository')) {
			deps.ui.showErrorMessage('Git Sweep Pro: Ce dossier n\'est pas un dépôt Git.');
		} else if (lowerMessage.includes('command not found') || lowerMessage.includes('enoent')) {
			deps.ui.showErrorMessage('Git Sweep Pro: Git n\'est pas installé ou pas dans le PATH.');
		} else {
			deps.ui.showErrorMessage(`Git Sweep Pro: ${message}`);
		}
		deps.output.appendLine(`[error] ${message}`);
		deps.output.appendLine('--- Sync With Upstream échoué ---');
	}
}

async function runResumeFlow(deps: SyncWithUpstreamDeps): Promise<void> {
	const workspaceRoot = deps.getWorkspaceRoot();
	if (!workspaceRoot) {
		deps.ui.showErrorMessage('Git Sweep Pro: Aucun dossier de workspace ouvert.');
		return;
	}

	const gitDir = path.join(workspaceRoot, '.git');
	if (!deps.fileExists(gitDir)) {
		deps.ui.showErrorMessage('Git Sweep Pro: Ce dossier n\'est pas un dépôt Git.');
		return;
	}

	deps.output.show(true);
	deps.output.appendLine('--- Sync With Upstream: Reprise ---');

	const runGit = (args: string[]) => deps.runGitCommand(args, workspaceRoot);

	const rebaseActive = isRebaseInProgress(gitDir, deps);
	const memento = getMemento(deps);

	if (!rebaseActive && !memento) {
		deps.ui.showInformationMessage(
			'Git Sweep Pro: Aucun rebase en cours et aucun état sauvegardé. Rien à reprendre.'
		);
		deps.output.appendLine('Rien à reprendre.');
		return;
	}

	if (rebaseActive && memento && memento.workspaceRoot !== workspaceRoot) {
		deps.ui.showErrorMessage(
			'Git Sweep Pro: Un rebase est en cours dans un autre workspace. Ouvrez le bon dossier.'
		);
		return;
	}

	const featureBranch = memento?.featureBranch ?? readRebaseHeadName(gitDir, deps);
	if (!featureBranch) {
		deps.ui.showErrorMessage(
			'Git Sweep Pro: Impossible de déterminer la branche en cours de rebase.'
		);
		return;
	}

	const hasStash = memento?.hasStash ?? false;
	const tempBranchToCleanup = memento?.tempBranchToCleanup;

	if (rebaseActive) {
		try {
			await deps.ui.withProgress(
				{ title: 'Git Sweep Pro: Rebase --continue...' },
				() => runGit(['rebase', '--continue'])
			);
		} catch (continueError) {
			const msg = continueError instanceof Error ? continueError.message : String(continueError);
			if (msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('could not apply')) {
				deps.ui.showErrorMessage(
					'Git Sweep Pro: Conflits restants. Résolvez-les puis rappelez "Sync With Upstream: Reprendre".'
				);
				deps.output.appendLine(`[error] ${msg}`);
				return;
			}
			deps.ui.showErrorMessage(`Git Sweep Pro: ${msg}`);
			deps.output.appendLine(`[error] ${msg}`);
			return;
		}
	} else {
		deps.output.appendLine(
			'[info] Aucun rebase en cours (déjà terminé manuellement ?). Passage au push et au nettoyage.'
		);
	}

	try {
		await deps.ui.withProgress(
			{ title: 'Git Sweep Pro: Force push...' },
			() => runGit(['push', '--force-with-lease'])
		);
	} catch (pushError) {
		deps.ui.showErrorMessage(
			`Git Sweep Pro: Rebase OK mais push échoué: ${pushError instanceof Error ? pushError.message : pushError}`
		);
		throw pushError;
	}

	if (tempBranchToCleanup) {
		try {
			await runGit(['branch', '-D', tempBranchToCleanup]);
		} catch {
			deps.output.appendLine(`[info] Branche temporaire ${tempBranchToCleanup} non supprimée.`);
		}
	}

	if (hasStash) {
		try {
			await deps.ui.withProgress(
				{ title: 'Git Sweep Pro: Récupération du stash...' },
				() => runGit(['stash', 'pop'])
			);
		} catch (popError) {
			deps.ui.showErrorMessage(
				'Git Sweep Pro: Le stash n\'a pas pu être récupéré. Utilisez "git stash pop" manuellement.'
			);
			deps.output.appendLine(`[stash-pop-error] ${popError}`);
		}
	}

	await clearMemento(deps);
	deps.output.appendLine('--- Reprise terminée ---');
	deps.ui.showInformationMessage(`Git Sweep Pro: ${featureBranch} synchronisée avec succès.`);
}

export async function runSyncWithUpstreamWorkflow(deps: SyncWithUpstreamDeps): Promise<void> {
	if (deps.getWorkspaceRoot() && isRebaseInProgress(path.join(deps.getWorkspaceRoot()!, '.git'), deps)) {
		deps.ui.showInformationMessage(
			'Git Sweep Pro: Un rebase est déjà en cours. Utilisez "Sync With Upstream: Reprendre" pour continuer.'
		);
		return;
	}
	await runSyncFlow(deps);
}

export async function runSyncWithUpstreamResumeWorkflow(deps: SyncWithUpstreamDeps): Promise<void> {
	await runResumeFlow(deps);
}
