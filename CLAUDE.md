# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

Mac 카카오톡 "대화 내보내기" CSV(1:1 대화)를 브라우저에서 읽어 대화 추이를 보여 주는 개인용 정적 페이지.
빌드 단계 없이 `index.html`을 더블클릭(`file://`)해서 연다. 배포하지 않는다.
실제 Mac 내보내기 파일로 형식을 검증하지 못한 상태라서 파서는 열 이름·날짜 표기를 너그럽게 받도록 되어 있다.

## 명령

```bash
npm install          # devDependency(ESLint)만 설치. 런타임 의존성은 없다
npm run check        # lint → build → test 순서로 전부 (커밋 전 훅이 돌리는 것과 같음)
npm run lint         # eslint .
npm run build        # node scripts/build-check.js — index.html 참조 파일 존재·외부 URL 금지·모든 JS에 node --check
npm test             # node test.js — Node assert 기반, 전체가 1초 안에 끝남
```

- `test.js`에는 테스트를 골라 돌리는 필터가 없다. 항상 전체를 돌린다.
- 브라우저 자동화 도구는 `file://`을 열지 못하므로, 화면 확인은 `python3 -m http.server 8765 --bind 127.0.0.1`로 띄워서 한다.

## 구조

데이터 흐름은 `parser.js` → `analyze.js` → `app.js`이고, 각 파일은 `index.html`에서 이 순서로 **classic `<script>`** 로 로드된다(ES module을 쓰면 `file://`에서 막힌다).

- 로직 파일(`parser.js`, `analyze.js`, `sample.js`)은 IIFE 안에서 API를 만들고 끝에서
  `module.exports`가 있으면 Node용으로 내보내고, 없으면 `window.KakaoParser` / `KakaoAnalyze` / `KakaoSample` 전역에 올린다.
  같은 파일을 브라우저와 `test.js`가 함께 쓰기 위한 패턴이다. `eslint.config.mjs`도 이 구분(브라우저 script / Node commonjs)에 맞춰져 있다.
- **parser.js**: CSV 바이트 → `{ ts: Date, user, text }[]`.
  - 헤더 이름으로 날짜·보낸사람·메시지 열을 찾고(`COLUMN_NAMES`), 못 찾으면 1~3열로 가정한다.
  - 입·퇴장 같은 시스템 메시지와 날짜·이름이 없는 행은 `skipped`로 센다(빈 줄은 세지 않음).
  - 인코딩: UTF-8로 깨진 글자(U+FFFD)가 나오면 EUC-KR로도 디코딩해서 깨진 글자가 적은 쪽을 고른다.
- **analyze.js**: 메시지 → 통계 객체. 모든 날짜 계산은 **로컬 시간** 기준이다.
  - 메시지가 많은 두 사람을 `people`로 비교하고, 나머지는 `others`(기타)로 묶는다. 버킷의 `counts`는 `[사람0, 사람1, 기타]` 순서다.
  - 월 버킷은 1일, 주 버킷은 **월요일**에 시작한다. 대화가 없던 기간도 0으로 채운다.
  - 일수 차이(`daysBetween`)는 서머타임 때문에 반올림한다.
- **sample.js**: 시드 고정 RNG로 항상 같은 샘플 CSV를 만든다. 최장 공백기 2026.3.9~3.22를 일부러 넣어 두었고, `test.js`가 이 값을 검사한다. 샘플 생성 로직을 바꾸면 이 테스트가 깨질 수 있다.
- **app.js**: 렌더링 전용. 차트·히트맵은 라이브러리 없이 DOM과 CSS로 그린다.
  - 대화에서 나온 문자열(이름·메시지·파일 첫 줄)은 `h()` 헬퍼의 텍스트 노드로만 넣는다. `innerHTML`은 쓰지 않는다.
  - 축 라벨 간격이 실제 차트 폭에 따라 정해지므로, 결과 영역을 먼저 보이게 한 뒤 그린다. 리사이즈 때는 막대는 그대로 두고 `renderAxis()`가 라벨 글자만 다시 쓴다.
  - 막대 hover·포커스는 `#chart` 하나에 위임된 리스너가 각 막대의 `aria-label`을 읽어 표시한다(막대마다 리스너를 붙이지 않는다).
- **style.css**: 색은 `:root` 토큰으로 정의하고 `prefers-color-scheme: dark`에서 다시 정의한다. 모바일 폭(375px)에서 페이지 전체 가로 스크롤이 생기면 안 된다(차트 영역 내부 스크롤은 허용).

## 지켜야 할 것

- 외부 요청 금지: CDN 스크립트·폰트, `fetch`, 분석 도구 모두 안 된다. "파일이 브라우저 밖으로 나가지 않는다"는 것이 이 앱의 약속이다. `build-check`가 `index.html`의 외부 참조를 막는다.
- 런타임 의존성을 추가하지 않는다.
- `parser.js`·`analyze.js`에 분기나 계산을 추가하면 `test.js`에 케이스를 함께 넣는다.
- **프로젝트 폴더의 `*.csv`는 사용자의 실제 개인 대화다.** 열거나 읽거나 내용을 출력하지 않는다. `.gitignore`의 `*.csv`로 커밋에서 빠져 있다. 파서가 실제 형식과 맞는지 확인해야 하면, 사용자 허락을 받은 뒤 열 이름·인코딩·메시지 수·건너뛴 행 수만 출력한다.

## Claude Code 설정 (`.claude/`)

- **커밋 전 훅** (`settings.json` → `hooks/pre-commit-check.js`): Bash 명령이 `git commit`이면 `npm run lint`, `build`, `test`를 돌린다. 하나라도 실패하면 exit 2로 커밋을 막는다.
  - 감지 정규식은 일부러 넓게 잡았다. 따옴표 뒤의 `git commit`도 잡으므로, 검사가 실패하는 동안에는 `grep "git commit"` 같은 명령도 막힐 수 있다.
  - 검사 대상은 스테이징된 내용이 아니라 작업 트리다.
  - `isGitCommit`은 `test.js`에서 감지 사례 표로 검사한다. 훅 본문(`main`)은 `require.main === module`일 때만 실행되므로 require해도 npm이 돌지 않는다.
- **리뷰**: `code-reviewer` 서브에이전트(읽기 전용, 문제만 보고)가 `code-review-checklist` 스킬의 절차·체크리스트·보고 형식을 따른다. 코드를 고친 뒤 커밋 전에 쓴다.
