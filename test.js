// 실행: node test.js
const assert = require('assert');
const { parse, parseDate, decodeAndParse } = require('./parser.js');
const { analyze } = require('./analyze.js');
const { buildSampleCsv, SAMPLE_GAP } = require('./sample.js');
const { isGitCommit } = require('./.claude/hooks/pre-commit-check.js');
const { blockReason } = require('./.claude/hooks/reviewer-guard.js');

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const msg = (ts, user) => ({ ts, user, text: '안녕' });
const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const BASIC = [
  'Date,User,Message',
  '2024-01-15 00:05:00,"민지","자정 메시지"',
  '2024-01-15 12:30:00,"준호","쉼표, 포함"',
  '2024-01-15 14:30:00,"민지","첫 줄\n둘째 줄"',
  '2024-01-15 23:59:59,"준호","따옴표 ""인용"" 포함"',
].join('\n');

// ---- 파서 ----

test('Mac CSV 기본 형식', () => {
  const r = parse(BASIC);
  assert.deepStrictEqual(r.columns, ['Date', 'User', 'Message']);
  assert.deepStrictEqual(r.messages.map((m) => m.user), ['민지', '준호', '민지', '준호']);
  assert.deepStrictEqual(r.messages.map((m) => m.ts.getHours()), [0, 12, 14, 23]);
  assert.deepStrictEqual(r.messages.map((m) => m.text), ['자정 메시지', '쉼표, 포함', '첫 줄\n둘째 줄', '따옴표 "인용" 포함']);
  assert.strictEqual(r.skipped, 0);
});

test('BOM과 CRLF', () => {
  const r = parse('\uFEFF' + BASIC.replace(/\n/g, '\r\n'));
  assert.strictEqual(r.messages.length, 4);
  assert.strictEqual(r.messages[2].text, '첫 줄\n둘째 줄');
});

test('시스템 메시지와 빈 사용자 행 제외', () => {
  const r = parse([
    'Date,User,Message',
    '2024-01-15 10:00:00,"","준호님이 들어왔습니다."',
    '2024-01-15 10:01:00,"민지","민지님이 나갔습니다."',
    '2024-01-15 10:02:00,"민지","안녕"',
  ].join('\n'));
  assert.strictEqual(r.messages.length, 1);
  assert.strictEqual(r.skipped, 2);
});

test('헤더 없는 CSV는 1~3열 사용', () => {
  const r = parse('2024-01-15 10:00:00,민지,안녕\n2024-01-15 10:01:00,준호,반가워');
  assert.strictEqual(r.columns, null);
  assert.deepStrictEqual(r.messages.map((m) => m.user), ['민지', '준호']);
});

test('한글 헤더와 다른 열 순서', () => {
  const r = parse('메시지,보낸사람,날짜\n안녕,민지,2024-01-15 10:00:00');
  assert.deepStrictEqual(r.columns, ['날짜', '보낸사람', '메시지']);
  assert.strictEqual(r.messages[0].user, '민지');
  assert.strictEqual(r.messages[0].text, '안녕');
});

test('빈 줄은 건너뛰고 읽지 못한 행만 센다', () => {
  const r = parse([
    'Date,User,Message',
    '2024-01-15 10:00:00,"민지","안녕"',
    '',
    '날짜 아님,"준호","반가워"',
    '',
    '2024-01-15 10:02:00,"준호","응"',
    '',
  ].join('\n'));
  assert.deepStrictEqual(r.messages.map((m) => m.text), ['안녕', '응']);
  assert.strictEqual(r.skipped, 1);
});

test('날짜 표기 변형과 오전/오후 12시 경계', () => {
  assert.strictEqual(parseDate('2024.01.15 오후 12:30').getHours(), 12);
  assert.strictEqual(parseDate('2024/1/5 오전 12:10').getHours(), 0);
  assert.strictEqual(parseDate('2024-01-15 오후 3:05').getHours(), 15);
  assert.strictEqual(ymd(parseDate('2024. 1. 5. 9:05')), '2024-1-5');
  assert.strictEqual(parseDate('날짜 아님'), null);
});

