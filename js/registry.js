// Zone registry — loads the baked zone atlas + metadata and exposes lookup maps.
// Shared by the 3D view (picking, shader) and the UI panels (zone lists).

import { VIRTUAL_ZONES } from './zones.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadRegistry(base = 'assets/') {
  const [baked, atlasImage] = await Promise.all([
    fetch(`${base}zones.baked.json`).then(r => {
      if (!r.ok) throw new Error(`zones.baked.json: HTTP ${r.status}`);
      return r.json();
    }),
    loadImage(`${base}zones-atlas.png`)
  ]);

  const zones = [...baked.zones].sort((a, b) => a.index - b.index);
  const byIndex = new Map(zones.map(z => [z.index, z]));
  const byId = new Map(zones.map(z => [z.id, z]));

  // Virtual zones get URL-encoding slots after the baked range; their index is
  // never sampled from the atlas and the zone shader ignores out-of-range slots.
  VIRTUAL_ZONES.forEach((v, i) => {
    const entry = { ...v, baseId: v.id, index: zones.length + i + 1, virtual: true, priority: 0 };
    byId.set(v.id, entry);
    byIndex.set(entry.index, entry);
  });

  return {
    zones,
    atlasImage,
    atlasSize: baked.atlasSize,
    idScale: baked.idScale,
    zoneById: id => byId.get(id) || null,
    zoneIdAt: index => byIndex.get(index)?.id || null,
    zoneIndexOf: id => byId.get(id)?.index ?? -1
  };
}
