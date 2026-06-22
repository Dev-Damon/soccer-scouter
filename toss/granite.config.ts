import { defineConfig } from '@apps-in-toss/web-framework/config';

// 앱인토스(토스 미니앱) 설정. clientId/앱키는 코드에 들어가지 않음 — appName(콘솔 등록 식별자)만 일치시키면 됨.
export default defineConfig({
  appName: 'kicktalk', // TODO: 앱인토스 콘솔에서 앱 생성 후 받은 "앱 식별자"와 동일하게 교체
  web: {
    host: 'localhost',
    port: 8080,
    commands: {
      dev: 'webpack serve --mode development',
      build: 'webpack --mode production',
    },
  },
  permissions: [],
  outdir: 'dist',
  brand: {
    displayName: '한눈에 보는 월드컵',  // 콘솔 앱 정보 등록명과 동일해야 검수 통과(반려사유)
    icon: 'https://kicktalk.xyz/icon-512.png',
    primaryColor: '#0b1220',
    bridgeColorMode: 'inverted',
  },
  webViewProps: { type: 'partner' },
});
