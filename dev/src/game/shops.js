// (market) Shops: what a merchant sells and for how much.
//
// A shop is { kind, theme, stock, priceMod } on its keeper. Its wares follow
// its theme (World Data → Shop themes: a line of trade and the few things
// along it) unless the designer has picked them by hand: a stock that is not
// empty is the designer's own list and is sold as it stands. A shop with
// neither sells along the first theme of its kind. Prices: the item's price,
// times the shop's own multiplier (or else its theme's), times the realm's
// price scale (Rules → Trade); merchants buy back at the sell rate. (The
// charms of haggling are the play screen's: ui/play.js priceOf.)
import { SHOP_THEMES } from '../data/defaults.js';
import { RNG, hashString } from '../core/rng.js';

// the kinds of shop each role keeps (a merchant may trade in odds and ends or in charms)
export const ROLE_SHOP_KINDS = {
  weapons: ['weapons'], bowyer: ['weapons'], armor: ['armor'], provisions: ['provisions'], reagents: ['reagents'], merchant: ['mixed', 'charms'], sage: ['scrolls'],
};
// the sorts of thing a shop of each kind deals in (for the theme editor's lists)
export const KIND_TYPES = {
  weapons: ['weapon', 'shield', 'charm'], armor: ['armor', 'shield', 'charm'], provisions: ['consumable', 'key', 'reagent', 'charm'], reagents: ['reagent', 'charm'],
  scrolls: ['scroll', 'consumable', 'charm'], mixed: null, charms: ['charm'],
};
export const DEFAULT_SELL_RATE = 0.35;

export const shopThemes = (game) => (Array.isArray(game?.shopThemes) ? game.shopThemes : SHOP_THEMES);
export const themeById = (game, id) => (id ? shopThemes(game).find((t) => t.id === id) || null : null);
// the first theme of a kind: what a shop with no theme and no list of its own sells
export const defaultTheme = (game, kind) => shopThemes(game).find((t) => t.kind === kind) || null;

// a shop's theme: its own, or (no list of its own either) its kind's first
export function themeOf(game, shop) {
  if (!shop) return null;
  return themeById(game, shop.theme) || (shop.stock?.length ? null : defaultTheme(game, shop.kind));
}

// what a theme gives: its items that the game has (never a quest item), in order
export function themeStock(game, theme) {
  if (!theme) return [];
  const have = new Map((game?.items || []).map((it) => [it.id, it]));
  return [...new Set(theme.items || [])].filter((id) => have.has(id) && have.get(id).type !== 'quest');
}

// does the shop follow its theme (no list of its own)?
export const followsTheme = (shop) => !!shop && !(Array.isArray(shop.stock) && shop.stock.length);

// what the shop sells: the designer's list, or what its theme gives
export function shopStock(game, shop) {
  if (!shop) return [];
  if (!followsTheme(shop)) return shop.stock.slice();
  return themeStock(game, themeOf(game, shop));
}

// the shop's markup: its own, else its theme's, else none
export function shopPriceMod(game, shop) {
  const own = parseFloat(shop?.priceMod);
  if (own > 0) return own;
  const t = parseFloat(themeOf(game, shop)?.priceMod);
  return t > 0 ? t : 1;
}

export const priceScale = (game) => { const k = parseFloat(game?.settings?.priceScale); return k > 0 ? k : 1; };
export const sellRate = (game) => { const k = parseFloat(game?.settings?.sellRate); return k >= 0 && k <= 1 ? k : DEFAULT_SELL_RATE; };

// "half", "35% of": what merchants pay, in words
export function sellWords(k) {
  const p = Math.round(k * 100);
  return p === 50 ? 'half' : p === 25 ? 'a quarter of' : p === 33 ? 'a third of' : p === 100 ? 'all of' : `${p}% of`;
}

// what a shop asks for an item, and what a merchant pays for one, before any charm
export const buyBase = (game, item, shop) => (item?.price || 0) * shopPriceMod(game, shop) * priceScale(game);
export const sellBase = (game, item) => (item?.price || 0) * sellRate(game);

// "Brannoc's Blades" and "swords and daggers", for the shop screen
export function shopTitle(game, npc) {
  const t = themeOf(game, npc?.shop);
  const who = npc?.name || 'The merchant';
  return t ? `${who}'s ${t.name}` : `${who}'s wares`;
}

// The themes a keeper of this role may take
export function themesFor(game, role) {
  const kinds = ROLE_SHOP_KINDS[role] || [];
  return shopThemes(game).filter((t) => kinds.includes(t.kind));
}

// A fitting theme for a new shop: by the kind of place (village, town,
// castle, elfhall, dwarfgate), the keeper's folk and whether the place is on
// the coast; one no other shop in the realm has taken where there is a
// choice (used: the theme ids already in use), then by the seed. Returns a
// theme id, or null when the game has none of this kind.
export function pickTheme(game, { kind, role, race, style, coast = false, seed = 1, used = new Set() } = {}) {
  const all = shopThemes(game).filter((t) => t.kind === kind && themeStock(game, t).length);
  if (!all.length) return null;
  const fits = (t, loose) => (!t.coast || coast) && (!t.roles?.length || t.roles.includes(role))
    && (loose || ((!t.styles?.length || !style || t.styles.includes(style)) && (!t.races?.length || !race || t.races.includes(race))));
  let pool = all.filter((t) => fits(t, false));
  // a bowyer's shop sells bows: the themes that name bowyers, where there are some
  if (role === 'bowyer') { const b = pool.filter((t) => t.roles?.includes('bowyer')); if (b.length) pool = b; }
  if (!pool.length) pool = all.filter((t) => fits(t, true));
  if (!pool.length) pool = all;
  // by the sea, the sea's own trade first (a chandlery); and a theme of its own if it can
  const tiers = coast ? [pool.filter((t) => t.coast), pool] : [pool];
  const list = tiers.map((p) => p.filter((t) => !used.has(t.id))).find((p) => p.length) || pool;
  return new RNG(hashString(`${seed}:${kind}:${role}`)).pick(list).id;
}

// the themes the shops of a game already follow (but not this place's own,
// nor the map it is built to replace)
export function themesInUse(game, skip = null, replaces = null) {
  const out = new Set();
  for (const m of game?.maps || []) {
    if (m === skip || (replaces && m.id === replaces)) continue;
    for (const e of m.entities || []) if (e.type === 'npc' && e.shop?.theme) out.add(e.shop.theme);
  }
  return out;
}

// (for the tests and the editor's console)
if (typeof window !== 'undefined') {
  window.__market = { shopStock, themeOf, themeStock, themeById, pickTheme, shopPriceMod, buyBase, sellBase, sellRate, priceScale, shopTitle, followsTheme, themesInUse, ROLE_SHOP_KINDS };
}
