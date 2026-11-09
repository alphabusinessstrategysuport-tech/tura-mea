// Publishes the app on GitHub Pages without GitHub Actions.
// Run: npm run deploy
// Steps: tests → build with the right base path (/<repo-name>/) → push dist/ to the gh-pages branch.
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const read = (cmd) => execSync(cmd).toString().trim();

const remote = read('git config --get remote.origin.url');
const repoName = remote.split('/').pop().replace(/\.git$/, '');
const name = read('git config user.name');
const email = read('git config user.email');
const sha = read('git rev-parse --short HEAD');

console.log(`\n▶ Teste…`);
run('npm test');

console.log(`\n▶ Build pentru /${repoName}/ …`);
run('npm run build', { env: { ...process.env, BASE_PATH: `/${repoName}/` } });
writeFileSync('dist/.nojekyll', '');

console.log(`\n▶ Public pe ramura gh-pages…`);
rmSync('dist/.git', { recursive: true, force: true });
const git = (args) => run(`git -c core.autocrlf=false -c user.name="${name}" -c user.email="${email}" ${args}`, { cwd: 'dist' });
git('init -q');
git('checkout -q -b gh-pages');
git('add -A');
git(`commit -q -m "Publicare din ${sha}"`);
git(`push -f -q ${remote} gh-pages`);
rmSync('dist/.git', { recursive: true, force: true });

console.log(`\n✅ Publicat. În 1–2 minute: https://${remote.split('/')[3]}.github.io/${repoName}/\n`);
