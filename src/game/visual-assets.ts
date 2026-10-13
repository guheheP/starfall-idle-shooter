import type { SectorId } from './types';

const backgroundAsset = (filename: string) => `${import.meta.env.BASE_URL}assets/${filename}`;

/** Painted scenery stays behind gameplay; matching prompt sidecars live beside each PNG. */
export const SPACE_BACKGROUNDS = [
  { key: 'nebula-art', path: backgroundAsset('nebula-v2.png') },
  { key: 'wreckage-art', path: backgroundAsset('sector-wreckage-v1.png') },
  { key: 'aurora-art', path: backgroundAsset('sector-aurora-v1.png') },
  { key: 'void-art', path: backgroundAsset('sector-void-v1.png') },
] as const;

export const SECTOR_SCENERY: Record<SectorId, { key: string; tint: number; painted: boolean }> = {
  frontier: { key: 'nebula-art', tint: 0xc3d5e8, painted: false },
  ion: { key: 'nebula-art', tint: 0xa6dfea, painted: false },
  wreckage: { key: 'wreckage-art', tint: 0xe5d8c9, painted: true },
  aurora: { key: 'aurora-art', tint: 0xd5cef0, painted: true },
  void: { key: 'void-art', tint: 0xd0e6dc, painted: true },
};
