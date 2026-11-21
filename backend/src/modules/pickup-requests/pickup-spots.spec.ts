import {
  EMPTY_SPOTS,
  findPickupSpots,
  parseDestinations,
} from './pickup-spots';

describe('parseDestinations', () => {
  it('reads the outline, puts the preferred entrance first, then stopping points', () => {
    const result = parseDestinations({
      destinations: [
        {
          primary: {
            displayName: { text: 'Trendset Winz' },
            displayPolygon: {
              type: 'Polygon',
              coordinates: [
                [
                  [78.3477, 17.4212],
                  [78.3479, 17.4212],
                  [78.3479, 17.4214],
                  [78.3477, 17.4212],
                ],
              ],
            },
          },
          entrances: [
            { location: { latitude: 17.42121, longitude: 78.34771 } },
            {
              location: { latitude: 17.42131, longitude: 78.34781 },
              tags: ['PREFERRED'],
            },
          ],
          navigationPoints: [
            { location: { latitude: 17.4211, longitude: 78.3476 } },
          ],
        },
      ],
    });
    expect(result.buildingName).toBe('Trendset Winz');
    expect(result.outline).toHaveLength(4);
    expect(result.outline?.[0]).toEqual({
      latitude: 17.4212,
      longitude: 78.3477,
    });
    expect(result.spots.map((s) => [s.kind, s.preferred])).toEqual([
      ['ENTRANCE', true],
      ['ENTRANCE', false],
      ['STOP', false],
    ]);
    expect(result.spots[0]).toMatchObject({
      label: 'Main entrance',
      latitude: 17.42131,
    });
  });

  it('is empty for no destinations or junk', () => {
    expect(parseDestinations({})).toEqual(EMPTY_SPOTS);
    expect(parseDestinations(null)).toEqual(EMPTY_SPOTS);
    expect(
      parseDestinations({
        destinations: [{ entrances: [{ location: { latitude: 'x' } }] }],
      }).spots,
    ).toEqual([]);
  });

  it('does not call Google without a key', async () => {
    const spy = jest.spyOn(global, 'fetch');
    await expect(findPickupSpots(17, 78, '')).resolves.toEqual(EMPTY_SPOTS);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
