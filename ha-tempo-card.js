/*!
 * HA Tempo Card — carte Lovelace animée pour l'offre Tempo d'EDF et le signal Ecowatt de RTE
 * type: custom:tempo-card
 * MIT License
 */
/* Aujourd'hui : grand disque à la couleur du jour, soleil (heures pleines) ou lune (heures creuses).
 * Demain : carte « ? » qui pulse tant que RTE n'a pas publié, puis se retourne quand la couleur tombe.
 * Saison : jours rouges, blancs et bleus restants (barres). Ecowatt : J, J+1, J+2 (vert, orange, rouge).
 * Sources : intégration RTE Tempo (hekmon/rtetempo), RTE Ecowatt (kamaradclimber/rte-ecowatt),
 * ou n'importe quel capteur dont l'état contient bleu / blanc / rouge (blue / white / red, 🔵 ⚪ 🔴).
 */
(() => {
  const TAG = 'tempo-card';
  if (customElements.get(TAG)) return;
  const VERSION = '1.0.0';

  const T = {
    fr: {
      name: 'Tempo', today: "Aujourd'hui", tomorrow: 'Demain', blue: 'Bleu', white: 'Blanc', red: 'Rouge', unknown: 'Inconnu',
      hp: 'Heures pleines', hc: 'Heures creuses', period: 'Période', price: 'Prix', left: 'restants', season: 'Saison',
      ecowatt: 'Ecowatt', eco_ok: 'Normal', eco_warn: 'Tendu', eco_cut: 'Coupures', eco_alert: 'Ecowatt : réseau électrique tendu',
      red_tomorrow: 'Demain : jour ROUGE', red_now: 'Jour rouge en heures pleines', red_left: 'Rouges', white_left: 'Blancs', blue_left: 'Bleus',
    },
    en: {
      name: 'Tempo', today: 'Today', tomorrow: 'Tomorrow', blue: 'Blue', white: 'White', red: 'Red', unknown: 'Unknown',
      hp: 'Peak hours', hc: 'Off-peak hours', period: 'Period', price: 'Price', left: 'left', season: 'Season',
      ecowatt: 'Ecowatt', eco_ok: 'Normal', eco_warn: 'Strained', eco_cut: 'Outages', eco_alert: 'Ecowatt: power grid under strain',
      red_tomorrow: 'Tomorrow: RED day', red_now: 'Red day, peak hours', red_left: 'Red', white_left: 'White', blue_left: 'Blue',
    },
  };
  // jours par saison Tempo (1er septembre → 31 août) : 22 rouges, 43 blancs, le reste en bleu
  const TOTAL = { red: 22, white: 43, blue: 300 };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); // texte → HTML sûr

  const CSS = `
:host{display:block}
ha-card{display:block;padding:10px 12px 12px;overflow:hidden;--tp-blue:#1e6fd9;--tp-white:#f4f6f8;--tp-red:#e53935;--tp-unk:#6b7480;
  --eco-0:#2e9e5b;--eco-2:#f39c12;--eco-3:#e53935}
.head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.title{font-size:14px;font-weight:500;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:var(--secondary-background-color);color:var(--secondary-text-color);white-space:nowrap}
.d-blue .badge{background:color-mix(in srgb,var(--tp-blue) 25%,transparent);color:#5ea2ff}
.d-white .badge{background:color-mix(in srgb,#cfd6dd 25%,transparent);color:var(--primary-text-color)}
.d-red .badge{background:color-mix(in srgb,var(--tp-red) 25%,transparent);color:var(--tp-red)}
.alert{display:none;margin-top:4px;font-size:11px;color:var(--tp-red);font-weight:600;text-align:center}
.alert.on{display:block;animation:tpblink 1.2s steps(2) infinite}
svg{display:block;width:100%;max-width:300px;height:auto;margin:2px auto 0;overflow:visible;cursor:pointer}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:6px;margin-top:6px}
.tile{box-sizing:border-box;background:var(--secondary-background-color);border-radius:10px;padding:5px 7px;min-width:0;overflow:hidden;text-align:center;cursor:pointer}
.tile .l{display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;line-height:14px;color:var(--secondary-text-color);min-width:0}
.tile .l span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tile .l ha-icon{--mdc-icon-size:13px;flex:none}
.tile .v{font-size:14px;line-height:18px;font-weight:600;color:var(--primary-text-color);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .v small{font-size:10px;font-weight:400;color:var(--secondary-text-color);margin-left:2px}
.tile.hide{display:none}

/* ---- illustration ---- */
.txt{font:700 12px/1 var(--paper-font-body1_-_font-family,Roboto,sans-serif);text-anchor:middle}
.lab{fill:var(--secondary-text-color);font:500 9.5px/1 var(--paper-font-body1_-_font-family,Roboto,sans-serif);text-anchor:middle}
.small{font:600 7.5px/1 var(--paper-font-body1_-_font-family,Roboto,sans-serif)}
/* disque du jour : respire doucement, bat comme un cœur un jour rouge */
.disc{transform-box:fill-box;transform-origin:center;transition:fill .6s;animation:tpbreath 4s ease-in-out infinite}
.halo{transform-box:fill-box;transform-origin:center;opacity:.35;animation:tphalo 4s ease-in-out infinite}
.d-red .disc{animation:tpbeat 1.4s ease-in-out infinite}.d-red .halo{animation:tphalo 1.4s ease-in-out infinite;opacity:.5}
@keyframes tpbreath{50%{transform:scale(1.03)}}
@keyframes tpbeat{0%,40%,100%{transform:scale(1)}20%{transform:scale(1.06)}30%{transform:scale(.99)}}
@keyframes tphalo{0%,100%{transform:scale(1);opacity:.35}50%{transform:scale(1.18);opacity:0}}
/* soleil (heures pleines) ou lune (heures creuses) */
.sun,.moon{opacity:0;transition:opacity .6s}
.hp .sun,.hc .moon{opacity:1}
.rays{transform-box:fill-box;transform-origin:center;animation:tpspin 12s linear infinite}
@keyframes tpspin{to{transform:rotate(360deg)}}
.star{animation:tptw 2s ease-in-out infinite}.star:nth-of-type(2){animation-delay:-.7s}.star:nth-of-type(3){animation-delay:-1.3s}
@keyframes tptw{50%{opacity:.2}}
/* carte du lendemain : « ? » qui pulse, puis retournement à la publication */
.tmr{transform-box:fill-box;transform-origin:center}
.tmr.flip{animation:tpflip .9s ease-in-out}
@keyframes tpflip{0%{transform:scaleX(1)}45%{transform:scaleX(0)}55%{transform:scaleX(0)}100%{transform:scaleX(1)}}
.t-unknown .qm{animation:tpq 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes tpq{50%{transform:scale(1.15);opacity:.6}}
.t-red .tcard{filter:drop-shadow(0 0 6px var(--tp-red))}
/* Ecowatt */
.eco.l2{animation:tpblink 1.4s steps(2) infinite}.eco.l3{animation:tpblink .7s steps(2) infinite}
.noeco .ecog{display:none}
.bar{transform-box:fill-box;transform-origin:0 50%;transition:transform 1s}
@keyframes tpblink{50%{opacity:.4}}
.noanim *{animation:none!important}
`;

  const SVG = () => `
<svg viewBox="0 0 300 172" role="img">
 <defs>
  <radialGradient id="tpshine" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
 </defs>
 <!-- aujourd'hui -->
 <circle class="halo" id="tphalo" cx="70" cy="66" r="46"/>
 <circle class="disc" id="tpdisc" cx="70" cy="66" r="44" stroke="rgba(0,0,0,.15)" stroke-width="1"/>
 <circle cx="70" cy="66" r="44" fill="url(#tpshine)" pointer-events="none"/>
 <text class="txt" id="tpdtxt" x="70" y="70" style="font-size:15px">--</text>
 <g class="sun" transform="translate(110 26)">
  <circle r="13" fill="#1b2433"/>
  <g class="rays" stroke="#ffc83d" stroke-width="1.8" stroke-linecap="round">
   <path d="M0 -10 V-7.5 M0 10 V7.5 M-10 0 H-7.5 M10 0 H7.5 M-7 -7 L-5.3 -5.3 M7 7 L5.3 5.3 M-7 7 L-5.3 5.3 M7 -7 L5.3 -5.3"/>
  </g>
  <circle r="4.6" fill="#ffc83d"/>
 </g>
 <g class="moon" transform="translate(110 26)">
  <circle r="13" fill="#1b2433"/>
  <path d="M2 -7 A7.5 7.5 0 1 0 6 5 A6 6 0 1 1 2 -7 Z" fill="#dfe6f0"/>
  <g fill="#fff"><circle class="star" cx="-7" cy="-5" r=".9"/><circle class="star" cx="5" cy="-8" r=".7"/><circle class="star" cx="-4" cy="7" r=".7"/></g>
 </g>
 <text class="lab" id="tplt" x="70" y="124">--</text>
 <!-- demain -->
 <g class="tmr" id="tptmr">
  <rect class="tcard" id="tpcard" x="148" y="28" width="66" height="82" rx="10" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
  <rect x="148" y="28" width="66" height="82" rx="10" fill="url(#tpshine)" pointer-events="none"/>
  <text class="txt qm" id="tptq" x="181" y="74" style="font-size:22px">?</text>
 </g>
 <text class="lab" id="tplm" x="181" y="124">--</text>
 <!-- Ecowatt J, J+1, J+2 -->
 <g class="ecog">
  <text class="lab" id="tple" x="262" y="22">Ecowatt</text>
  <g id="tpeco"></g>
 </g>
 <!-- saison : jours restants -->
 <g id="tpseason"></g>
</svg>`;

  const COL = { blue: 'var(--tp-blue)', white: 'var(--tp-white)', red: 'var(--tp-red)', unknown: 'var(--tp-unk)' };
  const ECO = ['var(--eco-0)', 'var(--eco-0)', 'var(--eco-2)', 'var(--eco-3)'];

  class TempoCard extends HTMLElement {
    static getConfigElement() { return document.createElement(TAG + '-editor'); }
    static getStubConfig(hass) {
      const ids = Object.keys((hass && hass.states) || {});
      const f = (re) => ids.find((i) => re.test(i)) || '';
      return {
        entity_today: f(/^sensor\.rte_tempo_couleur_actuelle$/) || f(/^sensor\..*tempo.*(couleur_actuelle|today|aujourd)/),
        entity_tomorrow: f(/^sensor\.rte_tempo_prochaine_couleur$/) || f(/^sensor\..*tempo.*(prochaine_couleur$|tomorrow|demain)/),
        entity_offpeak: f(/^binary_sensor\..*tempo.*heures_creuses/),
        entity_red_left: f(/^sensor\..*tempo.*restants.*rouge/),
        entity_white_left: f(/^sensor\..*tempo.*restants.*blanc/),
        entity_blue_left: f(/^sensor\..*tempo.*restants.*bleu/),
        entity_ecowatt_today: f(/^sensor\.ecowatt_level_today$/),
        entity_ecowatt_tomorrow: f(/^sensor\.ecowatt_level_tomorrow$/),
        entity_ecowatt_day2: f(/^sensor\.ecowatt_level_in_2_days$/),
      };
    }
    setConfig(c) {
      if (!c || typeof c !== 'object') throw new Error('Invalid configuration');
      this._c = { show_status: true, show_season: true, show_ecowatt: true, show_tiles: true, off_peak: '22:00-06:00', ...c };
      this._built = false; this._lastTmr = undefined;
      if (this._hass) this._render();
    }
    set hass(h) { this._hass = h; if (this._c) this._render(); }
    getCardSize() { return 5; }
    getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

    _lang() { const l = (this._c.language || (this._hass && this._hass.language) || 'fr').slice(0, 2); return T[l] ? l : 'en'; }
    _t(k) { return T[this._lang()][k] ?? T.en[k] ?? k; }
    _st(id) { return id && this._hass.states[id]; }
    _num(id) {
      const s = this._st(id); if (!s) return NaN;
      const v = parseFloat(String(s.state).replace(',', '.'));
      return isFinite(v) ? v : NaN;
    }
    _fmt(v, d = 0) { return isNaN(v) ? '--' : v.toLocaleString(this._lang() === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d }); }
    _more(id) { if (id) this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true })); }

    // couleur Tempo depuis n'importe quel texte : « Bleu », « BLUE », « 🔵 », « Jour rouge »…
    _color(id) {
      const s = this._st(id); if (!s) return 'unknown';
      const v = String(s.state).toLowerCase();
      if (/rouge|red|🔴/.test(v)) return 'red';
      if (/blanc|white|⚪/.test(v)) return 'white';
      if (/bleu|blue|🔵/.test(v)) return 'blue';
      return 'unknown';
    }
    // niveau Ecowatt 0 → 3 : attribut level_code de RTE Ecowatt, sinon nombre ou texte
    _eco(id) {
      const s = this._st(id); if (!s) return null;
      const a = s.attributes || {};
      if (a.level_code !== undefined && a.level_code !== null && isFinite(Number(a.level_code))) return Number(a.level_code);
      const n = parseFloat(s.state); if (isFinite(n)) return Math.max(0, Math.min(3, n));
      const v = String(s.state).toLowerCase();
      if (/coupure.*(cours|programm)|outage|red|rouge/.test(v)) return 3;
      if (/risque|orange|tendu|strain/.test(v)) return 2;
      if (/normal|vert|green/.test(v)) return 1;
      return null;
    }
    // heures creuses : capteur binaire sinon plages « 22:00-06:00, 12:30-14:00 »
    _offPeak() {
      const c = this._c, s = this._st(c.entity_offpeak);
      if (s) return s.state === 'on';
      const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
      return String(c.off_peak || '').split(',').some((r) => {
        const x = r.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/); if (!x) return false;
        const a = +x[1] * 60 + +x[2], b = +x[3] * 60 + +x[4];
        return a <= b ? m >= a && m < b : m >= a || m < b;
      });
    }

    _build() {
      const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><ha-card>
        <div class="head"><div class="title" id="tptitle"></div><div class="badge" id="tpbadge"></div></div>
        ${SVG()}
        <div class="alert" id="tpalert"></div>
        <div class="tiles" id="tptiles"></div>
      </ha-card>`;
      root.querySelector('svg').addEventListener('click', () => this._more(this._c.entity_today));
      this._root = root; this._card = root.querySelector('ha-card'); this._built = true;
    }

    _render() {
      if (!this._built) this._build();
      const c = this._c, r = this._root, card = this._card;
      const today = this._color(c.entity_today), tmr = this._color(c.entity_tomorrow), hc = this._offPeak();
      const eco = [c.entity_ecowatt_today, c.entity_ecowatt_tomorrow, c.entity_ecowatt_day2].map((id) => (id ? this._eco(id) : undefined));
      const hasEco = c.show_ecowatt !== false && eco.some((x) => x !== undefined);
      card.className = `d-${today} t-${tmr} ${hc ? 'hc' : 'hp'}${hasEco ? '' : ' noeco'} ${c.animations === false ? 'noanim' : ''}`;

      r.getElementById('tptitle').textContent = c.name || this._t('name');
      const badge = r.getElementById('tpbadge');
      badge.textContent = `${this._t(today)} · ${this._t(hc ? 'hc' : 'hp')}`; badge.style.display = c.show_status === false ? 'none' : '';

      // aujourd'hui
      const disc = r.getElementById('tpdisc'), halo = r.getElementById('tphalo'), dt = r.getElementById('tpdtxt');
      disc.setAttribute('fill', COL[today]); halo.setAttribute('fill', COL[today]);
      dt.textContent = this._t(today).toUpperCase(); dt.setAttribute('fill', today === 'white' ? '#1d2125' : '#fff');
      r.getElementById('tplt').textContent = this._t('today');
      // demain : retournement quand la couleur change (publication RTE vers 11 h)
      const tg = r.getElementById('tptmr'), tq = r.getElementById('tptq');
      r.getElementById('tpcard').setAttribute('fill', COL[tmr]);
      tq.textContent = tmr === 'unknown' ? '?' : this._t(tmr).toUpperCase();
      tq.style.fontSize = tmr === 'unknown' ? '22px' : '11px';
      tq.setAttribute('fill', tmr === 'white' ? '#1d2125' : '#fff');
      if (this._lastTmr !== undefined && this._lastTmr !== tmr) { tg.classList.remove('flip'); void tg.getBBox(); tg.classList.add('flip'); }
      this._lastTmr = tmr;
      r.getElementById('tplm').textContent = this._t('tomorrow');

      // Ecowatt : trois pastilles J, J+1, J+2
      r.getElementById('tpeco').innerHTML = hasEco ? eco.map((lv, i) => {
        const y = 32 + i * 28, lbl = ['J', 'J+1', 'J+2'][i];
        const col = lv === null || lv === undefined ? 'var(--tp-unk)' : ECO[lv];
        const txt = lv === null || lv === undefined ? '--' : this._t(lv >= 3 ? 'eco_cut' : lv === 2 ? 'eco_warn' : 'eco_ok');
        return `<rect class="eco l${lv ?? 'x'}" x="234" y="${y}" width="56" height="22" rx="11" fill="${col}"/>
          <text class="small" x="241" y="${y + 14}" fill="#fff">${esc(lbl)}</text>
          <text class="small" x="284" y="${y + 14}" fill="#fff" text-anchor="end">${esc(txt)}</text>`;
      }).join('') : '';

      // saison : jours restants par couleur
      const left = { red: this._num(c.entity_red_left), white: this._num(c.entity_white_left), blue: this._num(c.entity_blue_left) };
      const showSeason = c.show_season !== false && Object.values(left).some((v) => !isNaN(v));
      r.getElementById('tpseason').innerHTML = showSeason ? ['red', 'white', 'blue'].map((k, i) => {
        const x = 10 + i * 96, v = left[k], used = isNaN(v) ? 0 : Math.max(0, Math.min(1, 1 - v / TOTAL[k]));
        const lbl = `${this._t(k + '_left')} · ${isNaN(v) ? '--' : Math.round(v)} ${this._t('left')}`;
        return `<text class="small" x="${x}" y="148" fill="var(--secondary-text-color)">${esc(lbl)}</text>
          <rect x="${x}" y="154" width="88" height="7" rx="3.5" fill="rgba(127,127,127,.25)"/>
          <rect class="bar" x="${x}" y="154" width="88" height="7" rx="3.5" fill="${COL[k]}" stroke="${k === 'white' ? '#aab4bf' : 'none'}" stroke-width=".6" style="transform:scaleX(${(1 - used).toFixed(3)})"/>`;
      }).join('') : '';
      r.querySelector('svg').setAttribute('viewBox', showSeason ? '0 0 300 172' : '0 0 300 132');

      // alertes
      const alerts = [];
      if (tmr === 'red') alerts.push(this._t('red_tomorrow'));
      else if (today === 'red' && !hc) alerts.push(this._t('red_now'));
      if (hasEco && eco.slice(0, 2).some((x) => x >= 2)) alerts.push(this._t('eco_alert'));
      const al = r.getElementById('tpalert'); al.textContent = alerts.join(' · '); al.classList.toggle('on', alerts.length > 0);

      // tuiles : période et prix en cours (prix par couleur et par période, si renseignés)
      const price = Number(c[`price_${today}_${hc ? 'hc' : 'hp'}`]);
      const tiles = [];
      tiles.push(['mdi:clock-outline', this._t('period'), this._t(hc ? 'hc' : 'hp'), '', c.entity_offpeak]);
      if (isFinite(price) && price > 0) tiles.push(['mdi:cash', this._t('price'), this._fmt(price, 4), `${c.currency || '€'}/kWh`, null]);
      if (c.entity_price) { const s = this._st(c.entity_price); tiles.push(['mdi:cash', this._t('price'), s ? s.state : '--', (s && s.attributes.unit_of_measurement) || '', c.entity_price]); }
      const tl = r.getElementById('tptiles');
      tl.style.display = c.show_tiles === false ? 'none' : '';
      tl.replaceChildren(...tiles.map(([ic, l, v, u, id]) => {
        const d = document.createElement('div'); d.className = 'tile';
        d.innerHTML = `<div class="l"><ha-icon icon="${esc(ic)}"></ha-icon><span></span></div><div class="v"><b></b><small></small></div>`;
        d.querySelector('.l span').textContent = l; d.querySelector('.v b').textContent = v; d.querySelector('.v small').textContent = u;
        d.querySelector('.v b').style.fontWeight = 'inherit';
        if (id) d.addEventListener('click', () => this._more(id));
        return d;
      }));
    }
  }
  customElements.define(TAG, TempoCard);

  /* ---- éditeur visuel ---- */
  class TempoCardEditor extends HTMLElement {
    setConfig(c) { this._c = c; this._draw(); }
    set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
    _draw() {
      if (!this._form) {
        this._form = document.createElement('ha-form');
        this._form.addEventListener('value-changed', (e) => {
          this._c = e.detail.value;
          this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._c }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      const ent = (name, domain) => ({ name, selector: { entity: domain ? { domain } : {} } });
      const price = (name) => ({ name, selector: { number: { min: 0, step: 0.0001, mode: 'box' } } });
      const bool = (name) => ({ name, selector: { boolean: {} }, default: true });
      this._form.hass = this._hass;
      this._form.data = this._c;
      this._form.schema = [
        { name: 'name', selector: { text: {} } },
        ent('entity_today', 'sensor'), ent('entity_tomorrow', 'sensor'), ent('entity_offpeak', 'binary_sensor'),
        { name: 'off_peak', selector: { text: {} } },
        { type: 'grid', name: '', schema: [ent('entity_red_left', 'sensor'), ent('entity_white_left', 'sensor'), ent('entity_blue_left', 'sensor')] },
        { type: 'grid', name: '', schema: [ent('entity_ecowatt_today', 'sensor'), ent('entity_ecowatt_tomorrow', 'sensor'), ent('entity_ecowatt_day2', 'sensor')] },
        { type: 'grid', name: '', schema: [price('price_blue_hp'), price('price_blue_hc'), price('price_white_hp'), price('price_white_hc'), price('price_red_hp'), price('price_red_hc')] },
        ent('entity_price', 'sensor'),
        { name: 'language', selector: { select: { options: [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }] } } },
        { type: 'grid', name: '', schema: [bool('show_status'), bool('show_season'), bool('show_ecowatt'), bool('show_tiles'), bool('animations')] },
      ];
      this._form.computeLabel = (s) => s.name;
    }
  }
  customElements.define(TAG + '-editor', TempoCardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: TAG, name: 'Tempo (EDF) + Ecowatt',
    description: 'Couleur Tempo du jour et du lendemain animée, heures creuses, jours restants et signal Ecowatt.', preview: true,
    documentationURL: 'https://github.com/skyrotter/ha-tempo-card',
  });
  console.info(`%c TEMPO-CARD %c v${VERSION} `, 'color:#fff;background:#e53935;font-weight:700;border-radius:3px 0 0 3px', 'color:#1e6fd9;background:#fff;font-weight:700;border-radius:0 3px 3px 0');
})();
