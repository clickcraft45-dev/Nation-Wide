import { parseDhlFuelSurcharge } from './fuel-surcharge-sources';

describe('parseDhlFuelSurcharge', () => {
  it('reads the current week from the top of the table', () => {
    const html = `
      <table><tbody>
        <tr><td>CW 40</td><td>46.25 %</td></tr>
        <tr><td>CW 39</td><td>45.75 %</td></tr>
      </tbody></table>`;

    expect(parseDhlFuelSurcharge(html)).toEqual({
      percent: 46.25,
      label: 'CW 40',
    });
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

    expect(parseDhlFuelSurcharge(html)?.percent).toBe(44.5);
  });

  it('reports nothing rather than a number when the page changes shape', () => {
    expect(
      parseDhlFuelSurcharge('<html><body>Cookie notice</body></html>'),
    ).toBeNull();
  });
});
