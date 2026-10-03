// code-reviewer 서브에이전트 전용 PreToolUse 훅 (agents/code-reviewer.md의 hooks에서 실행).
// 프로젝트 폴더의 *.csv는 사용자의 실제 개인 대화라서, 리뷰어가 실수로라도 그 내용을 읽지 못하게 막는다.
// 막을 때는 exit 2로 끝나고 stderr 내용이 서브에이전트에게 전달된다. 실수를 막는 장치이지 샌드박스는 아니다.
const fs = require('fs');
const path = require('path');

// 확장자 .csv (경로·글롭·명령 어디에 있든). parseCsvRows 같은 이름은 걸리지 않는다
const CSV_EXT_RE = /\.csv\b/i;
// *.{js,csv} 같은 중괄호 글롭 안의 csv
const CSV_BRACE_RE = /\{[^}]*\bcsv\b[^}]*\}/i;
// 카카오톡 내보내기 파일 이름. 프로젝트 폴더 이름(kakaotalk_chat_trend)과 구분하려고 대소문자를 구분한다
const EXPORT_NAME_RE = /KakaoTalk_Chat_/;
// --include 없는 재귀 grep(-r, -rn, -R, --recursive)은 .gitignore와 상관없이 CSV까지 훑는다
const RECURSIVE_GREP_RE = /(?:^|[\s;&|(`])grep\b(?=[^;&|]*\s(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b)(?![^;&|]*--include)/;
// 확장자로 끝나는 글롭 (*.js, **/*.{js,css})
const GLOB_EXT_RE = /\.[\w{},]+$/;

const CSV_MSG = '프로젝트의 *.csv는 사용자의 실제 개인 대화라서 열거나 검색할 수 없습니다. 실제 형식 확인이 필요하면 보고서의 "확인 필요"에 적으세요.';
const GREP_DIR_MSG = 'Grep으로 폴더를 훑을 때는 glob(예: "*.{js,mjs,css,html,json,md}")이나 type(예: "js")으로 소스 파일만 대상으로 하세요. *.csv(개인 대화)가 검색되지 않게 하려는 것입니다.';
const RECURSIVE_GREP_MSG = '재귀 grep은 *.csv(개인 대화)까지 훑습니다. Grep 도구에 glob이나 type을 지정해서 쓰세요.';

const mentionsCsv = (s) => typeof s === 'string' && (CSV_EXT_RE.test(s) || CSV_BRACE_RE.test(s) || EXPORT_NAME_RE.test(s));

// 막을 이유를 돌려주고, 통과면 null
function blockReason(toolName, input = {}) {
  switch (toolName) {
    case 'Read':
      return mentionsCsv(input.file_path) ? CSV_MSG : null;
    case 'Glob':
      return [input.pattern, input.path].some(mentionsCsv) ? CSV_MSG : null;
    case 'Grep': {
      if ([input.glob, input.path].some(mentionsCsv) || /^csv$/i.test(input.type || '')) return CSV_MSG;
      // Grep 도구가 .gitignore를 따르는지는 보장되지 않으므로, 폴더(확장자 없는 경로)를 훑을 때는 범위를 요구한다
      const isDir = !path.extname(input.path || '.');
      const scoped = Boolean(input.type) || GLOB_EXT_RE.test(input.glob || '');
      return isDir && !scoped ? GREP_DIR_MSG : null;
    }
    case 'Bash': {
      const command = input.command || '';
      if (mentionsCsv(command)) return CSV_MSG;
      return RECURSIVE_GREP_RE.test(command) ? RECURSIVE_GREP_MSG : null;
    }
    default:
      return null;
  }
}

function main() {
  let event;
  try {
    event = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    // 커밋 훅과 달리 개인정보 보호용이라, 입력을 해석할 수 없으면 막는 쪽을 택한다
    process.stderr.write('리뷰어 가드 훅이 입력을 해석하지 못해 호출을 막았습니다.\n');
    process.exit(2);
  }
  const reason = blockReason(event.tool_name, event.tool_input || {});
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

// 훅으로 실행될 때만 검사한다. test.js에서 require하면 판정 함수만 내보낸다
if (require.main === module) main();
else module.exports = { blockReason };
