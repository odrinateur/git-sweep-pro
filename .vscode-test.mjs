import { defineConfig } from '@vscode/test-cli';
import os from 'node:os';
import path from 'node:path';

const base = path.join(os.tmpdir(), 'gsp-vst');
const userDataDir = path.join(base, 'ud');
const extensionsDir = path.join(base, 'ext');

export default defineConfig({
	files: 'out/test/**/*.test.js',
	launchArgs: [
		`--user-data-dir=${userDataDir}`,
		`--extensions-dir=${extensionsDir}`,
	],
});
