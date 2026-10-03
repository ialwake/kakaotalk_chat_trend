// 샘플용 가상 1:1 대화를 Mac 카카오톡 CSV 형식으로 생성한다 (시드 고정이라 매번 같은 결과)
(function (global) {
  'use strict';

  const PEOPLE = ['민지', '준호'];
  const START = new Date(2025, 6, 1); // 2025-07-01
  const END = new Date(2026, 7, 31); // 2026-08-31, 14개월
  // 일부러 넣은 2주 공백기. 테스트에서 '최장 공백기'로 잡히는지 확인한다
  const GAP = { from: new Date(2026, 2, 9), to: new Date(2026, 2, 22) };

  const LINES = [
    '뭐해?', '이제 퇴근!', '점심 뭐 먹었어?', '김치찌개 먹었어', '오 맛있겠다', 'ㅋㅋㅋㅋㅋ', '진짜?',
    '응, 알겠어', '내일 몇 시에 볼까', '7시 어때?', '좋아 좋아', '오늘 너무 피곤하다', '고생했어',
    '잘 자', '굿밤', '주말에 영화 볼래?', '"그" 영화 말하는 거지?', '사진', '이모티콘', '배고파',
    '집 도착했어', '비 온대, 우산 챙겨', '헐 대박', '보고 싶다', '나도', '회의가 너무 길었어\n이제 끝남',
    '그럼 그때 보자', '오케이', '어디야?', '거의 다 왔어',
  ];
  // 시간대별 가중치 (0~23시): 평일은 점심과 밤, 주말은 오후부터 고르게
  const WEEKDAY_HOURS = [2, 1, 0, 0, 0, 0, 0, 1, 2, 2, 1, 2, 5, 4, 2, 2, 2, 2, 3, 4, 5, 7, 9, 6];
  const WEEKEND_HOURS = [3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5, 4, 4, 4, 5, 6, 7, 7, 5];

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const csvField = (s) => `"${s.replace(/"/g, '""')}"`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  function buildSampleCsv() {
    const rnd = mulberry32(20261003);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const pickWeighted = (weights) => {
      let r = rnd() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
      return weights.length - 1;
    };
    const gapEdges = [+addDays(GAP.from, -1), +addDays(GAP.to, 1)];
    const rows = [];

    for (let day = START; day <= END; day = addDays(day, 1)) {
      if (day >= GAP.from && day <= GAP.to) continue;
      // 관계 온도: 공백기 전까지 0.2 → 1.0으로 오르고, 공백기 뒤에는 0.5 → 0.75로 회복
      const level = day < GAP.from
        ? 0.2 + 0.8 * ((day - START) / (GAP.from - START))
        : 0.5 + 0.25 * ((day - GAP.to) / (END - GAP.to));
      // 대화 없는 날. 공백기 바로 앞뒤 날은 항상 대화해서 공백기 길이가 정확히 유지되게 한다
      if (!gapEdges.includes(+day) && rnd() < 0.3 * (1 - level)) continue;

      const share = 0.42 + 0.18 * ((day - START) / (END - START)); // 민지 비중 42% → 60%
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      const total = Math.max(2, Math.round(level * 18 * (0.4 + rnd() * 1.2)));
      const sessions = 1 + Math.floor(rnd() * (total > 15 ? 3 : 2));
      const perSession = Math.ceil(total / sessions);
      const dayEnd = +addDays(day, 1);

      for (let s = 0; s < sessions; s++) {
        const hour = pickWeighted(weekend ? WEEKEND_HOURS : WEEKDAY_HOURS);
        let t = +new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60));
        // 자정을 넘기지 않게 해서 날짜별 집계(공백기 경계)가 흐트러지지 않게 한다
        for (let k = 0; k < perSession && t < dayEnd; k++) {
          rows.push({ t, user: PEOPLE[rnd() < share ? 0 : 1], text: pick(LINES) });
          t += Math.floor((10 + rnd() * 200) * 1000);
        }
      }
    }

    rows.sort((a, b) => a.t - b.t);
    const lines = rows.map((r) => `${fmt(new Date(r.t))},${csvField(r.user)},${csvField(r.text)}`);
    return ['Date,User,Message', ...lines].join('\n');
  }

  const api = { buildSampleCsv, SAMPLE_GAP: GAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.KakaoSample = api;
})(this);
