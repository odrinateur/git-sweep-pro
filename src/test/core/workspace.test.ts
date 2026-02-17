import * as assert from 'assert';
import { resolveWorkspaceRoot, type WorkspaceFolderLike } from '../../core/workspace';

suite('workspace resolver', () => {
	test('returns active editor workspace when available', () => {
		const editorUri = { scheme: 'file', path: '/repo/a.ts' };
		const expected = '/repo';
		const result = resolveWorkspaceRoot({
			activeEditor: { document: { uri: editorUri } },
			getWorkspaceFolder: (uri) => {
				assert.strictEqual(uri, editorUri);
				return { uri: { fsPath: expected } };
			},
			workspaceFolders: [{ uri: { fsPath: '/fallback' } }],
		});

		assert.strictEqual(result, expected);
	});

	test('falls back to first workspace folder when active editor has no folder', () => {
		const workspaceFolders: WorkspaceFolderLike[] = [
			{ uri: { fsPath: '/first' } },
			{ uri: { fsPath: '/second' } },
		];
		const result = resolveWorkspaceRoot({
			activeEditor: { document: { uri: { scheme: 'untitled' } } },
			getWorkspaceFolder: () => undefined,
			workspaceFolders,
		});

		assert.strictEqual(result, '/first');
	});

	test('returns first workspace folder when no active editor', () => {
		const result = resolveWorkspaceRoot({
			activeEditor: undefined,
			getWorkspaceFolder: () => undefined,
			workspaceFolders: [{ uri: { fsPath: '/repo' } }],
		});

		assert.strictEqual(result, '/repo');
	});

	test('returns undefined when no active editor and no workspace folders', () => {
		const result = resolveWorkspaceRoot({
			activeEditor: undefined,
			getWorkspaceFolder: () => undefined,
			workspaceFolders: undefined,
		});

		assert.strictEqual(result, undefined);
	});
});
