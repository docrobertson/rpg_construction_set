// Construction Set: what a chest or a hidden cache is drawn as (an
// overturned cart, a loose flagstone, a dead adventurer's satchel…), for the
// chest inspector and the event inspector. Writes look: { kind, color? };
// "Automatic" clears it, and the look then follows the name (see
// data/containers.js).
import { CONTAINERS, CONTAINER_LOOKS, isContainer } from '../../data/containers.js';

const lower = (s) => s[0].toLowerCase() + s.slice(1);

// auto(obj) → { kind, why }: what it is drawn as with no look of its own
export function containerLookFields(auto, { label = 'Looks like', show = null, hint = '' } = {}) {
  return [
    {
      key: 'look.kind', label, type: 'select', options: CONTAINER_LOOKS, rerender: true, show,
      empty: (o) => { const a = auto(o); return `Automatic — ${lower(CONTAINERS[a.kind]?.label || 'a chest')}${a.why ? ` (${a.why})` : ''}`; },
      get: (o) => (isContainer(o.look?.kind) ? o.look.kind : ''),
      put: (o, v) => { if (v) o.look = { ...(isContainer(o.look?.kind) ? o.look : {}), kind: v }; else delete o.look; },
      hint,
    },
    { key: 'look.color', label: 'Its colour', type: 'color', nullable: true, show: (o) => isContainer(o.look?.kind) && (!show || show(o)), hint: 'The wood, stone, cloth or iron it is mostly made of.' },
  ];
}
