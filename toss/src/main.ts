// 킥톡 토스 미니앱 브릿지 — 토스 IAP(인앱결제)로 후원을 처리하는 window.tossPay 제공.
// app.js(웹 소스)는 IS_TOSS일 때 window.tossPay.donate(금액)를 호출함. SDK는 토스 WebView에서만 동작.
import { IAP } from '@apps-in-toss/web-framework';

// 후원 금액 → 콘솔 등록 인앱결제 상품(sku) 매핑.
// TODO: 앱인토스 콘솔에서 후원 상품 4개 등록 후 실제 sku 문자열로 교체. (금액/표시명은 콘솔 상품에서 옴)
const DONATE_SKU: Record<number, string> = {
  3900: 'donate_3900',
  6900: 'donate_6900',
  9900: 'donate_9900',
  19900: 'donate_19900',
};

(window as any).__APPS_IN_TOSS__ = true;
(window as any).tossPay = {
  donate(amount: number) {
    const sku = DONATE_SKU[amount];
    if (!sku) { console.warn('등록되지 않은 후원 금액:', amount); return; }
    const cleanup = IAP.createOneTimePurchaseOrder({
      options: {
        sku,
        processProductGrant: ({ orderId }: { orderId: string }) => {
          // 후원 보상(감사 배지 등) 지급 지점. 서버 검증이 필요하면 여기서.
          console.log('후원 완료 orderId:', orderId);
          return true;
        },
      },
      onEvent: (e: unknown) => { console.log('후원 이벤트', e); try { cleanup && cleanup(); } catch (_) {} },
      onError: (err: unknown) => { console.error('후원 오류', err); try { cleanup && cleanup(); } catch (_) {} },
    });
  },
  async products() {
    try { const res = await IAP.getProductItemList(); return (res as any)?.products ?? []; }
    catch (e) { console.error(e); return []; }
  },
};
