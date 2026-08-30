import { REGISTERED_COMPANY } from '@nationwide/shared-types';
import { gstStateCode } from '../invoices/indian-states';

// These values are copied onto immutable tax invoices, so a transcription slip here is expensive
// and silent. The three things that can be checked without a human re-reading the certificate are
// checked: the GSTIN's own shape, and the two ways the state is stated agreeing with it.
describe('REGISTERED_COMPANY', () => {
  it('has a structurally valid GSTIN', () => {
    // Same pattern UpdateCompanySettingsDto enforces: state code, PAN, entity number, 'Z', check.
    expect(REGISTERED_COMPANY.gstin).toMatch(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    );
  });

  it('states the same state three ways', () => {
    expect(REGISTERED_COMPANY.stateCode).toBe(
      REGISTERED_COMPANY.gstin.slice(0, 2),
    );
    expect(gstStateCode(REGISTERED_COMPANY.stateName)).toBe(
      REGISTERED_COMPANY.stateCode,
    );
  });

  it('has a six-digit SAC code', () => {
    expect(REGISTERED_COMPANY.sacCode).toMatch(/^[0-9]{6}$/);
  });

  it('fills every field InvoicesService refuses to issue without', () => {
    for (const field of [
      'gstin',
      'legalName',
      'address',
      'stateName',
      'stateCode',
      'sacCode',
    ] as const) {
      expect(REGISTERED_COMPANY[field]).toBeTruthy();
    }
  });
});
