import * as assert from 'assert';
import { parseGoneBranches, resolveSweepModeAction } from '../core/sweep-logic';

suite('Extension Test Suite', () => {
	test('parseGoneBranches returns empty list for empty output', () => {
		assert.deepStrictEqual(parseGoneBranches(''), []);
	});

	test('parseGoneBranches finds branches with gone upstream', () => {
		const output = [
			'  feature/one 1234567 [origin/feature/one: gone] feat one',
			'  feature/two 1234567 [origin/feature/two: ahead 1] feat two',
			'  hotfix/three 1234567 [origin/hotfix/three: gone] fix three',
		].join('\n');

		assert.deepStrictEqual(parseGoneBranches(output), ['feature/one', 'hotfix/three']);
	});

	test('parseGoneBranches supports current branch marker', () => {
		const output = '* my/current 1234567 [origin/my/current: gone] active branch';
		assert.deepStrictEqual(parseGoneBranches(output), ['my/current']);
	});

	test('parseGoneBranches ignores local-only branches without upstream', () => {
		const output = [
			'  local-only abcdef0 local branch with no tracking',
			'  feature/tracked abcdef0 [origin/feature/tracked: ahead 2] tracked branch',
		].join('\n');

		assert.deepStrictEqual(parseGoneBranches(output), []);
	});

	test('parseGoneBranches keeps parsing robust with mixed whitespace', () => {
		const output = [
			'\tfeature/tabbed\t1234567\t[origin/feature/tabbed: gone]\tmsg',
			'   feature/spaces    1234567   [origin/feature/spaces: gone]   msg',
		].join('\n');

		assert.deepStrictEqual(parseGoneBranches(output), ['feature/tabbed', 'feature/spaces']);
	});

	test('parseGoneBranches handles unicode branch names', () => {
		const output = '  feat/éxample 1234567 [origin/feat/éxample: gone] unicode';
		assert.deepStrictEqual(parseGoneBranches(output), ['feat/éxample']);
	});

	test('parseGoneBranches supports branch names containing dots and dashes', () => {
		const output = '  release/2026.02-rc1 123 [origin/release/2026.02-rc1: gone] release';
		assert.deepStrictEqual(parseGoneBranches(output), ['release/2026.02-rc1']);
	});

	test('parseGoneBranches does not falsely match lines without branch names', () => {
		const output = '   [origin/no-branch: gone] malformed';
		assert.deepStrictEqual(parseGoneBranches(output), []);
	});

	test('parseGoneBranches ignores non-gone tracking states', () => {
		const output = [
			'  feature/a 1234567 [origin/feature/a: behind 1] msg',
			'  feature/b 1234567 [origin/feature/b: ahead 3, behind 2] msg',
			'  feature/c 1234567 [origin/feature/c] msg',
		].join('\n');

		assert.deepStrictEqual(parseGoneBranches(output), []);
	});

	test('parseGoneBranches ignores empty lines and malformed entries', () => {
		const output = [
			'',
			'   ',
			'not a branch line',
			'  valid/branch abcdef0 [origin/valid/branch: gone] valid',
		].join('\n');

		assert.deepStrictEqual(parseGoneBranches(output), ['valid/branch']);
	});

	test('resolveSweepModeAction maps Dry Run action', () => {
		assert.deepStrictEqual(resolveSweepModeAction('Dry Run'), {
			dryRun: true,
			forceDelete: false,
		});
	});

	test('resolveSweepModeAction maps safe delete action', () => {
		assert.deepStrictEqual(resolveSweepModeAction('Delete (safe -d)'), {
			dryRun: false,
			forceDelete: false,
		});
	});

	test('resolveSweepModeAction maps force delete action', () => {
		assert.deepStrictEqual(resolveSweepModeAction('Delete (force -D)'), {
			dryRun: false,
			forceDelete: true,
		});
	});

	test('resolveSweepModeAction returns undefined for cancel/unknown values', () => {
		assert.strictEqual(resolveSweepModeAction(undefined), undefined);
		assert.strictEqual(resolveSweepModeAction('Something else'), undefined);
	});

	test('resolveSweepModeAction is strict about exact labels', () => {
		assert.strictEqual(resolveSweepModeAction('dry run'), undefined);
		assert.strictEqual(resolveSweepModeAction(' Delete (safe -d) '), undefined);
	});

});
