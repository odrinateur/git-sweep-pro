export type SweepMode = {
	readonly dryRun: boolean;
	readonly forceDelete: boolean;
};

export function resolveSweepModeAction(action: string | undefined): SweepMode | undefined {
	if (!action) {
		return undefined;
	}

	if (action === 'Dry Run') {
		return { dryRun: true, forceDelete: false };
	}

	if (action === 'Delete (safe -d)') {
		return { dryRun: false, forceDelete: false };
	}

	if (action === 'Delete (force -D)') {
		return { dryRun: false, forceDelete: true };
	}

	return undefined;
}

export function parseGoneBranches(branchVvOutput: string): string[] {
	return branchVvOutput
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.includes(': gone]'))
		.map((line) => {
			const sanitized = line.replace(/^\*\s+/, '');
			return sanitized.split(/\s+/)[0];
		})
		.filter((name) => !name.startsWith('['))
		.filter((name) => name.length > 0);
}
