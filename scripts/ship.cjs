/**
 * One command to commit everything and update every branch that deploys.
 *
 *   npm run ship -- "what changed"     commit all changes, then promote
 *   npm run ship                       promote existing commits, no new commit
 *
 * The problem this exists for: `frontend` and `backend` are deploy branches, and keeping them
 * current means three pushes. Forget one and that side silently keeps serving the previous
 * commit — the failure is invisible, because nothing errors, the deploy just never happens.
 *
 * `git add -A` (not `git add .`) so deletions and files outside the current directory are staged
 * too — a half-staged commit is the other way files go missing.
 *
 * ponytail: branch names are constants below. Move them to a config file only if this repo ever
 * grows a third deploy target.
 */
const { execFileSync } = require('node:child_process');

const SOURCE_BRANCH = 'sujith-v1.0';
const DEPLOY_BRANCHES = ['frontend', 'backend'];
const REMOTE = 'origin';

/** Captured, not inherited: the output is parsed. Throws with git's own stderr on failure. */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** Inherited stdio so pushes stream progress and errors surface verbatim rather than swallowed. */
function gitLive(...args) {
  execFileSync('git', args, { stdio: 'inherit' });
}

function main() {
  const message = process.argv.slice(2).join(' ').trim();

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== SOURCE_BRANCH) {
    // Promoting from the wrong branch would push someone else's work to production.
    console.error(
      `On '${branch}', but ship promotes from '${SOURCE_BRANCH}'.\n` +
        `Run: git checkout ${SOURCE_BRANCH}`,
    );
    process.exit(1);
  }

  const dirty = git('status', '--porcelain');
  if (dirty) {
    if (!message) {
      console.error(
        'Uncommitted changes, but no commit message given.\n' +
          '  npm run ship -- "what changed"\n\n' +
          dirty,
      );
      process.exit(1);
    }
    git('add', '-A');
    // --cached: compare the index, which is what is about to be committed.
    const staged = git('diff', '--cached', '--stat').split('\n').filter(Boolean);
    console.log(`\nCommitting ${staged.length - 1} file(s):`);
    console.log(staged.slice(-1)[0]);
    gitLive('commit', '-m', message);
  } else if (message) {
    console.log('Nothing to commit — promoting existing commits.');
  }

  const head = git('rev-parse', '--short', 'HEAD');
  console.log(`\nPromoting ${head} to ${[SOURCE_BRANCH, ...DEPLOY_BRANCHES].join(', ')}\n`);

  gitLive('push', REMOTE, SOURCE_BRANCH);
  for (const target of DEPLOY_BRANCHES) {
    // Explicit src:dst so the deploy branch fast-forwards to exactly this commit. No local
    // checkout of that branch is needed, so it cannot drift from what was just tested.
    gitLive('push', REMOTE, `${SOURCE_BRANCH}:${target}`);
    // Keep any local copy of the branch pointing where the remote now does, so `git branch -vv`
    // does not report it as behind straight after a successful ship.
    try {
      git('branch', '-f', target, SOURCE_BRANCH);
    } catch {
      // The branch may not exist locally, which is fine — the remote is the thing that matters.
    }
  }

  console.log('\nAll branches now at', head);
  console.log('Frontend deploy: https://github.com/clickcraft45-dev/Nation-Wide/actions');
}

main();
