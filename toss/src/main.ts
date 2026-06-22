// 킥톡 토스 미니앱 브릿지 — 토스 IAP(인앱결제)로 후원을 처리하는 window.tossPay 제공.
// app.js(웹 소스)는 IS_TOSS일 때 window.tossPay.products()로 상품목록을 받아 표시하고, window.tossPay.donate(sku)로 결제.
// 상품(이름/금액/sku)은 앱인토스 콘솔 등록값을 getProductItemList가 그대로 반환 → 코드에 금액/매핑 하드코딩 불필요.
import { IAP } from '@apps-in-toss/web-framework';

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
