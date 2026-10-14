import type { PartItem, PartModel, WeaponId, WeaponItem } from '../game/types';

type GearModel = WeaponId | PartModel;

// Model colour belongs to the equipment. Rarity belongs to its inventory frame.
const ENERGY: Record<GearModel, string> = {
  pulse: '#83e6f3', spread: '#edc17c', lance: '#c5a5ff', missile: '#f6a06b', arc: '#83b5ff', orbit: '#e8d796',
  focus: '#ead494', velocity: '#80d7e9', cascade: '#bc9ce8',
  reactor: '#e8b889', siphon: '#9bdbbb', bastion: '#9cbed8',
  frost: '#96e3ee', mender: '#9bddbb', striker: '#e2b180',
};

const SHAPES: Record<GearModel, string> = {
  pulse: '<path class="gear-plate" d="M42 65V33l9-16h18l9 16v32l-10 9H52z"/><path class="gear-bevel" d="M42 33h9v31l-9 1m36-32h-9v31l9 1"/><path class="gear-dark" d="M54 17h12v53H54z"/><path class="gear-metal" d="M35 31h11v38H35zm39 0h11v38H74z"/><path class="gear-energy" d="M36 19h9v23h-9zm39 0h9v23h-9z"/><path class="gear-light" d="M39 14h3v22h-3zm39 0h3v22h-3z"/><path class="gear-detail" d="M37 50h7m-7 7h7m32-7h7m-7 7h7M56 34h8m-8 8h8m-8 8h8"/>',
  spread: '<path class="gear-metal" d="m22 53 15-28 15 8-4 25-13 11zm76 0L83 25l-15 8 4 25 13 11z"/><path class="gear-plate" d="m47 70-6-35 9-13h20l9 13-6 35-13 7z"/><path class="gear-dark" d="m48 47 12-8 12 8-3 19H51z"/><path class="gear-energy" d="m24 43 9-16 7 4-7 17zm72 0-9-16-7 4 7 17zM55 11h10v27H55z"/><path class="gear-light" d="M58 8h4v22h-4"/><path class="gear-bevel" d="m45 51 15 8 15-8-2 14-13 9-13-9z"/><path class="gear-detail" d="m30 56 8 4m52-4-8 4M56 46h8"/>',
  lance: '<path class="gear-metal" d="M40 69V39l12-19h16l12 19v30l-9 6H49z"/><path class="gear-plate" d="M49 20h22v46l-11 13-11-13z"/><path class="gear-dark" d="M54 24h12v45H54z"/><path class="gear-energy" d="m60 5 5 14v36l-5 9-5-9V19z"/><path class="gear-light" d="M59 10h2v46h-2"/><path class="gear-bevel" d="m40 39 8 8v19l-8 3zm40 0-8 8v19l8 3z"/><path class="gear-detail" d="M43 51h4m-4 7h4m26-7h4m-4 7h4"/>',
  missile: '<path class="gear-plate" d="m35 69-6-20 5-21h52l5 21-6 20-25 9z"/><path class="gear-bevel" d="m29 49 14 7 17 11 17-11 14-7-6 20-25 9-25-9z"/><path class="gear-dark" d="M37 28h46v30H37z"/><path class="gear-metal" d="M35 36h13v27H35zm19-5h12v33H54zm18 5h13v27H72z"/><path class="gear-energy" d="m41 15 5 10v22H36V25zm19-7 5 11v28H55V19zm19 7 5 10v22H74V25z"/><path class="gear-light" d="M40 24h2v17h-2zm19-7h2v22h-2zm19 7h2v17h-2z"/><path class="gear-detail" d="M45 68h30"/>',
  arc: '<path class="gear-plate" d="m35 66-5-19 9-25 13-6h16l13 6 9 25-5 19-25 10z"/><path class="gear-dark" d="M42 26h36v36H42z"/><path class="gear-metal" d="M33 32h11v34H33zm43 0h11v34H76z"/><path class="gear-energy" d="M34 28h9v7h-9zm43 0h9v7h-9zm-22 3h10v7H55zm0 17h10v7H55z"/><path fill="none" stroke="currentColor" stroke-width="3" d="m36 25 8-9 10 6 9-10 10 9 11-4"/><path class="gear-light" d="m61 25-9 18h8l-3 18 11-20h-8z"/><path class="gear-bevel" d="m35 61 25 8 25-8v5L60 76 35 66z"/>',
  orbit: '<path class="gear-plate" d="m36 66-7-24 16-22h30l16 22-7 24-24 12z"/><circle class="gear-dark" cx="60" cy="45" r="23"/><circle class="gear-metal" cx="60" cy="45" r="15"/><circle class="gear-energy" cx="60" cy="45" r="10"/><circle class="gear-light" cx="60" cy="45" r="4"/><path class="gear-energy" d="m60 9 5 9-5 7-5-7zm0 56 5 7-5 9-5-9zM23 45l9-5 7 5-7 5zm58 0 7-5 9 5-9 5zM33 18l10 3 1 10-9-3zm43 43 10 1 2 10-10-3zM87 18l-3 10-9 3 1-10zM44 61l-1 10-10 3 3-10z"/><circle class="gear-detail" cx="60" cy="45" r="20" fill="none"/>',
  focus: '<path class="gear-metal" d="m14 66 29-52 10 3-4 39-18 15zm92 0L77 14l-10 3 4 39 18 15z"/><path class="gear-plate" d="m23 58 22-35 1 28-15 13zm74 0L75 23l-1 28 15 13z"/><path class="gear-dark" d="M49 37h22v18H49z"/><path class="gear-energy" d="m18 59 24-40 3 4-24 40zm84 0L78 19l-3 4 24 40zM53 42h14v6H53z"/><path class="gear-detail" d="m33 49 8 4m46-4-8 4"/>',
  velocity: '<path class="gear-metal" d="m10 62 42-41h16l42 41-22 7-19-23H51L32 69z"/><path class="gear-plate" d="m15 60 39-31-6 17-19 18zm90 0L66 29l6 17 19 18z"/><path class="gear-dark" d="m38 51 13-15h18l13 15-8 8H46z"/><path class="gear-energy" d="m18 63 29-25-1 8-21 20zm84 0L73 38l1 8 21 20zM52 30h16v6H52z"/><path class="gear-light" d="m16 65 12-10 3 4-9 7zm88 0-12-10-3 4 9 7z"/><path class="gear-detail" d="M54 44h12"/>',
  cascade: '<path class="gear-metal" d="m12 58 20-31h22v18h12V27h22l20 31-7 13-28-7-13-9-13 9-28 7z"/><path class="gear-plate" d="M21 44h27v20H21zm51 0h27v20H72z"/><path class="gear-dark" d="M28 30h17v26H28zm47 0h17v26H75z"/><path class="gear-energy" d="M29 22h6v15h-6zm9 0h6v15h-6zm32 0h6v15h-6zm9 0h6v15h-6zm-26 20h14v6H53z"/><path class="gear-detail" d="M23 58h20m34 0h20M31 43v7m9-7v7m40-7v7m9-7v7"/>',
  reactor: '<path class="gear-metal" d="m41 19 19-9 19 9 12 19v19L79 76H41L29 57V38z"/><path class="gear-plate" d="m45 20 15-6 15 6 11 21v14L75 71H45L34 55V41z"/><circle class="gear-dark" cx="60" cy="44" r="23"/><circle fill="none" stroke="currentColor" stroke-width="7" cx="60" cy="44" r="17"/><path class="gear-light" d="m60 33 8 11-8 11-8-11z"/><path class="gear-detail" d="M49 12v12m22-12v12M35 40h12m26 0h12M46 65v11m28-11v11"/>',
  siphon: '<path class="gear-metal" d="m44 12 16-5 16 5 9 13v40L72 78H48L35 65V25z"/><path class="gear-plate" d="M44 20h32v48l-8 6H52l-8-6z"/><path class="gear-dark" d="M51 22h18v44H51z"/><path class="gear-energy" d="M55 25h10v34H55z"/><path class="gear-light" d="M59 29h2v23h-2"/><path fill="none" stroke="#8da9b5" stroke-width="5" d="M43 30H31v30h12m34-30h12v30H77"/><path fill="none" stroke="currentColor" stroke-width="2" d="M42 30H31v30h11m36-30h11v30H78"/><path class="gear-detail" d="M49 67h22M49 17h22"/>',
  bastion: '<path class="gear-dark" d="M39 13h42l15 16v36L80 78H40L24 65V29z"/><path class="gear-metal" d="M42 9h36l9 11v43L74 76H46L33 63V20z"/><path class="gear-plate" d="M44 15h32v21l8 13-8 19H44l-8-19 8-13z"/><path class="gear-bevel" d="m33 23 11 13-8 13 8 19-11-5zm54 0L76 36l8 13-8 19 11-5z"/><path class="gear-dark" d="M52 28h16v31H52z"/><path class="gear-energy" d="M55 34h10v17H55z"/><path class="gear-detail" d="M44 23h32M46 62h28M28 33v22m64-22v22"/>',
  frost: '<path class="gear-metal" d="m36 23 24-13 24 13 12 23-12 22-24 11-24-11-12-22z"/><path class="gear-plate" d="m44 25 16-8 16 8 10 20-10 19-16 9-16-9-10-19z"/><path class="gear-dark" d="m47 31 13-7 13 7 8 14-8 14-13 8-13-8-8-14z"/><path class="gear-energy" d="m60 18 12 27-12 25-12-25z"/><path class="gear-light" d="m60 26 6 19-6 18-3-18z"/><path class="gear-energy" d="M22 36h10v17H22zm66 0h10v17H88z"/><path class="gear-detail" d="m36 24 9 7m39-7-9 7M40 63l8-7m32 7-8-7"/>',
  mender: '<path class="gear-metal" d="m41 19 19-8 19 8 16 22v14L79 73H41L25 55V41z"/><path class="gear-plate" d="m46 21 14-5 14 5 14 22v9L74 68H46L32 52v-9z"/><circle class="gear-dark" cx="60" cy="44" r="24"/><circle fill="none" stroke="currentColor" stroke-width="6" cx="60" cy="44" r="18"/><circle class="gear-metal" cx="60" cy="44" r="10"/><path class="gear-light" d="M57 36h6v5h5v6h-5v5h-6v-5h-5v-6h5z"/><path class="gear-bevel" d="M25 37h10v17H25zm60 0h10v17H85z"/><path class="gear-detail" d="M39 62h7m28 0h7M40 24h6m28 0h6"/>',
  striker: '<path class="gear-metal" d="m42 19 18-8 18 8 11 20v23L75 75H45L31 62V39z"/><path class="gear-plate" d="m48 21 12-5 12 5 9 20v20l-11 9H50l-11-9V41z"/><path class="gear-dark" d="M51 29h18v32H51z"/><path class="gear-metal" d="M25 24h15v38H25zm55 0h15v38H80z"/><path class="gear-energy" d="M28 12h9v24h-9zm55 0h9v24h-9zM55 39h10v15H55z"/><path class="gear-light" d="M31 9h3v19h-3zm55 0h3v19h-3z"/><path class="gear-detail" d="M29 44h7m-7 8h7m48-8h7m-7 8h7M50 65h20"/>',
};

