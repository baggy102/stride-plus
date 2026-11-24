import { model } from 'mongoose';
import { RunSchema } from './runs.schema';

describe('RunSchema 마커 시작점', () => {
  const RunModel = model('RunSchemaSpec', RunSchema);
  const base = { userId: '64b7f0c2a1b2c3d4e5f60700', distanceKm: 1, paceSecPerKm: 300 };
  const point = { type: 'Point', coordinates: [127, 37.5] };

  it('마커 $near용 startPublic 2dsphere 인덱스', () => {
    expect(RunSchema.indexes().map(([fields]) => fields)).toContainEqual({ startPublic: '2dsphere' });
  });

  it('startPublic은 GeoJSON 점이거나 null, 값이 없으면 저장하지 않는다', () => {
    const withPoint = new RunModel({ ...base, startPublic: point });
    expect(withPoint.validateSync()).toBeUndefined();
    expect(withPoint.toObject().startPublic).toEqual(point);
    expect(new RunModel({ ...base, startPublic: null }).validateSync()).toBeUndefined();
    expect(new RunModel(base).toObject()).not.toHaveProperty('startPublic');
    expect(new RunModel({ ...base, startPublic: { type: 'LineString', coordinates: [127, 37.5] } }).validateSync()).toBeDefined();
  });

  it('원래 시작점(startRaw)은 스키마에 없어 저장되지 않는다', () => {
    expect(RunSchema.path('startRaw')).toBeUndefined();
    expect(new RunModel({ ...base, startRaw: point }).toObject()).not.toHaveProperty('startRaw');
  });
});
