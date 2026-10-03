// PreToolUse(Bash) 훅: Claude가 git commit을 실행하려 할 때 린트·빌드·테스트를 먼저 돌린다.
// 하나라도 실패하면 exit 2로 커밋을 막는다. 이때 stderr 내용이 Claude에게 전달된다.
// 커밋이 아닌 Bash 명령은 바로 통과시킨다.
const fs = require('fs');
const { spawnSync } = require('child_process');

// 공백·개행·줄 이어쓰기(\ + 개행)
const SP = String.raw`(?:\s|\\\n)+`;
// 값: 일반 글자, \ 이스케이프, 따옴표 덩어리가 이어진 것 (user.name="A B", a\ b). -로 시작하면 옵션이므로 값이 아니다.
// 갈래끼리 겹치지 않게 해서, 옵션이 많은 긴 명령에서도 되짚기가 폭증하지 않는다
const VALUE = String.raw`(?!-)(?:[^\s"'\\]|\\[\s\S]|"[^"]*"|'[^']*')+`;
// git 전역 옵션: -C/-c <값>, --git-dir <값> 같은 띄어 쓰는 값 옵션, --opt=값, --no-pager 같은 플래그
const GLOBAL_OPT = String.raw`(?:-[Cc]${SP}${VALUE}|--(?:git-dir|work-tree|namespace|config-env|attr-source)${SP}${VALUE}|--[\w-]+=${VALUE}|-[\w-]+)`;
// 구분자(; & | 괄호 백틱 공백·개행)·따옴표·경로(/usr/bin/git) 바로 뒤의 git. "git commit-tree", "commit.gpgsign"은 제외.
// bash -c "git commit"을 놓치지 않으려고 따옴표 뒤도 잡으므로 grep "git commit" 같은 명령도 걸린다.
// 검사가 통과하는 동안에는 시간만 조금 더 들고, 검사가 실패 중일 때는 이런 명령도 막힌다
const GIT_COMMIT_RE = new RegExp(String.raw`(?:^|[\s;&|()\`'"/])git(?:${SP}${GLOBAL_OPT})*${SP}commit(?![\w.=-])`);
const STEPS = [
  ['린트', ['run', 'lint']],
  ['빌드', ['run', 'build']],
  ['테스트', ['test']],
];
const TAIL_LINES = 40;

const isGitCommit = (command) => GIT_COMMIT_RE.test(command);

function main() {
  let command = '';
  try {
    command = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.command || '';
  } catch {
    process.exit(0); // 입력을 해석할 수 없으면 막지 않는다
  }
  if (!isGitCommit(command)) process.exit(0);

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
}

// 훅으로 실행될 때만 검사를 돌린다. test.js에서 require하면 감지 함수만 내보낸다
if (require.main === module) main();
else module.exports = { isGitCommit };
