// PreToolUse(Bash) 훅: Claude가 git commit을 실행하려 할 때 린트·빌드·테스트를 먼저 돌린다.
// 하나라도 실패하면 exit 2로 커밋을 막는다. 이때 stderr 내용이 Claude에게 전달된다.
// 커밋이 아닌 Bash 명령은 바로 통과시킨다.
const fs = require('fs');
const { spawnSync } = require('child_process');

// "git commit", "git add -A && git commit", "git -C dir commit", "git -c k=v commit" 등. "git commit-tree"는 제외
const GIT_COMMIT_RE = /(?:^|[;&|(\s])git(?:\s+-[Cc]\s+\S+)*\s+commit(?=\s|$)/;
const STEPS = [
  ['린트', ['run', 'lint']],
  ['빌드', ['run', 'build']],
  ['테스트', ['test']],
];
const TAIL_LINES = 40;

let command = '';
try {
  command = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.command || '';
} catch {
  process.exit(0); // 입력을 해석할 수 없으면 막지 않는다
}
if (!GIT_COMMIT_RE.test(command)) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
for (const [label, args] of STEPS) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`
      .trim().split('\n').slice(-TAIL_LINES).join('\n');
    process.stderr.write(
      `커밋 전 검사 실패: ${label} (npm ${args.join(' ')})\n\n${output}\n\n문제를 고친 뒤 다시 커밋하세요.\n`,
    );
    process.exit(2);
  }
}
process.exit(0);
