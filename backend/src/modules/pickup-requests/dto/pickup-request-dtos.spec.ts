import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePickupRequestDto } from './create-pickup-request.dto';
import { VerifyPickupRequestDto } from './verify-pickup-request.dto';

// These rules live at the HTTP boundary (the ValidationPipe), so the service specs never see them.
async function failedFields(cls: new () => object, body: object) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property).sort();
}

const RECIPIENT = {
  name: 'Devi Ankana',
  phone: '+971500000000',
  addressLine1: '12 Palm Street',
  city: 'Dubai',
  state: 'Dubai',
  postalCode: '00000',
};

describe('CreatePickupRequestDto', () => {
  const base = {
    quoteId: '3f1c2b9e-8a4d-4c1e-9f2a-1b2c3d4e5f60',
    pickupContactName: 'Devi Ankana',
    pickupContactPhone: '1234567890',
  };

  it('accepts a warehouse drop-off with no pickup address', async () => {
    expect(
      await failedFields(CreatePickupRequestDto, {
        ...base,
        dropAtWarehouse: true,
      }),
    ).toEqual([]);
  });

  it('still requires the pickup address when a partner is collecting', async () => {
    expect(
      await failedFields(CreatePickupRequestDto, {
        ...base,
        dropAtWarehouse: false,
      }),
    ).toEqual([
      'pickupAddressLine1',
      'pickupCity',
      'pickupPostalCode',
      'pickupState',
    ]);
  });

  it('validates an optional recipient when one is sent', async () => {
    expect(
      await failedFields(CreatePickupRequestDto, {
        ...base,
        dropAtWarehouse: true,
        recipient: { ...RECIPIENT, name: '' },
      }),
    ).toEqual(['recipient']);
  });
});

describe('VerifyPickupRequestDto', () => {
  const base = { verifiedWeightKg: 2.5, verifiedShipmentType: 'PACKAGE' };

  it('requires the partner to confirm the recipient address', async () => {
    expect(await failedFields(VerifyPickupRequestDto, base)).toEqual([
      'recipient',
    ]);
  });

  it('accepts a verification with a confirmed recipient', async () => {
    expect(
      await failedFields(VerifyPickupRequestDto, {
        ...base,
        recipient: RECIPIENT,
      }),
    ).toEqual([]);
  });
});
