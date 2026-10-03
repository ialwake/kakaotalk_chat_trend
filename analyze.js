// 메시지 배열 → 대화 추이 통계 (요약, 월/주 시리즈, 하이라이트, 요일×시간 히트맵)
(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  const OTHERS = 2; // counts 배열에서 '기타'의 자리 (0, 1은 상위 두 사람)

  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const weekStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const nextMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const nextWeek = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  // 서머타임이 있는 시간대에서도 달력상 일수 차이가 나오도록 반올림
  const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY_MS);

  // from~to 사이 모든 구간을 0으로 만들어 두어, 대화가 없던 기간도 그래프에 빈칸으로 보이게 한다
  function makeBuckets(from, to, next) {
    const list = [];
    const index = new Map();
    for (let d = from; d <= to; d = next(d)) {
      const bucket = { start: d, counts: [0, 0, 0], total: 0 };
      list.push(bucket);
      index.set(+d, bucket);
    }
    return { list, index };
  }

  function analyze(messages) {
    if (!messages.length) return null;
    const msgs = messages.slice().sort((a, b) => a.ts - b.ts);
    const first = msgs[0].ts;
    const last = msgs[msgs.length - 1].ts;

    // 메시지가 많은 두 사람을 비교 대상으로 삼고, 나머지는 '기타'로 묶는다
    const perUser = new Map();
    for (const m of msgs) perUser.set(m.user, (perUser.get(m.user) || 0) + 1);
    const ranked = [...perUser.entries()].sort((a, b) => b[1] - a[1]);
    const slotOf = new Map(ranked.slice(0, 2).map(([name], i) => [name, i]));

    const months = makeBuckets(monthStart(first), monthStart(last), nextMonth);
    const weeks = makeBuckets(weekStart(first), weekStart(last), nextWeek);
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0)); // [월..일][0..23시]
    const totals = [0, 0, 0];
    const days = []; // 대화한 날 (정렬됨, 중복 없음)

    for (const m of msgs) {
      const slot = slotOf.has(m.user) ? slotOf.get(m.user) : OTHERS;
      totals[slot]++;
      for (const bucket of [months.index.get(+monthStart(m.ts)), weeks.index.get(+weekStart(m.ts))]) {
        bucket.counts[slot]++;
        bucket.total++;
      }
      heat[(m.ts.getDay() + 6) % 7][m.ts.getHours()]++;
      const day = dayStart(m.ts);
      if (!days.length || +days[days.length - 1] !== +day) days.push(day);
    }

    // 하루도 빠짐없이 대화한 가장 긴 기간과, 대화가 없던 가장 긴 기간
    let streak = { days: 1, from: days[0], to: days[0] };
    let run = streak;
    let gap = null;
    for (let i = 1; i < days.length; i++) {
      const diff = daysBetween(days[i - 1], days[i]);
      run = diff === 1 ? { days: run.days + 1, from: run.from, to: days[i] } : { days: 1, from: days[i], to: days[i] };
      if (run.days > streak.days) streak = run;
      if (diff > 1 && (!gap || diff - 1 > gap.days)) {
        gap = { days: diff - 1, from: addDays(days[i - 1], 1), to: addDays(days[i], -1) };
      }
    }

    let peak = { weekday: 0, hour: 0, count: -1 };
    heat.forEach((row, weekday) => row.forEach((count, hour) => {
      if (count > peak.count) peak = { weekday, hour, count };
    }));

    return {
      total: msgs.length,
      first,
      last,
      spanDays: daysBetween(first, last) + 1,
      activeDays: days.length,
      people: ranked.slice(0, 2).map(([name], i) => ({ name, count: totals[i] })),
      others: ranked.length > 2 ? { people: ranked.length - 2, count: totals[OTHERS] } : null,
      months: months.list,
      weeks: weeks.list,
      bestMonth: months.list.reduce((best, b) => (b.total > best.total ? b : best)),
      longestStreak: streak,
      longestGap: gap, // 대화가 끊긴 날이 없으면 null
      heat,
      heatMax: peak.count,
      peak,
    };
  }

  const api = { analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.KakaoAnalyze = api;
})(this);
