import { BASE_FLAVORS } from './webAssets.generated';

// 확정 UI 캔버스 지도 팔레트(D3, iOS 출시 플랜 §5). protomaps flavor 키에 대응시킨다
const CANVAS_MAP = {
  dark: {
    land: '#45484E', residential: '#474A50', forest: '#4F535A', grass: '#4B4E54', water: '#2E333A',
    building: '#53575D', minor: '#595D64', link: '#676C73', major: '#787D85', highway: '#878C94',
    path: '#62666D', rail: '#5E6269',
    roadLabel: '#C4C9D0', neighborhood: '#A9AFB7', district: '#DDE1E6', river: '#929CA6',
  },
  light: {
    land: '#F6F7F8', residential: '#F3F4F5', forest: '#E6EAED', grass: '#ECEFF1', water: '#D5E6F3',
    building: '#E6E8EB', minor: '#E0E3E6', link: '#D3D7DB', major: '#C4C9CE', highway: '#B4BAC0',
    path: '#D5D8DC', rail: '#C7CBD0',
    roadLabel: '#6B7079', neighborhood: '#8A9097', district: '#3C4148', river: '#5D7F9A',
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
