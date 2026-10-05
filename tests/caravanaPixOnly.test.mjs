import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const car=fs.readFileSync('worker/functions/m31-caravana-flow/entry.ts','utf8');
const ui=fs.readFileSync('src/pages/M31CaravanaForm.jsx','utf8');
const geral=fs.readFileSync('worker/functions/m31CreatePayment/entry.ts','utf8');
test('caravana checkout é exclusivamente PIX',()=>{assert.match(car,/billingTypes:\s*\['PIX'\]/);assert.match(car,/chargeTypes:\s*\['DETACHED'\]/);assert.doesNotMatch(car,/billingTypes:\s*\['PIX',\s*'CREDIT_CARD'\]/);});
test('backend rejeita tentativa de cartão ou parcelas',()=>{assert.match(car,/requestedMethod !== 'PIX'/);assert.match(car,/requestedInstallments !== 1/);assert.match(car,/exclusivamente via PIX/);});
test('UI informa pagamento da Caravana exclusivamente via PIX',()=>{assert.match(ui,/Pagamento da Caravana/);assert.match(ui,/Exclusivamente via PIX/);});
test('fluxo geral continua oferecendo cartão',()=>assert.match(geral,/\['PIX',\s*'CREDIT_CARD'\]/));
test('alteração bounded não toca confirmação PIX/webhook',()=>{assert.match(car,/payment_url: checkout\.link/);});