// Broad top-facing edges and inset housings give the pieces physical depth.
// Their main silhouettes stay clean enough to recognise in a small icon grid.
const FINISH: Record<GearModel, string> = {
  pulse: '<path class="gear-metal" d="M35 40h11v8H35zm39 0h11v8H74zM51 65h18v7H51z"/><path class="gear-rim" d="M35 32h11m28 0h11M43 33l8-15h18l8 15M52 66h16"/>',
  spread: '<path class="gear-metal" d="m25 46 9 4-3 7-9-4zm70 0-9 4 3 7 9-4z"/><path class="gear-rim" d="m23 52 14-25 14 7M69 34l14-7 14 25M49 24h22M45 52l15 8 15-8"/>',
  lance: '<path class="gear-metal" d="M48 24h7v8h-7zm17 0h7v8h-7zM49 48h6v7h-6zm16 0h6v7h-6z"/><path class="gear-rim" d="m41 39 10-17m28 17L69 22M49 66l11 12 11-12"/>',
  missile: '<path class="gear-metal" d="M35 44h13v8H35zm19 0h12v8H54zm18 0h13v8H72z"/><path class="gear-rim" d="M35 37h13m24 0h13M55 32h10m-35 18 13 7 17 10 17-10 13-7"/>',
  arc: '<circle class="gear-metal" cx="60" cy="45" r="18"/><circle class="gear-energy" cx="60" cy="45" r="13"/><circle class="gear-dark" cx="60" cy="45" r="9"/><path class="gear-light" d="m62 31-10 17h8l-2 13 10-18h-8z"/><path class="gear-rim" d="M33 33h11m32 0h11M44 33a19 19 0 0 1 27-4M37 62l23 8 23-8"/>',
  orbit: '<path class="gear-rim" d="M44 29a23 23 0 0 1 32 0M39 50a23 23 0 0 0 10 14m22 0a23 23 0 0 0 10-14"/><path class="gear-detail" d="M60 26v5m0 28v5M41 45h5m28 0h5"/>',
  focus: '<path class="gear-metal" d="M49 37h22v6H49z"/><path class="gear-rim" d="m15 65 28-50 9 3m53 47L77 15l-9 3M49 38h22"/>',
  velocity: '<path class="gear-rim" d="m11 61 42-38h14l42 38M46 53h28"/><path class="gear-metal" d="M51 30h18v7H51z"/>',
  cascade: '<path class="gear-metal" d="M27 36h18v7H27zm48 0h18v7H75z"/><path class="gear-rim" d="M23 45h24m26 0h24M14 58l18-29h20m16 0h20l18 29"/>',
  reactor: '<path class="gear-metal" d="M29 37h11v17H29zm51 0h11v17H80zM47 66h26v8H47z"/><path class="gear-rim" d="m32 35 10-15 18-9 18 9 10 15M48 67h24M46 28a21 21 0 0 1 28 0"/>',
  siphon: '<path class="gear-metal" d="M44 19h32v8H44zm1 39h7v7h-7zm23 0h7v7h-7z"/><path class="gear-rim" d="M44 20h32M37 25l8-12 15-5 15 5 8 12M49 68h22"/>',
  bastion: '<path class="gear-metal" d="M42 19h36v7H42z"/><path class="gear-rim" d="M43 20h34m-43 3 10-12h32l10 12M44 63l16 12 16-12"/>',
  frost: '<path class="gear-rim" d="m37 24 23-13 23 13M35 46l10 17 15 9 15-9 10-17"/><path class="gear-metal" d="M22 33h10v6H22zm66 0h10v6H88z"/>',
  mender: '<path class="gear-metal" d="M25 37h10v7H25zm60 0h10v7H85z"/><path class="gear-rim" d="m28 38 14-18 18-8 18 8 14 18M45 29a21 21 0 0 1 30 0M43 69h34"/>',
  striker: '<path class="gear-metal" d="M25 38h15v7H25zm55 0h15v7H80z"/><path class="gear-rim" d="M25 25h15m40 0h15M43 20l17-8 17 8M50 66h20"/>',
};

