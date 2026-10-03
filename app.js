// 대시보드: 파일 읽기 → 파싱 → 분석 → 렌더링
(function () {
  'use strict';

  const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const state = { stats: null, unit: 'month', trend: null };

  const $ = (id) => document.getElementById(id);
  const num = (n) => n.toLocaleString('ko-KR');
  const pct = (r) => `${Math.round(r * 100)}%`;

  // 문자열 자식은 텍스트 노드로 들어가므로 대화 속 이름이 HTML로 해석되지 않는다
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style') for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
      else el.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child != null && child !== false) el.append(child);
    return el;
  }

  const fmtDate = (d) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  const monthName = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  function fmtRange(a, b) {
    if (+a === +b) return fmtDate(a);
    const tail = a.getFullYear() === b.getFullYear() ? `${b.getMonth() + 1}.${b.getDate()}` : fmtDate(b);
    return `${fmtDate(a)} ~ ${tail}`;
  }
  function hourName(hour) {
    if (hour === 0) return '자정';
    if (hour < 6) return `새벽 ${hour}시`;
    if (hour < 12) return `오전 ${hour}시`;
    if (hour === 12) return '낮 12시';
    if (hour < 18) return `오후 ${hour - 12}시`;
    return `밤 ${hour - 12}시`;
  }

  // ---- 업로드 ----

  function showError(text) {
    $('error').textContent = text;
    $('error').hidden = !text;
  }

  async function loadFile(file) {
    showError('');
    try {
      show(KakaoParser.decodeAndParse(await file.arrayBuffer()), file.name);
    } catch (err) {
      showError(`파일을 읽지 못했어요: ${err.message}`);
    }
  }

  function show(result, sourceName) {
    if (!result.messages.length) {
      $('result').hidden = true;
      $('upload').hidden = false;
      showError('대화를 찾지 못했어요. Mac 카카오톡의 "대화 내보내기"로 만든 .csv 파일인지 확인해 주세요.' +
        (result.firstLine ? `\n파일 첫 줄: ${result.firstLine}` : ''));
      return;
    }
    state.stats = KakaoAnalyze.analyze(result.messages);
    state.unit = 'month';
    // 차트 라벨 간격이 화면 폭에 따라 정해지므로 결과 영역을 먼저 보이게 한 뒤 그린다
    $('upload').hidden = true;
    $('result').hidden = false;
    render(result, sourceName);
    window.scrollTo(0, 0);
  }

  function reset() {
    state.stats = null;
    state.trend = null;
    $('file').value = '';
    showError('');
    $('result').hidden = true;
    $('upload').hidden = false;
  }

  // ---- 렌더링 ----

  // 비교 대상(A, B)과 '기타'를 색 클래스와 함께 나열
  function parts() {
    const s = state.stats;
    const list = s.people.map((p, i) => ({ name: p.name, count: p.count, cls: i ? 'b' : 'a' }));
    if (s.others) list.push({ name: `기타 ${s.others.people}명`, count: s.others.count, cls: 'o' });
    return list;
  }

  function render(result, sourceName) {
    const s = state.stats;
    $('names').textContent = s.people.map((p) => p.name).join(' · ');
    $('period').textContent = `${fmtDate(s.first)} ~ ${fmtDate(s.last)} · ${num(s.spanDays)}일`;
    renderSummary();
    renderTrend();
    renderHighlights();
    renderHeatmap();
    const cols = result.columns ? result.columns.join(' / ') : '헤더 없음 (1·2·3열 사용)';
    $('meta').textContent = `${sourceName} · ${result.encoding} · 감지된 열: ${cols} · ` +
      `메시지 ${num(result.messages.length)}건 · 건너뛴 행 ${num(result.skipped)}개`;
  }

  function renderSummary() {
    const s = state.stats;
    const card = (label, value, note) =>
      h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('strong', {}, value), note && h('span', { class: 'note' }, note));

    $('summary').replaceChildren(
      card('총 메시지', `${num(s.total)}개`),
      card('대화한 날', `${num(s.activeDays)}일`, `전체 ${num(s.spanDays)}일 중 ${pct(s.activeDays / s.spanDays)}`),
      card('대화한 날 평균', `${(s.total / s.activeDays).toFixed(1)}개`),
    );

    const list = parts();
    $('ratio').replaceChildren(
      h('div', { class: 'ratio-bar' }, list.map((p) => h('span', { class: `seg ${p.cls}`, style: { 'flex-grow': p.count } }))),
      h('div', { class: 'ratio-legend' }, list.map((p) =>
        h('span', {}, h('i', { class: `dot ${p.cls}` }), `${p.name} ${pct(p.count / s.total)} `, h('small', {}, `${num(p.count)}개`)))),
    );
    $('legend').replaceChildren(...list.map((p) => h('span', {}, h('i', { class: `dot ${p.cls}` }), p.name)));

    $('others-note').hidden = !s.others;
    if (s.others) {
      $('others-note').textContent =
        `참여자가 ${s.others.people + 2}명인 대화예요. 메시지가 많은 두 사람을 비교하고 나머지는 '기타'로 묶었어요.`;
    }
  }

  function bucketName(bucket, unit) {
    if (unit === 'month') return monthName(bucket.start);
    const end = new Date(bucket.start.getFullYear(), bucket.start.getMonth(), bucket.start.getDate() + 6);
    return `${fmtRange(bucket.start, end)} 주`;
  }

  // 월별은 every개월마다, 주별은 달이 바뀌는 첫 주에만 라벨을 단다.
  // 주는 목요일이 속한 달로 본다 (6/30~7/6 주는 7월)
  function axisLabel(list, i, unit, every) {
    const monthOf = (b) => (unit === 'month' ? b.start : new Date(b.start.getFullYear(), b.start.getMonth(), b.start.getDate() + 3));
    const d = monthOf(list[i]);
    const text = i === 0 || d.getMonth() === 0
      ? `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}`
      : `${d.getMonth() + 1}월`;
    if (unit === 'month') return i % every ? '' : text;
    // 마지막 두 칸은 라벨이 오른쪽 끝에서 잘리고 불필요한 가로 스크롤을 만들어서 생략
    if (i > list.length - 3) return '';
    if (i > 0 && monthOf(list[i - 1]).getMonth() === d.getMonth()) return '';
    if (i === 0) {
      // 바로 뒤에 달이 바뀌면 라벨이 겹치므로 첫 라벨은 생략
      const nextChange = list.findIndex((b, j) => j > 0 && monthOf(b).getMonth() !== d.getMonth());
      if (nextChange !== -1 && nextChange < 3) return '';
    }
    return (d.getFullYear() * 12 + d.getMonth()) % every ? '' : text;
  }

  function renderTrend() {
    const s = state.stats;
    const unit = state.unit;
    const list = unit === 'month' ? s.months : s.weeks;
    for (const btn of document.querySelectorAll('[data-unit]')) btn.setAttribute('aria-pressed', String(btn.dataset.unit === unit));

    const max = Math.max(1, ...list.map((b) => b.total));
    const best = list.reduce((top, b) => (b.total > top.total ? b : top));
    const describe = (b) => {
      const counts = s.people.map((p, i) => `${p.name} ${num(b.counts[i])}`);
      if (s.others) counts.push(`기타 ${num(b.counts[2])}`);
      return `${bucketName(b, unit)} · 총 ${num(b.total)}개 (${counts.join(', ')})`;
    };
    const defaultText = `${unit === 'month' ? '가장 대화가 많았던 달' : '가장 대화가 많았던 주'} — ${describe(best)}`;
    const slots = [...s.people.keys(), ...(s.others ? [2] : [])]; // 실제 있는 사람과 '기타' 조각만 만든다

    // 막대 hover·포커스 시 readout은 이벤트 섹션의 차트 리스너가 aria-label을 읽어 채운다
    const cols = list.map((b) =>
      h('div', { class: b === best ? 'col best' : 'col', tabindex: 0, 'aria-label': describe(b) },
        h('div', { class: 'bar-area' },
          h('div', { class: 'stack', style: { height: `${(b.total / max) * 100}%` } },
            slots.map((slot) => h('i', { class: `seg ${'abo'[slot]}`, style: { 'flex-grow': b.counts[slot] } })))),
        h('span', { class: 'xl' })));

    const chart = $('chart');
    chart.dataset.unit = unit;
    chart.style.setProperty('--n', list.length);
    chart.replaceChildren(...cols);
    state.trend = { list, unit, every: 0, defaultText };
    renderAxis();
    $('readout').textContent = defaultText;
    $('chart-max').textContent = `최대 ${num(max)}개`;
  }

  // 라벨 하나에 약 34px가 필요하므로, 실제 차트 폭에서 한 달이 차지하는 폭을 보고 라벨 간격을 정한다.
  // 화면 폭이 바뀌면 막대는 그대로 두고 라벨 글자만 다시 쓴다
  function renderAxis() {
    const { list, unit } = state.trend;
    const minCol = unit === 'month' ? 21 : 8; // style.css의 .chart --col + --gap
    const chartWidth = Math.max($('chart').parentElement.clientWidth, list.length * minCol);
    const every = Math.max(1, Math.ceil((34 * state.stats.months.length) / chartWidth));
    if (every === state.trend.every) return;
    state.trend.every = every;
    $('chart').querySelectorAll('.xl').forEach((el, i) => { el.textContent = axisLabel(list, i, unit, every); });
  }

  function renderHighlights() {
    const s = state.stats;
    const card = (label, value, note) =>
      h('div', { class: 'highlight' }, h('span', { class: 'label' }, label), h('strong', {}, value), h('span', { class: 'note' }, note));
    const best = s.bestMonth;
    const monthlyAvg = s.total / s.months.length;
    const streak = s.longestStreak;
    const gap = s.longestGap;

    $('highlights').replaceChildren(
      card('최고의 달', monthName(best.start), `메시지 ${num(best.total)}개 · 월평균의 ${(best.total / monthlyAvg).toFixed(1)}배`),
      card('최장 연속 대화', `${num(streak.days)}일`,
        streak.days > 1 ? `${fmtRange(streak.from, streak.to)} 매일 대화` : '이틀 연속 대화한 적은 없어요'),
      gap
        ? card('최장 공백기', `${num(gap.days)}일`, `${fmtRange(gap.from, gap.to)} 대화 없음`)
        : card('최장 공백기', '0일', '대화가 끊긴 날이 하루도 없어요'),
    );
  }

  function renderHeatmap() {
    const { heat, heatMax, peak } = state.stats;
    const cells = [h('span')];
    for (let hour = 0; hour < 24; hour++) cells.push(h('span', { class: 'hl' }, hour % 6 === 0 ? `${hour}시` : ''));
    heat.forEach((row, weekday) => {
      cells.push(h('span', { class: 'wl' }, WEEKDAYS[weekday]));
      row.forEach((count, hour) => cells.push(h('span', {
        class: 'cell',
        title: `${WEEKDAYS[weekday]}요일 ${hour}시 · ${num(count)}개`,
        style: { '--a': count ? (0.12 + 0.88 * (count / heatMax)).toFixed(3) : 0 },
      })));
    });
    $('heatmap').replaceChildren(...cells);
    $('peak').textContent = `가장 많이 대화하는 때: ${WEEKDAYS[peak.weekday]}요일 ${hourName(peak.hour)}`;
  }

  // ---- 이벤트 ----

  const drop = $('drop');
  $('file').addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  document.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
  $('sample').addEventListener('click', () => {
    show({ ...KakaoParser.parse(KakaoSample.buildSampleCsv()), encoding: 'UTF-8' }, '샘플 데이터');
  });
  $('reset').addEventListener('click', reset);
  for (const btn of document.querySelectorAll('[data-unit]')) {
    btn.addEventListener('click', () => {
      state.unit = btn.dataset.unit;
      renderTrend();
    });
  }
  // 막대가 수백 개여도 리스너는 차트에 하나씩만 둔다 (pointerover·focusin은 버블링됨)
  const chart = $('chart');
  const showBar = (e) => {
    const col = e.target.closest('.col');
    if (col) $('readout').textContent = col.getAttribute('aria-label');
  };
  chart.addEventListener('pointerover', showBar);
  chart.addEventListener('focusin', showBar);
  chart.addEventListener('pointerleave', () => { if (state.trend) $('readout').textContent = state.trend.defaultText; });
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (state.trend) renderAxis(); });
  });
})();
