import { isoWeek, parseDhlFuelSurcharge } from './fuel-surcharge-sources';

// A Wednesday in CW 48, the week DHL's live page listed CW 49 above it.
const CW48 = new Date('2026-11-25T06:30:00Z');

describe('parseDhlFuelSurcharge', () => {
  it('reads the current week from the top of the table', () => {
    const html = `
      <table><tbody>
        <tr><td>CW 40</td><td>46.25 %</td></tr>
        <tr><td>CW 39</td><td>45.75 %</td></tr>
      </tbody></table>`;

    expect(parseDhlFuelSurcharge(html, new Date('2026-10-01'))).toEqual({
      percent: 46.25,
      label: 'CW 40',
    });
  });

  // Copied from the live page on 25 Nov 2026: next week is published above this one.
  it("takes this week's row, not next week's published above it", () => {
    const html =
      '<tbody><tr><td>CW 49</td><td>48.00%</td></tr><tr><td>CW 48</td><td>49.25 %</td></tr>' +
      '<tr><td>CW 47</td><td>50.00 %</td></tr></tbody>';

    expect(parseDhlFuelSurcharge(html, CW48)).toEqual({
      percent: 49.25,
      label: 'CW 48',
    });
  });

  it('falls back to the top row when this week is not listed', () => {
    const html = '<tr><td>CW 47</td><td>50.00 %</td></tr>';
    expect(parseDhlFuelSurcharge(html, CW48)?.label).toBe('CW 47');
  });

  it('numbers weeks the ISO way DHL does', () => {
    expect(isoWeek(CW48)).toBe(48);
    expect(isoWeek(new Date('2027-01-01'))).toBe(53);
    expect(isoWeek(new Date('2027-01-04'))).toBe(1);
  });

  it('reads the German spelling and decimal comma', () => {
    const html = '<tr><td>KW 01</td><td>44,50 %</td></tr>';

    expect(parseDhlFuelSurcharge(html)).toEqual({
      percent: 44.5,
      label: 'CW 01',
    });
  });

  it('takes the first row, not the highest week, across a year boundary', () => {
    const html = `
      <tr><td>CW 01</td><td>44.50 %</td></tr>
      <tr><td>CW 52</td><td>46.25 %</td></tr>`;

    expect(parseDhlFuelSurcharge(html, new Date('2027-01-06'))?.percent).toBe(
      44.5,
    );
  });

  it('reports nothing rather than a number when the page changes shape', () => {
    expect(
      parseDhlFuelSurcharge('<html><body>Cookie notice</body></html>'),
    ).toBeNull();
  });
});
