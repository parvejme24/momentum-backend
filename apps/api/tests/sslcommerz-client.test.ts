import { describe, expect, it } from 'vitest';
import {
  assertSslCommerzAmountMatches,
  isSslCommerzPaidStatus,
} from '../src/lib/sslcommerz-client.js';
import { AppError } from '../src/lib/errors.js';

describe('sslcommerz amount validation', () => {
  it('accepts VALID and VALIDATED statuses', () => {
    expect(isSslCommerzPaidStatus('VALID')).toBe(true);
    expect(isSslCommerzPaidStatus('VALIDATED')).toBe(true);
    expect(isSslCommerzPaidStatus('FAILED')).toBe(false);
  });

  it('matches USD currency_amount, not BDT settled amount', () => {
    const paid = assertSslCommerzAmountMatches({
      expectedAmountCents: 4900,
      expectedCurrency: 'USD',
      validation: {
        status: 'VALIDATED',
        currency_type: 'USD',
        currency_amount: '49.00',
        amount: '5880.00',
        currency: 'BDT',
      },
    });
    expect(paid).toBe(4900);
  });

  it('rejects underpayment in original currency', () => {
    expect(() =>
      assertSslCommerzAmountMatches({
        expectedAmountCents: 4900,
        expectedCurrency: 'USD',
        validation: {
          status: 'VALIDATED',
          currency_type: 'USD',
          currency_amount: '10.00',
          amount: '1200.00',
          currency: 'BDT',
        },
      }),
    ).toThrow(AppError);
  });
});
