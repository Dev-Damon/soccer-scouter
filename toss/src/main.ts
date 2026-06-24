// 킥톡 토스 미니앱 브릿지 — 토스 IAP(인앱결제)로 후원을 처리하는 window.tossPay 제공.
// app.js(웹 소스)는 IS_TOSS일 때 window.tossPay.products()로 상품목록을 받아 표시하고, window.tossPay.donate(sku)로 결제.
// 상품(이름/금액/sku)은 앱인토스 콘솔 등록값을 getProductItemList가 그대로 반환 → 코드에 금액/매핑 하드코딩 불필요.
import { IAP, loadFullScreenAd, showFullScreenAd, appLogin, getAnonymousKey, TossAds, openURL } from '@apps-in-toss/web-framework';

(window as any).__APPS_IN_TOSS__ = true;
(window as any).__TOSS_IAP__ = true;  // 콘솔에 후원 상품 등록 완료 → 인앱결제 후원 활성화

(window as any).tossPay = {
  // 콘솔 등록 후원 상품 목록 — [{ sku, displayName, displayAmount, iconUrl, description, type }]
  async products() {
    try { const res: any = await IAP.getProductItemList(); return (res && res.products) || []; }
    catch (e) { console.error('상품목록 조회 오류', e); return []; }
  },
  // sku로 1회성 인앱결제(후원). 금액/표시명은 콘솔 상품에서 결정됨.
  donate(sku: string) {
    if (!sku) { console.warn('sku 없음'); return; }
    const cleanup = IAP.createOneTimePurchaseOrder({
      options: {
        sku,
        processProductGrant: ({ orderId }: { orderId: string }) => {
          // 후원은 소모품(별도 보상 없음) → 주문 생성되면 지급 성공 처리.
          console.log('후원 완료 orderId:', orderId);
          return true;
        },
      },
      onEvent: (e: unknown) => { console.log('후원 이벤트', e); try { (cleanup as any) && (cleanup as any)(); } catch (_) {} },
      onError: (err: unknown) => { console.error('후원 오류', err); try { (cleanup as any) && (cleanup as any)(); } catch (_) {} },
    });
  },
};

// ===== 토스 전면광고 (통합광고 2.0 ver2: loadFullScreenAd/showFullScreenAd) — 토스애즈+구글애드몹 자동선택 =====
// 전면/리워드형(load→loaded이벤트→show, 전체화면). adGroupId로 타입 자동결정. 테스트ID(ait-ad-test-interstitial-id)도 이 API용.
(window as any).tossAd = {
  isSupported() { try { return (loadFullScreenAd as any).isSupported() === true; } catch (e) { return false; } },
  load(adGroupId: string, onLoaded?: () => void) {
    if (!adGroupId || !this.isSupported()) return;
    try {
      loadFullScreenAd({
        options: { adGroupId },
        onEvent: (e: any) => { if (e && e.type === 'loaded' && onLoaded) onLoaded(); },
        onError: (err: unknown) => console.error('전면광고 로드 오류', err),
      });
    } catch (e) { console.error(e); }
  },
  show(adGroupId: string, onClosed?: () => void) {
    if (!adGroupId || !this.isSupported()) { if (onClosed) onClosed(); return; }
    try {
      showFullScreenAd({
        options: { adGroupId },
        onEvent: (e: any) => { if (e && e.type === 'dismissed' && onClosed) onClosed(); },
        onError: (err: unknown) => { console.error('전면광고 표시 오류', err); if (onClosed) onClosed(); },
      });
    } catch (e) { console.error(e); if (onClosed) onClosed(); }
  },
};

// ===== 토스 로그인/사용자 식별 — 미리 구현 =====
// key(): 앱별 익명 고유키. 로그인 절차 없이 사용자 1명 식별(응원/MVP/평점 중복방지에 충분, 서버 복호화 불필요).
// login(): 토스 인증 로그인 → { authorizationCode, referrer }. 실명/프로필이 필요하면 서버에서 이 코드로 토스 API 호출 + 복호화(키는 secrets).
(window as any).__TOSS_AD__ = true;
(window as any).__TOSS_LOGIN__ = true;
(window as any).tossUser = {
  async key() { try { return await getAnonymousKey(); } catch (e) { console.error('사용자키 오류', e); return null; } },
  async login() { try { return await appLogin(); } catch (e) { console.error('로그인 오류', e); return null; } },
};

// ===== 외부 링크 열기 — 토스 공식 openURL(http/https는 외부 브라우저로). 치지직 라이브/하이라이트 등 정보성 링크용 =====
(window as any).tossOpenUrl = (url: string) => { if (!url) return; try { openURL(url); } catch (e) { console.error('openURL 오류', e); } };

// ===== 토스 배너 광고 — TossAds.initialize() 후 attachBanner로 DOM에 인라인 삽입(초기화 필수) =====
(window as any).__TOSS_BANNER__ = true;
var _tossAdsInited = false;
try {
  (TossAds as any).initialize({
    callbacks: {
      onInitialized: () => { _tossAdsInited = true; console.log('TossAds 초기화 완료'); },
      onInitializationFailed: (e: Error) => console.error('TossAds 초기화 실패', e),
    },
  });
} catch (e) { console.error('TossAds initialize 호출 오류', e); }
(window as any).tossBanner = {
  attach(adGroupId: string, el: HTMLElement) {
    if (!adGroupId || !el) return;
    function go() {
      try { (TossAds as any).attachBanner(adGroupId, el, { callbacks: { onAdFailedToRender: (e: unknown) => console.error('배너 렌더 실패', e) } }); }
      catch (e) { console.error('배너 오류', e); }
    }
    var ready = false;
    try { ready = !!((TossAds as any).isInitialized && (TossAds as any).isInitialized()); } catch (e) {}
    if (ready || _tossAdsInited) go();
    else setTimeout(go, 1200);  // 초기화 완료 대기 후 부착
  },
};