let artSequence = 0;

export function gearArt(item: WeaponItem | PartItem): string {
  const model = gearArtModel(item);
  const colour = ENERGY[model];
  // One item can appear in the grid, loadout and detail view at the same time.
  // Unique IDs keep each SVG's gradients local to that individual instance.
  const id = `gear-${model}-${(++artSequence).toString(36)}`;
  const paint: Record<string, string> = {
    plate: `fill:url(#${id}-plate)`,
    metal: `fill:url(#${id}-metal)`,
    bevel: `fill:url(#${id}-bevel)`,
    dark: `fill:url(#${id}-dark)`,
    energy: `fill:url(#${id}-energy);stroke:${colour};stroke-width:.65`,
    light: 'fill:#f0fcff;stroke:none',
    rim: `fill:none;stroke:url(#${id}-rim);stroke-width:1.5`,
    detail: 'fill:none;stroke:#c2d1da;stroke-width:1;opacity:.45',
  };
  // Inline fills deliberately override the original flat material CSS rules.
  const shape = (SHAPES[model] + FINISH[model]).replace(/class="gear-([a-z]+)"/g,
    (_, material: string) => `class="gear-${material}" style="${paint[material]}"`);

  return `<svg class="gear-art-svg" data-gear-model="${model}" viewBox="0 0 120 88" fill="none" style="color:${colour}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-plate" x1="25" y1="12" x2="85" y2="78" gradientUnits="userSpaceOnUse">
        <stop stop-color="#a6b9c4"/><stop offset=".32" stop-color="#6e8798"/><stop offset=".53" stop-color="#415d74"/><stop offset="1" stop-color="#233b50"/>
      </linearGradient>
      <linearGradient id="${id}-metal" x1="34" y1="14" x2="72" y2="78" gradientUnits="userSpaceOnUse">
        <stop stop-color="#edf1ec"/><stop offset=".28" stop-color="#a9bbc3"/><stop offset=".5" stop-color="#698597"/><stop offset=".54" stop-color="#b5c6cd"/><stop offset="1" stop-color="#405b70"/>
      </linearGradient>
      <linearGradient id="${id}-bevel" x1="60" y1="30" x2="60" y2="78" gradientUnits="userSpaceOnUse">
        <stop stop-color="#516b80"/><stop offset="1" stop-color="#172c40"/>
      </linearGradient>
      <linearGradient id="${id}-dark" x1="60" y1="16" x2="60" y2="76" gradientUnits="userSpaceOnUse">
        <stop stop-color="#07121f"/><stop offset="1" stop-color="#1e3445"/>
      </linearGradient>
      <linearGradient id="${id}-energy" x1="60" y1="10" x2="60" y2="72" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f2fbff"/><stop offset=".3" stop-color="${colour}"/><stop offset=".72" stop-color="${colour}"/><stop offset="1" stop-color="#315371"/>
      </linearGradient>
      <linearGradient id="${id}-rim" x1="35" y1="15" x2="78" y2="80" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f0f6f4"/><stop offset=".48" stop-color="#a8bdcc"/><stop offset="1" stop-color="#70899e" stop-opacity=".15"/>
      </linearGradient>
    </defs>
    <ellipse cx="60" cy="77" rx="31" ry="3" fill="#020811" opacity=".6"/>
    <g stroke="#0b1b2a" stroke-width="1.15" stroke-linejoin="round">${shape}</g>
  </svg>`;
}

export function gearArtModel(item: WeaponItem | PartItem): GearModel {
  return 'type' in item ? item.type : item.model;
}
