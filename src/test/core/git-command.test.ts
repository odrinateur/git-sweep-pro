import * as assert from 'assert';
import { runGitCommand, type ExecFn } from '../../core/git-command';

suite('git-command', () => {
	test('logs command and stdout/stderr on success', async () => {
		const lines: string[] = [];
		const execFn: ExecFn = async () => ({
			stdout: 'hello\n',
			stderr: 'warn\n',
		});

		const result = await runGitCommand('git status', '/repo', { appendLine: (line) => lines.push(line) }, execFn);

		assert.deepStrictEqual(result, { stdout: 'hello\n', stderr: 'warn\n' });
		assert.deepStrictEqual(lines, ['$ git status', 'hello', '[stderr] warn']);
	});

	test('does not log empty stdout/stderr content', async () => {
		const lines: string[] = [];
		const execFn: ExecFn = async () => ({ stdout: '   ', stderr: '' });

		await runGitCommand('git rev-parse --show-toplevel', '/repo', { appendLine: (line) => lines.push(line) }, execFn);

		assert.deepStrictEqual(lines, ['$ git rev-parse --show-toplevel']);
	});

	test('logs error details and rethrows on command failure', async () => {
		const lines: string[] = [];
		const thrown = Object.assign(new Error('boom'), {
			stdout: 'partial out\n',
			stderr: 'fatal: something bad\n',
		});
		const execFn: ExecFn = async () => {
			throw thrown;
		};

		await assert.rejects(
			() => runGitCommand('git fetch -p', '/repo', { appendLine: (line) => lines.push(line) }, execFn),
			(error: unknown) => {
				assert.strictEqual(error, thrown);
				return true;
			}
		);

		assert.deepStrictEqual(lines, [
			'$ git fetch -p',
			'partial out',
			'[stderr] fatal: something bad',
			'[error] boom',
		]);
	});

	test('handles thrown non-standard error objects gracefully', async () => {
		const lines: string[] = [];
		const execFn: ExecFn = async () => {
			throw Object.assign(new Error('object-error'), {
				stdout: 'x\n',
				stderr: 'y\n',
			});
		};

		await assert.rejects(
			() => runGitCommand('git branch -vv', '/repo', { appendLine: (line) => lines.push(line) }, execFn),
			/error/
		);

		assert.deepStrictEqual(lines, ['$ git branch -vv', 'x', '[stderr] y', '[error] object-error']);
	});
});
