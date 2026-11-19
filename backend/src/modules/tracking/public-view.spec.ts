import type { TrackingResultDto } from '@nationwide/shared-types';
import { maskName, maskPhone, publicTracking } from './public-view';

describe('publicTracking', () => {
  const dto = {
    internalTrackingNumber: 'NW-26-00000001',
    customerName: 'Ravi Kumar Sharma',
    consigneeName: 'Arjun Reddy',
    consigneePhone: '+12015550123',
    items: [
      {
        description: 'Saree',
        category: 'Garments',
        quantity: 2,
        unitValue: 4500,
        hsCode: '5208',
      },
    ],
  } as unknown as TrackingResultDto;

  it('keeps names short, the phone to its last four digits and items to names and counts', () => {
    const view = publicTracking(dto);
    expect(view.customerName).toBe('Ravi S.');
    expect(view.consigneeName).toBe('Arjun R.');
    expect(view.consigneePhone).toBe('•••• 0123');
    expect(view.items).toEqual([
      { description: 'Saree', category: 'Garments', quantity: 2 },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/4500|5208|Kumar|2015550/);
  });

  it('gives the same answer when applied twice', () => {
    expect(publicTracking(publicTracking(dto))).toEqual(publicTracking(dto));
  });

  it('copes with missing values', () => {
    expect(maskName(null)).toBeNull();
    expect(maskName('Priya')).toBe('Priya');
    expect(maskPhone(null)).toBeNull();
  });
});
