# 킥톡 앱인토스(토스 미니앱) 빌드

웹(kicktalk.xyz)은 그대로 두고, 같은 소스를 토스 미니앱 `.ait` 번들로 래핑한다.

## 구조
- `granite.config.ts` — 앱 설정(appName만 필수. clientId/앱키는 코드에 없음)
- `webpack.config.js` — `src/main.ts`(토스 IAP 브릿지)만 번들 + 정적자산 복사
- `src/main.ts` — `window.tossPay.donate(금액)` 제공(토스 인앱결제). 후원 sku 매핑은 콘솔 등록 후 교체
- `public/` — `scripts/build_toss.js`가 자동 생성(웹 index.html에서 애드센스 제거 + 토스모드 플래그, app.js/data.js 등 복사)

## 빌드 (콘솔에서 앱 생성 후)
1. `granite.config.ts`의 `appName`을 콘솔 앱 식별자로 교체
2. 콘솔에서 후원 인앱결제 상품 4개 등록 → `src/main.ts`의 `DONATE_SKU` 실제 sku로 교체
3. `cd toss && npm install`
4. `npm run build`  (prebuild가 public/ 자동 생성)
5. `npm run deploy`  (= ait deploy → .ait 업로드 → 콘솔 검수 → 출시)

## 앱키 없이 지금 가능
- 구조/코드 전부 작성됨. 앱키(clientId)는 코드에 들어갈 자리가 없음(appName + sku 문자열만 콘솔 등록 후 채움).
- 인앱결제는 샌드박스 테스트 불가 — 토스앱 실결제로만 검증(환불정책 적용).