test('UTF-8 바이트 디코딩', () => {
  const r = decodeAndParse(Buffer.from('\uFEFF' + BASIC, 'utf8'));
  assert.strictEqual(r.encoding, 'UTF-8');
  assert.strictEqual(r.messages.length, 4);
});

test('이름·메시지만 EUC-KR이어도 EUC-KR로 읽음', () => {
  // 날짜와 헤더는 ASCII라 관대한 UTF-8 디코딩으로도 메시지가 잡히는 경우
  const bytes = Buffer.concat([
    Buffer.from('Date,User,Message\n2024-01-15 10:00:00,', 'ascii'),
    Buffer.from([0xb9, 0xce, 0xc1, 0xf6]), // 민지
    Buffer.from(',', 'ascii'),
    Buffer.from([0xbe, 0xc8, 0xb3, 0xe7]), // 안녕
  ]);
  const r = decodeAndParse(bytes);
  assert.strictEqual(r.encoding, 'EUC-KR');
  assert.strictEqual(r.messages[0].user, '민지');
  assert.strictEqual(r.messages[0].text, '안녕');
});

test('UTF-8에 잘못된 바이트가 하나 섞여도 UTF-8로 읽음', () => {
  const bytes = Buffer.concat([Buffer.from(BASIC + '\n2024-01-16 09:00:00,"민지","', 'utf8'), Buffer.from([0xff]), Buffer.from('"', 'utf8')]);
  const r = decodeAndParse(bytes);
  assert.strictEqual(r.encoding, 'UTF-8');
  assert.deepStrictEqual(r.messages.map((m) => m.user), ['민지', '준호', '민지', '준호', '민지']);
});

// ---- 분석 ----

test('빈 입력이면 null', () => {
  assert.strictEqual(analyze([]), null);
});

test('메시지 1건·참여자 1명', () => {
  const s = analyze([msg(D(2024, 1, 15, 10), 'A')]);
  assert.deepStrictEqual(s.people, [{ name: 'A', count: 1 }]);
  assert.strictEqual(s.others, null);
  assert.strictEqual(s.spanDays, 1);
  assert.strictEqual(s.longestStreak.days, 1);
  assert.strictEqual(s.longestGap, null);
  assert.strictEqual(s.months.length, 1);
  assert.strictEqual(s.weeks.length, 1);
});

test('월/주 버킷과 빈 기간 0 채우기', () => {
  const s = analyze([msg(D(2024, 1, 30), 'A'), msg(D(2024, 1, 31), 'B'), msg(D(2024, 3, 2), 'A')]);
  assert.deepStrictEqual(s.months.map((b) => b.total), [2, 0, 1]);
  assert.deepStrictEqual(s.months[0].counts, [1, 1, 0]);
  assert.deepStrictEqual(s.weeks.map((b) => b.total), [2, 0, 0, 0, 1]);
  assert.strictEqual(ymd(s.weeks[0].start), '2024-1-29'); // 월요일 시작
  assert.deepStrictEqual(s.people, [{ name: 'A', count: 2 }, { name: 'B', count: 1 }]);
  assert.strictEqual(s.others, null); // 2명이면 기타 없음
  assert.strictEqual(s.spanDays, 33);
  assert.strictEqual(s.activeDays, 3);
});

test('최장 연속 대화와 최장 공백기', () => {
  const dates = [D(2024, 1, 1, 9), D(2024, 1, 2, 23), D(2024, 1, 3, 8), D(2024, 1, 10, 12), D(2024, 1, 11, 1)];
  const s = analyze(dates.map((d, i) => msg(d, i % 2 ? 'B' : 'A')));
  assert.strictEqual(s.longestStreak.days, 3);
  assert.strictEqual(ymd(s.longestStreak.from), '2024-1-1');
  assert.strictEqual(ymd(s.longestStreak.to), '2024-1-3');
  assert.strictEqual(s.longestGap.days, 6);
  assert.strictEqual(ymd(s.longestGap.from), '2024-1-4');
  assert.strictEqual(ymd(s.longestGap.to), '2024-1-9');
  assert.strictEqual(ymd(s.bestMonth.start), '2024-1-1');
});

