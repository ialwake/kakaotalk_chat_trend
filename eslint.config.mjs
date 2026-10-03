import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    // 브라우저에서 classic script로 로드되는 파일. Node 테스트용 module.exports 가드가 있어 module도 허용
    files: ['parser.js', 'analyze.js', 'sample.js', 'app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' },
    },
  },
  {
    // app.js는 앞서 로드된 스크립트들이 window에 올려 둔 전역을 쓴다
    files: ['app.js'],
    languageOptions: {
      globals: { KakaoParser: 'readonly', KakaoAnalyze: 'readonly', KakaoSample: 'readonly' },
    },
  },
  {
    files: ['test.js', 'scripts/**/*.js', '.claude/hooks/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];
