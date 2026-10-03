// Mac 카카오톡 "대화 내보내기" CSV → [{ ts: Date, user, text }]
// 실제 파일로 형식을 확인하지 못했으므로 열 이름과 날짜 표기를 너그럽게 받는다.
(function (global) {
  'use strict';

  const SYSTEM_RE = /님이 들어왔습니다|님이 나갔습니다|님을 초대했습니다|님을 내보냈습니다/;
  const DATE_RE = /^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?\s+(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const COLUMN_NAMES = {
    date: ['date', 'datetime', 'time', '날짜', '일시', '시간'],
    user: ['user', 'name', 'sender', '사용자', '보낸사람', '보낸 사람', '이름', '작성자'],
    text: ['message', 'text', 'content', '메시지', '내용'],
  };

  // 따옴표 안의 콤마·개행과 "" 이스케이프를 처리하는 CSV 파서 (개행은 \n으로 정규화된 상태여야 함)
  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c !== '"') field += c;
        else if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else if (c === '"' && field === '') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // "2024-01-15 14:30:22", "2024.1.15 오후 2:30", "2024/01/15 14:30" 등
  function parseDate(s) {
    const m = DATE_RE.exec(s.trim());
    if (!m) return null;
    let hour = Number(m[5]);
    if (m[4] === '오전' && hour === 12) hour = 0;
    else if (m[4] === '오후' && hour !== 12) hour += 12;
    const d = new Date(+m[1], +m[2] - 1, +m[3], hour, +m[6], +(m[7] || 0));
    return isNaN(d) ? null : d;
  }

  function findColumns(header) {
    const names = header.map((name) => name.trim().toLowerCase());
    const idx = {};
    for (const key of Object.keys(COLUMN_NAMES)) {
      idx[key] = names.findIndex((name) => COLUMN_NAMES[key].includes(name));
    }
    return idx.date >= 0 && idx.user >= 0 && idx.text >= 0 ? idx : null;
  }

  function parse(text) {
    const rows = parseCsvRows(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
    const header = rows.length ? findColumns(rows[0]) : null;
    const cols = header || { date: 0, user: 1, text: 2 }; // 헤더가 없으면 1~3열로 가정
    const messages = [];
    let skipped = 0;

    for (let i = header ? 1 : 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 1 && !row[0].trim()) continue; // 빈 줄
      const ts = parseDate(row[cols.date] || '');
      const user = (row[cols.user] || '').trim();
      const body = row[cols.text] || '';
      if (!ts || !user || SYSTEM_RE.test(body)) {
        skipped++;
        continue;
      }
      messages.push({ ts, user, text: body });
    }

    return {
      messages,
      columns: header ? [cols.date, cols.user, cols.text].map((i) => rows[0][i].trim()) : null,
      skipped,
      firstLine: rows.length ? rows[0].join(',').slice(0, 120) : '',
    };
  }

  // 파일 바이트 → 파싱 결과. UTF-8로 한 건도 못 읽으면 EUC-KR로 한 번 더 시도
  function decodeAndParse(buffer) {
    let result = { ...parse(new TextDecoder('utf-8').decode(buffer)), encoding: 'UTF-8' };
    if (!result.messages.length) {
      try {
        const alt = parse(new TextDecoder('euc-kr').decode(buffer));
        if (alt.messages.length) result = { ...alt, encoding: 'EUC-KR' };
      } catch {
        // 이 환경이 EUC-KR 디코딩을 지원하지 않으면 UTF-8 결과를 그대로 쓴다
      }
    }
    return result;
  }

  const api = { parse, parseDate, parseCsvRows, decodeAndParse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.KakaoParser = api;
})(this);