test('매일 대화했으면 공백기 없음', () => {
  const s = analyze([msg(D(2024, 1, 1), 'A'), msg(D(2024, 1, 2), 'B')]);
  assert.strictEqual(s.longestGap, null);
  assert.strictEqual(s.longestStreak.days, 2);
});

test('요일×시간 히트맵', () => {
  // 2024-01-15는 월요일, 2024-01-21은 일요일
  const s = analyze([msg(D(2024, 1, 15, 23, 10), 'A'), msg(D(2024, 1, 15, 23, 40), 'B'), msg(D(2024, 1, 21, 9), 'A')]);
  assert.strictEqual(s.heat[0][23], 2);
  assert.strictEqual(s.heat[6][9], 1);
  assert.deepStrictEqual([s.peak.weekday, s.peak.hour, s.heatMax], [0, 23, 2]);
});

test('3명 이상이면 상위 2명 외는 기타', () => {
  const t = D(2024, 1, 1);
  const s = analyze(['A', 'A', 'A', 'B', 'B', 'C'].map((u) => msg(t, u)));
  assert.deepStrictEqual(s.people.map((p) => p.name), ['A', 'B']);
  assert.deepStrictEqual(s.others, { people: 1, count: 1 });
  assert.deepStrictEqual(s.months[0].counts, [3, 2, 1]);
});

// ---- 샘플 ----

test('샘플 데이터가 파서를 통과하고 설계한 공백기가 잡힘', () => {
  const csv = buildSampleCsv();
  assert.strictEqual(csv, buildSampleCsv(), '시드 고정이라 매번 같아야 함');
  const r = parse(csv);
  assert.strictEqual(r.skipped, 0);
  assert.ok(r.messages.length > 3000 && r.messages.length < 5000, `메시지 ${r.messages.length}건`);
  const s = analyze(r.messages);
  assert.deepStrictEqual(s.people.map((p) => p.name).sort(), ['민지', '준호']);
  assert.strictEqual(s.months.length, 14);
  assert.strictEqual(ymd(s.longestGap.from), ymd(SAMPLE_GAP.from));
  assert.strictEqual(ymd(s.longestGap.to), ymd(SAMPLE_GAP.to));
});

// ---- 커밋 훅 ----

test('커밋 훅이 git commit 명령을 알아봄', () => {
  const commits = [
    'git commit',
    'git commit -m x',
    'git add -A && git commit -m "x"',
    'git commit;git push',
    'git commit&&git push',
    '(git commit -m x)',
    '$(git commit)',
    'git add .\ngit commit -m x',
    'bash -c "git commit -m x"',
    '/usr/bin/git commit',
    'git --no-pager commit -m x',
    'git -p commit --amend',
    'git --git-dir=.git --work-tree=. commit',
    'git --git-dir .git commit',
    'git -c user.name=x commit',
    'git -C /tmp/a -c "user.name=A B" commit -m x',
    'git -C "/a b" commit',
    'git -C a\\ b commit',
    'git -c user.name="A B" commit -m x',
    "git -c user.name='A B' commit",
    'git commit>/dev/null',
    'git commit<<EOF',
    'git \\\ncommit -m x',
    '`git commit`',
  ];
  const others = [
    'ls',
    'npm test',
    'git status',
    'git log --oneline -n 5',
    'git log --grep commit',
    'git commit-tree abc',
    'gitk commit',
    'legit commit',
    'git config commit.gpgsign false',
    'git -c commit.gpgsign=false log',
  ];
  assert.deepStrictEqual(commits.filter((c) => !isGitCommit(c)), [], '놓친 커밋 명령');
  assert.deepStrictEqual(others.filter((c) => isGitCommit(c)), [], '커밋으로 잘못 본 명령');
});

test('커밋 훅 감지는 옵션이 많은 긴 명령에서도 빠름', () => {
  // 모든 Bash 호출마다 도는 검사라 정규식 되짚기가 옵션 수에 따라 늘어나면 안 된다
  const start = Date.now();
  for (const opt of ['-c "k=v" ', '-c ', '-c a ', '--x="a b" ']) isGitCommit(`git ${opt.repeat(60)}log`);
  assert.ok(Date.now() - start < 200, `${Date.now() - start}ms`);
});

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
