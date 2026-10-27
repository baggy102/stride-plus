import { BASE_FLAVORS } from './webAssets.generated';

// Frost 지도 팔레트(2026-10-27, 캔버스 「B 오버레이」: 무채색 + 블루로 식힌 톤, 거리명은 남긴다).
// 캔버스는 바탕(land)만 정했고, 나머지는 그 색에서 명도 단계를 이어 만든 값이다. protomaps flavor 키에 대응시킨다
const CANVAS_MAP = {
  dark: {
    land: '#16202B', residential: '#18232F', forest: '#1A2734', grass: '#182530', water: '#0E1620',
    building: '#1E2A37', minor: '#243242', link: '#2B3B4D', major: '#34475B', highway: '#3E5369',
    path: '#213040', rail: '#263546',
    roadLabel: '#9AAAB9', neighborhood: '#7F90A1', district: '#C3D0DC', river: '#6E8AA6',
  },
  light: {
    land: '#E9EEF3', residential: '#E5EBF1', forest: '#DCE5EC', grass: '#E0E8EE', water: '#CADCEB',
    building: '#DCE3EA', minor: '#D6DEE6', link: '#C9D3DD', major: '#B9C5D1', highway: '#A7B5C3',
    path: '#D2DAE2', rail: '#C2CCD6',
    roadLabel: '#5D6976', neighborhood: '#7A8693', district: '#2E3A47', river: '#4F7393',
  },
} as const;

// 캔버스에 없는 면(병원·학교·공업 등)은 주거지 색으로, 도로 테두리는 육지 색으로(테두리 없이 평면)
export function mapFlavor(dark: boolean): Record<string, string> {
  const p = CANVAS_MAP[dark ? 'dark' : 'light'];
  const flavor: Record<string, string> = { ...BASE_FLAVORS[dark ? 'dark' : 'light'] };
  for (const key of Object.keys(flavor)) {
    if (key.includes('casing')) flavor[key] = p.land;
  }
  const roads = { minor: p.minor, link: p.link, major: p.major, highway: p.highway, other: p.minor };
  for (const [level, color] of Object.entries(roads)) {
    for (const prefix of ['', 'tunnel_', 'bridges_']) {
      if (`${prefix}${level}` in flavor) flavor[`${prefix}${level}`] = color;
    }
  }
  return {
    ...flavor,
    background: p.land,
    earth: p.land,
    park_a: p.grass, park_b: p.grass,
    wood_a: p.forest, wood_b: p.forest, scrub_a: p.forest, scrub_b: p.forest,
    hospital: p.residential, industrial: p.residential, school: p.residential, zoo: p.grass,
    military: p.residential, aerodrome: p.residential, pedestrian: p.residential,
    sand: p.residential, beach: p.residential, glacier: p.residential, pier: p.residential,
    runway: p.minor,
    water: p.water,
    buildings: p.building,
    minor_a: p.minor, minor_b: p.minor, minor_service: p.minor,
    railway: p.rail,
    boundaries: p.path,
    roads_label_minor: p.roadLabel, roads_label_major: p.roadLabel,
    roads_label_minor_halo: p.land, roads_label_major_halo: p.land,
    subplace_label: p.neighborhood, subplace_label_halo: p.land,
    city_label: p.district, city_label_halo: p.land,
    state_label: p.district, state_label_halo: p.land,
    country_label: p.district,
    address_label: p.neighborhood, address_label_halo: p.land,
    ocean_label: p.river,
  };
}
