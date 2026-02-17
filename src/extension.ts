import * as vscode from 'vscode';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const OUTPUT_CHANNEL_NAME = 'Git Sweep';

type SweepMode = {
	readonly dryRun: boolean;
	readonly forceDelete: boolean;
};

function getWorkspaceRoot(): string | undefined {
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (folder) {
			return folder.uri.fsPath;
		}
	}

	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runGitCommand(
	command: string,
	cwd: string,
	outputChannel: vscode.OutputChannel
): Promise<{ stdout: string; stderr: string }> {
	outputChannel.appendLine(`$ ${command}`);
	try {
		const result = await execAsync(command, { cwd });
		if (result.stdout.trim()) {
			outputChannel.appendLine(result.stdout.trim());
		}
		if (result.stderr.trim()) {
			outputChannel.appendLine(`[stderr] ${result.stderr.trim()}`);
		}

		return {
			stdout: result.stdout,
			stderr: result.stderr,
		};
	} catch (error) {
		const execError = error as Error & { stdout?: string; stderr?: string };
		if (execError.stdout?.trim()) {
			outputChannel.appendLine(execError.stdout.trim());
		}
		if (execError.stderr?.trim()) {
			outputChannel.appendLine(`[stderr] ${execError.stderr.trim()}`);
		}
		outputChannel.appendLine(`[error] ${execError.message}`);
		throw execError;
	}
}

function parseGoneBranches(branchVvOutput: string): string[] {
	return branchVvOutput
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.includes(': gone]'))
		.map((line) => {
			const sanitized = line.replace(/^\*\s+/, '');
			return sanitized.split(/\s+/)[0];
		})
		.filter((name) => name.length > 0);
}

async function runSweep(mode: SweepMode, outputChannel: vscode.OutputChannel): Promise<void> {
	const workspaceRoot = getWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showErrorMessage('Git Sweep Pro: No workspace folder is open.');
		return;
	}

	outputChannel.show(true);
	outputChannel.appendLine('--- Git Sweep session started ---');
	outputChannel.appendLine(`Workspace: ${workspaceRoot}`);
	outputChannel.appendLine(`Mode: ${mode.dryRun ? 'dry-run' : 'delete'}, delete flag: ${mode.forceDelete ? '-D' : '-d'}`);

	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Git Sweep Pro: Fetching and pruning remote references...',
				cancellable: false,
			},
			() => runGitCommand('git fetch -p', workspaceRoot, outputChannel)
		);

		const branchResult = await runGitCommand('git branch -vv', workspaceRoot, outputChannel);
		const goneBranches = parseGoneBranches(branchResult.stdout);

		if (goneBranches.length === 0) {
			outputChannel.appendLine('No stale tracked branches found.');
			vscode.window.showInformationMessage('Git Sweep Pro: No stale branches found.');
			return;
		}

		const quickPickItems: vscode.QuickPickItem[] = goneBranches.map((branch) => ({
			label: branch,
			picked: true,
		}));

		const selected = await vscode.window.showQuickPick(quickPickItems, {
			canPickMany: true,
			ignoreFocusOut: true,
			matchOnDescription: true,
			title: mode.dryRun ? 'Git Sweep Pro: Select branches to include in dry run' : 'Git Sweep Pro: Select branches to delete',
			placeHolder: 'All stale tracked branches are pre-selected. Uncheck any you want to keep.',
		});

		if (!selected || selected.length === 0) {
			outputChannel.appendLine('Operation cancelled or no branches selected.');
			vscode.window.showInformationMessage('Git Sweep Pro: No branches selected.');
			return;
		}

		const branchNames = selected.map((item) => item.label);
		outputChannel.appendLine(`${mode.dryRun ? '[DRY RUN]' : '[DELETE]'} Selected branches:`);
		for (const branch of branchNames) {
			outputChannel.appendLine(`- ${branch}`);
		}

		if (mode.dryRun) {
			vscode.window.showInformationMessage(
				`Git Sweep Pro (dry run): ${branchNames.length} branch(es) would be deleted.`
			);
			return;
		}

		let deletedCount = 0;
		const deleteFlag = mode.forceDelete ? '-D' : '-d';

		for (const branch of branchNames) {
			try {
				await runGitCommand(`git branch ${deleteFlag} ${JSON.stringify(branch)}`, workspaceRoot, outputChannel);
				deletedCount += 1;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				outputChannel.appendLine(`[delete-failed] ${branch}: ${message}`);
			}
		}

		if (deletedCount === branchNames.length) {
			vscode.window.showInformationMessage(`Git Sweep Pro: Deleted ${deletedCount} branch(es).`);
		} else {
			vscode.window.showErrorMessage(
				`Git Sweep Pro: Deleted ${deletedCount}/${branchNames.length} branch(es). See "Git Sweep" output for details.`
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const lowerMessage = message.toLowerCase();

		if (lowerMessage.includes('not a git repository')) {
			vscode.window.showErrorMessage('Git Sweep Pro: The selected workspace folder is not a Git repository.');
		} else if (lowerMessage.includes('command not found') || lowerMessage.includes('enoent')) {
			vscode.window.showErrorMessage('Git Sweep Pro: Git is not installed or not available in PATH.');
		} else {
			vscode.window.showErrorMessage(`Git Sweep Pro failed: ${message}`);
		}
	} finally {
		outputChannel.appendLine('--- Git Sweep session ended ---');
	}
}

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

	const runCommand = vscode.commands.registerCommand('git-sweep-pro.run', async () => {
		const action = await vscode.window.showInformationMessage(
			'Git Sweep Pro: Choose execution mode',
			{ modal: true },
			'Delete (safe -d)',
			'Delete (force -D)',
			'Dry Run'
		);

		if (!action) {
			return;
		}

		if (action === 'Dry Run') {
			await runSweep({ dryRun: true, forceDelete: false }, outputChannel);
			return;
		}

		await runSweep(
			{ dryRun: false, forceDelete: action === 'Delete (force -D)' },
			outputChannel
		);
	});

	const dryRunCommand = vscode.commands.registerCommand('git-sweep-pro.dryRun', async () => {
		await runSweep({ dryRun: true, forceDelete: false }, outputChannel);
	});

	context.subscriptions.push(outputChannel, runCommand, dryRunCommand);
}

export function deactivate() {}
