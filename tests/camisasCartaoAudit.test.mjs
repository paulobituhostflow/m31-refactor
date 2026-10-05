import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkout=readFileSync(new URL('../worker/functions/m31CamisaVendaPayment/entry.ts',import.meta.url),'utf8');
const webhook=readFileSync(new URL('../worker/functions/m31ProcessarWebhookAsaas/entry.ts',import.meta.url),'utf8');

test('cartão das camisas aceita 1x a 5x e calcula no servidor pela regra vigente',()=>{
  assert.match(checkout,/CARD_INSTALLMENTS = Object\.freeze\(\[1, 2, 3, 4, 5\]\)/);
  assert.match(checkout,/ASAAS_CARD_RATE/);
  assert.match(checkout,/ASAAS_FIXED_FEE/);
  assert.match(checkout,/ASAAS_ANTICIPATION_MONTHLY \* count/);
  assert.match(checkout,/action === 'quote'/);
  assert.match(checkout,/!CARD_INSTALLMENTS\.includes\(installmentCount\)/);
});
test('checkout cria cobrança Asaas com modalidade e parcelamento escolhidos',()=>{
  assert.match(checkout,/billingType: paymentMethod/);
  assert.match(checkout,/installmentCount, totalValue: quote\.total/);
  assert.match(checkout,/payment_method: paymentMethod/);
  assert.match(checkout,/installment_count: installmentCount/);
});
test('servidor barra preço divergente antes da cobrança',()=>{
  assert.match(checkout,/cents\(expected\) !== cents\(quote\.total\)/);
  assert.match(checkout,/O preço mudou/);
});
test('pedido legado sem modalidade não é presumido como PIX',()=>{
  assert.match(checkout,/payment_method: pedido\.payment_method \|\| 'UNKNOWN'/);
  assert.match(checkout,/installment_count: pedido\.installment_count \?\? null/);
  assert.doesNotMatch(webhook,/expectedBillingType = String\(pedido\.payment_method \|\| 'PIX'\)/);
  assert.match(webhook,/pedido_camisa_legado_modalidade_desconhecida/);
});
test('webhook reconsulta Asaas e exige valor modalidade e parcelas exatos',()=>{
  assert.match(webhook,/payments\/\$\{encodeURIComponent\(payment\.id\)\}/);
  assert.match(webhook,/Math\.round\(fullTotal \* 100\) !== Math\.round\(expectedTotal \* 100\)/);
  assert.match(webhook,/billingType !== expectedBillingType/);
  assert.match(webhook,/fullInstallments !== expectedInstallments/);
  assert.match(webhook,/divergencia_financeira_camisa/);
});
test('aviso à Dulce e agradecimento preservam idempotência do pedido',()=>{
  assert.match(webhook,/m31AvisoCompraConfirmada/);
  assert.match(webhook,/OBRIGADO_CAMISA:V1/);
  assert.match(webhook,/idempotency_key: dedupKey/);
});
