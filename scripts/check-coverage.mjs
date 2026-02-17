import fs from 'node:fs';
import path from 'node:path';

const summaryPath = path.resolve('coverage', 'coverage-summary.json');
const threshold = 85;

if (!fs.existsSync(summaryPath)) {
	console.error(`Coverage summary not found at: ${summaryPath}`);
	console.error('Run `npm run test:coverage` before checking coverage.');
	process.exit(1);
}

const raw = fs.readFileSync(summaryPath, 'utf8');
const summary = JSON.parse(raw);
const total = summary.total;

if (!total?.lines?.pct) {
	console.error('Invalid coverage summary format: missing total.lines.pct');
	process.exit(1);
}

const metrics = {
	lines: total.lines.pct,
	statements: total.statements?.pct ?? 0,
	functions: total.functions?.pct ?? 0,
	branches: total.branches?.pct ?? 0,
};

console.log('Coverage summary:');
console.log(`- Lines: ${metrics.lines}%`);
console.log(`- Statements: ${metrics.statements}%`);
console.log(`- Functions: ${metrics.functions}%`);
console.log(`- Branches: ${metrics.branches}%`);

if (metrics.lines < threshold) {
	console.error(`\nCoverage gate failed: lines ${metrics.lines}% < ${threshold}%`);
	process.exit(1);
}

console.log(`\nCoverage gate passed: lines ${metrics.lines}% >= ${threshold}%`);
