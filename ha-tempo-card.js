/*!
 * HA Tempo Card — carte Lovelace animée pour l'offre Tempo d'EDF et le signal Ecowatt de RTE
 * type: custom:tempo-card
 * MIT License
 */
/* Compteur Linky : l'écran fait défiler couleur du jour, période HP / HC (et prix), lendemain, jours rouges
 * restants ; trois voyants Tempo dont celui du jour brille ; voyants HP / HC ; LED de consommation.
 * Boîtier « demain » : chenillard tant que RTE n'a pas publié, puis la lampe du lendemain s'allume.
 * Ecowatt : trois barres J, J+1, J+2 (vert, orange, rouge) qui clignotent quand le réseau est tendu.
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
      red_tomorrow: 'Demain : jour ROUGE', red_now: 'Jour rouge en heures pleines', red_left: 'Rouges', white_left: 'Blancs', blue_left: 'Bleus', waiting: 'En attente',
    },
    en: {
      name: 'Tempo', today: 'Today', tomorrow: 'Tomorrow', blue: 'Blue', white: 'White', red: 'Red', unknown: 'Unknown',
      hp: 'Peak hours', hc: 'Off-peak hours', period: 'Period', price: 'Price', left: 'left', season: 'Season',
      ecowatt: 'Ecowatt', eco_ok: 'Normal', eco_warn: 'Strained', eco_cut: 'Outages', eco_alert: 'Ecowatt: power grid under strain',
      red_tomorrow: 'Tomorrow: RED day', red_now: 'Red day, peak hours', red_left: 'Red', white_left: 'White', blue_left: 'Blue', waiting: 'Waiting',
    },
  };
  // jours par saison Tempo (1er septembre → 31 août) : 22 rouges, 43 blancs, le reste en bleu
  const TOTAL = { red: 22, white: 43, blue: 300 };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); // texte → HTML sûr

  const CSS = `
:host{display:block}
ha-card{display:block;padding:10px 12px 12px;overflow:hidden;--tp-blue:#2f7bf0;--tp-white:#f5f7fa;--tp-red:#ff3b30;--tp-unk:#6b7480;
  --eco-ok:#34c759;--eco-warn:#ff9f0a;--eco-cut:#ff3b30}
.head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.title{font-size:14px;font-weight:500;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:var(--secondary-background-color);color:var(--secondary-text-color);white-space:nowrap}
.d-blue .badge{background:color-mix(in srgb,var(--tp-blue) 22%,transparent);color:#6aa7ff}
.d-white .badge{background:color-mix(in srgb,#cfd6dd 22%,transparent);color:var(--primary-text-color)}
.d-red .badge{background:color-mix(in srgb,var(--tp-red) 22%,transparent);color:var(--tp-red)}
.alert{display:none;margin-top:4px;font-size:11px;color:var(--tp-red);font-weight:600;text-align:center}
.alert.on{display:block}
svg{display:block;width:100%;max-width:300px;height:auto;margin:2px auto 0;overflow:visible;cursor:pointer}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:6px;margin-top:6px}
.tile{box-sizing:border-box;background:var(--secondary-background-color);border-radius:10px;padding:5px 7px;min-width:0;overflow:hidden;text-align:center;cursor:pointer}
.tile .l{display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;line-height:14px;color:var(--secondary-text-color);min-width:0}
.tile .l span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tile .l ha-icon{--mdc-icon-size:13px;flex:none}
.tile .v{font-size:14px;line-height:18px;font-weight:600;color:var(--primary-text-color);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .v small{font-size:10px;font-weight:400;color:var(--secondary-text-color);margin-left:2px}
.tile .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:1px}

/* ---- compteur : écran LCD qui fait défiler ses pages, comme un vrai Linky ---- */
.lcd{font:700 13px/1 ui-monospace,"DejaVu Sans Mono",Menlo,monospace;fill:#a8ff9e;letter-spacing:.5px;text-anchor:middle;filter:drop-shadow(0 0 2px rgba(140,255,130,.6))}
.lcds{font:600 6.5px/1 ui-monospace,"DejaVu Sans Mono",Menlo,monospace;fill:#7fd477;letter-spacing:1px;text-anchor:middle;opacity:.9}
.page{opacity:0;transition:opacity .45s}
.page.on{opacity:1}
.d-red.hp .lcdbg{fill:#2d1714}.d-red.hp .lcd,.d-red.hp .lcds{fill:#ff8f85;filter:drop-shadow(0 0 2px rgba(255,90,80,.6))}
/* LED de consommation : clignote comme sur le compteur */
.conso{fill:#ffcf3a;animation:tpled 1.1s steps(2) infinite}
/* voyants Tempo du jour : éteints sauf la couleur du jour, qui brille et respire */
.lamp{transition:fill .5s}
.lamp.dim{fill:#3b4249}
.glow{opacity:0;transform-box:fill-box;transform-origin:center}
.lit .glow{opacity:.55;animation:tpglow 2.4s ease-in-out infinite}
.d-red .lit .glow{animation-duration:1.1s}
@keyframes tpglow{50%{opacity:.15;transform:scale(1.35)}}
.hpl{fill:#3b4249}.hp .hpl.p,.hc .hpl.c{fill:#ffd23a;filter:drop-shadow(0 0 2px #ffd23a)}
.hc .hpl.c{fill:#7fc8ff;filter:drop-shadow(0 0 2px #7fc8ff)}
/* boîtier « demain » : chenillard tant que RTE n'a pas publié, puis la lampe s'allume */
.t-unknown .tl{animation:tpchase 1.5s steps(1) infinite}
.t-unknown .tl:nth-of-type(2){animation-delay:.5s}.t-unknown .tl:nth-of-type(3){animation-delay:1s}
@keyframes tpchase{0%{opacity:1}33%,100%{opacity:.18}}
.tl.off{opacity:.18}
.tl.on{animation:tpon .9s ease-out}
@keyframes tpon{0%{opacity:.18}20%{opacity:1}35%{opacity:.4}55%,100%{opacity:1}}
.t-red .tbox{filter:drop-shadow(0 0 6px rgba(255,59,48,.55))}
.ttxt{font:700 7.5px/1 var(--paper-font-body1_-_font-family,Roboto,sans-serif);fill:#4a525a;text-anchor:middle;letter-spacing:.8px}
/* Ecowatt : barres façon signal, clignotent si le réseau est tendu */
.eb.l2{animation:tpled 1.4s steps(2) infinite}.eb.l3{animation:tpled .7s steps(2) infinite}
.elab{font:600 6.5px/1 var(--paper-font-body1_-_font-family,Roboto,sans-serif);fill:#9aa3ad;text-anchor:middle}
.noeco .ecog{display:none}
@keyframes tpled{50%{opacity:.35}}
/* électricité qui arrive : impulsions à la couleur du jour, plus rapides en heures pleines */
.pulse{fill:none;stroke:var(--pulse,#ffd23a);stroke-width:3;stroke-linecap:round;stroke-dasharray:7 30;filter:drop-shadow(0 0 3px var(--pulse,#ffd23a));animation:tppulse .9s linear infinite}
.hc .pulse{animation-duration:1.8s}
@keyframes tppulse{from{stroke-dashoffset:37}to{stroke-dashoffset:0}}
.spark{fill:var(--pulse,#ffd23a);opacity:0;filter:blur(4px);animation:tpspark .9s ease-out infinite}
.spark{filter:blur(3px)}
.hc .spark{animation-duration:1.8s}
@keyframes tpspark{0%,60%{opacity:0}75%{opacity:.45}100%{opacity:0}}
.d-blue{--pulse:#5ea2ff}.d-white{--pulse:#ffffff}.d-red{--pulse:#ff4d40}
.noanim *{animation:none!important}
`;

  const SVG = () => `
<svg viewBox="0 0 300 222" role="img">
 <defs>
  <linearGradient id="tplinky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7ea5a"/><stop offset=".55" stop-color="#bcd535"/><stop offset="1" stop-color="#9db526"/></linearGradient>
  <linearGradient id="tpcover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e7ea"/><stop offset="1" stop-color="#b9c0c6"/></linearGradient>
  <linearGradient id="tpbox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe4e8"/></linearGradient>
  <linearGradient id="tplcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b26"/><stop offset="1" stop-color="#11261a"/></linearGradient>
  <radialGradient id="tpshine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient>
 </defs>
 <ellipse cx="240" cy="182" rx="60" ry="5" fill="#000" opacity=".3"/>
 <!-- câbles d'arrivée -->
 <path d="M58 168 V222 M82 168 V222 M106 168 V222" stroke="#2a2d31" stroke-width="5" stroke-linecap="round"/>
 <path d="M70 168 V222 M94 168 V222" stroke="#5a4636" stroke-width="5" stroke-linecap="round"/>
 <path class="pulse" d="M58 223 V166" style="animation-delay:-0s"/><path class="pulse" d="M70 223 V166" style="animation-delay:-0.45s"/><path class="pulse" d="M82 223 V166" style="animation-delay:-0.2s"/><path class="pulse" d="M94 223 V166" style="animation-delay:-0.7s"/><path class="pulse" d="M106 223 V166" style="animation-delay:-0.35s"/>
 <ellipse class="spark" cx="82" cy="170" rx="40" ry="6"/>
 <rect x="31.0" y="1.7" width="140" height="156" rx="16" fill="#7d9318"/><rect x="30.0" y="2.4" width="140" height="156" rx="16" fill="#7d9318"/><rect x="29.0" y="3.1" width="140" height="156" rx="16" fill="#7d9318"/><rect x="28.0" y="3.8" width="140" height="156" rx="16" fill="#7d9318"/><rect x="27.0" y="4.5" width="140" height="156" rx="16" fill="#7d9318"/><rect x="26.0" y="5.2" width="140" height="156" rx="16" fill="#7d9318"/><rect x="25.0" y="5.9" width="140" height="156" rx="16" fill="#7d9318"/><rect x="24.0" y="6.6" width="140" height="156" rx="16" fill="#7d9318"/><rect x="23.0" y="7.3" width="140" height="156" rx="16" fill="#7d9318"/>
 <rect x="22" y="8" width="140" height="156" rx="16" fill="url(#tplinky)" stroke="#8aa01e" stroke-width="1.2"/>
 <path d="M30 12 H154" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".45"/>
 <text x="38" y="27" style="font:italic 800 10px var(--paper-font-body1_-_font-family,Roboto,sans-serif);fill:#5f7414">linky</text>
 <circle class="conso" cx="146" cy="23" r="3"/>
 <!-- écran -->
 <rect x="34" y="34" width="116" height="46" rx="7" fill="#3a4a1c"/><rect x="34.6" y="34.8" width="116" height="46" rx="7" fill="none" stroke="#e8f39a" stroke-width="1" opacity=".5"/>
 <rect class="lcdbg" x="38" y="38" width="108" height="38" rx="4" fill="url(#tplcd)"/>
 <rect x="38" y="38" width="108" height="5" rx="2" fill="#000" opacity=".35"/><path d="M48 76 L60 38 H74 L62 76 Z" fill="#fff" opacity=".05"/>
 <g id="tppages"></g>
 <!-- boutons -->
 <circle cx="77" cy="94" r="6.5" fill="#4a561a"/><circle cx="76" cy="92" r="6.5" fill="#55621f"/><circle cx="76" cy="91" r="5.5" fill="#6d7d28"/><path d="M73 91 H79" stroke="#e6efb8" stroke-width="1.4"/>
 <circle cx="109" cy="94" r="6.5" fill="#4a561a"/><circle cx="108" cy="92" r="6.5" fill="#55621f"/><circle cx="108" cy="91" r="5.5" fill="#6d7d28"/><path d="M105 91 H111 M108 88 V94" stroke="#e6efb8" stroke-width="1.4"/>
 <!-- voyants Tempo du jour -->
 <rect x="34" y="104" width="116" height="40" rx="8" fill="#2a3036" opacity=".92"/><rect x="34" y="104" width="116" height="4" rx="2" fill="#000" opacity=".4"/>
 <g id="tplamps"></g>
 <g style="font:600 6px var(--paper-font-body1_-_font-family,Roboto,sans-serif);text-anchor:middle;fill:#c9d0d6">
  <text x="56" y="140">BLEU</text><text x="92" y="140">BLANC</text><text x="128" y="140">ROUGE</text></g>
 <!-- HP / HC -->
 <rect class="hpl p" x="44" y="148" width="20" height="6" rx="3"/><rect class="hpl c" x="120" y="148" width="20" height="6" rx="3"/>
 <g style="font:700 6px var(--paper-font-body1_-_font-family,Roboto,sans-serif);fill:#4d5f12"><text x="68" y="154">HP</text><text x="108" y="154">HC</text></g>
 <!-- cache-bornes -->
 <rect x="45.0" y="156.5" width="104" height="14" rx="4" fill="#8d959c"/><rect x="44.0" y="157.2" width="104" height="14" rx="4" fill="#8d959c"/><rect x="43.0" y="157.9" width="104" height="14" rx="4" fill="#8d959c"/><rect x="42.0" y="158.6" width="104" height="14" rx="4" fill="#8d959c"/><rect x="41.0" y="159.3" width="104" height="14" rx="4" fill="#8d959c"/><rect x="40" y="160" width="104" height="14" rx="4" fill="url(#tpcover)" stroke="#9aa3aa" stroke-width=".8"/>
 <circle cx="50" cy="167" r="2" fill="#8a9298"/><circle cx="134" cy="167" r="2" fill="#8a9298"/>
 <!-- boîtier de voyants « demain » -->
 <g class="tbox">
  <rect x="189.0" y="3.1" width="102" height="92" rx="10" fill="#aeb6bd"/><rect x="188.0" y="3.8" width="102" height="92" rx="10" fill="#aeb6bd"/><rect x="187.0" y="4.5" width="102" height="92" rx="10" fill="#aeb6bd"/><rect x="186.0" y="5.2" width="102" height="92" rx="10" fill="#aeb6bd"/><rect x="185.0" y="5.9" width="102" height="92" rx="10" fill="#aeb6bd"/><rect x="184.0" y="6.6" width="102" height="92" rx="10" fill="#aeb6bd"/><rect x="183.0" y="7.3" width="102" height="92" rx="10" fill="#aeb6bd"/>
  <rect x="182" y="8" width="102" height="92" rx="10" fill="url(#tpbox)" stroke="#b9c1c8"/>
  <path d="M190 12 H276" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <text class="ttxt" id="tptitle2" x="233" y="25">DEMAIN</text>
  <g id="tptmr"></g>
  <rect x="196" y="72" width="74" height="16" rx="8" fill="#eef1f4" stroke="#d3d9de"/>
  <text id="tptmrtxt" x="233" y="83" style="font:700 8px var(--paper-font-body1_-_font-family,Roboto,sans-serif);text-anchor:middle;fill:#3a4148">--</text>
 </g>
 <!-- Ecowatt -->
 <g class="ecog">
  <rect x="189.0" y="103.1" width="102" height="66" rx="10" fill="#0c0f12"/><rect x="188.0" y="103.8" width="102" height="66" rx="10" fill="#0c0f12"/><rect x="187.0" y="104.5" width="102" height="66" rx="10" fill="#0c0f12"/><rect x="186.0" y="105.2" width="102" height="66" rx="10" fill="#0c0f12"/><rect x="185.0" y="105.9" width="102" height="66" rx="10" fill="#0c0f12"/><rect x="184.0" y="106.6" width="102" height="66" rx="10" fill="#0c0f12"/><rect x="183.0" y="107.3" width="102" height="66" rx="10" fill="#0c0f12"/>
  <rect x="182" y="108" width="102" height="66" rx="10" fill="#1e2328" stroke="#3a4148"/>
  <path d="M200 115 l-6 10 h5 l-3 8 l9 -12 h-5 l3 -6 z" fill="#ffd23a"/>
  <text x="248" y="124" style="font:700 7.5px var(--paper-font-body1_-_font-family,Roboto,sans-serif);fill:#c9d0d6;text-anchor:middle;letter-spacing:.8px">ECOWATT</text>
  <g id="tpeco"></g>
 </g>
</svg>`;

  const COL = { blue: 'var(--tp-blue)', white: 'var(--tp-white)', red: 'var(--tp-red)', unknown: 'var(--tp-unk)' };
  const ECO = ['var(--eco-ok)', 'var(--eco-ok)', 'var(--eco-warn)', 'var(--eco-cut)'];
  const lamp = (cx, cy, r, col, cls) => `<g class="${cls}">
    <circle cx="${cx}" cy="${cy}" r="${r + 2.2}" fill="#9aa3aa"/><circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#5b636b"/>
    <circle class="glow" cx="${cx}" cy="${cy}" r="${r + 4}" fill="${col}"/>
    <circle class="lamp${/lit|on/.test(cls) ? '' : ' dim'}" cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#tpshine)"/></g>`;

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

    connectedCallback() { this._timer = setInterval(() => this._nextPage(), 2800); }
    disconnectedCallback() { clearInterval(this._timer); }
    // l'écran du compteur fait défiler ses pages
    _nextPage() {
      if (!this._built) return;
      const pages = this._root.querySelectorAll('.page'); if (!pages.length) return;
      this._page = ((this._page || 0) + 1) % pages.length;
      pages.forEach((el, i) => el.classList.toggle('on', i === this._page));
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
      r.querySelector('svg').setAttribute('viewBox', '0 0 300 222');

      r.getElementById('tptitle').textContent = c.name || this._t('name');
      const badge = r.getElementById('tpbadge');
      badge.textContent = `${this._t(today)} · ${this._t(hc ? 'hc' : 'hp')}`; badge.style.display = c.show_status === false ? 'none' : '';

      // voyants du jour sur le compteur
      r.getElementById('tplamps').innerHTML = ['blue', 'white', 'red'].map((k, i) => lamp(56 + i * 36, 120, 8, COL[k], k === today ? 'lit' : '')).join('');

      // prix en cours et jours restants
      const price = Number(c[`price_${today}_${hc ? 'hc' : 'hp'}`]);
      const left = { red: this._num(c.entity_red_left), white: this._num(c.entity_white_left), blue: this._num(c.entity_blue_left) };
      const up = (k) => this._t(k).toUpperCase();
      // pages de l'écran : couleur du jour, période (et prix), demain, jours rouges restants
      const pages = [
        ['TEMPO', up(today)],
        [this._t('period').toUpperCase(), (hc ? 'HC' : 'HP') + (isFinite(price) && price > 0 ? ` ${this._fmt(price, 4)}` : '')],
        [this._t('tomorrow').toUpperCase(), tmr === 'unknown' ? '- - ? - -' : up(tmr)],
      ];
      if (!isNaN(left.red)) pages.push([this._t('red_left').toUpperCase(), `${Math.round(left.red)}/${TOTAL.red}`]);
      const pg = r.getElementById('tppages');
      if (this._page === undefined || this._page >= pages.length) this._page = 0;
      pg.replaceChildren(...pages.map(([l, v], i) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `page${i === this._page ? ' on' : ''}`);
        g.innerHTML = '<text class="lcds" x="92" y="50"></text><text class="lcd" x="92" y="68"></text>';
        g.firstChild.textContent = l; g.lastChild.textContent = v;
        return g;
      }));

      // boîtier « demain » : trois lampes, celle du lendemain s'allume à la publication
      const changed = this._lastTmr !== undefined && this._lastTmr !== tmr;
      r.getElementById('tptmr').innerHTML = ['blue', 'white', 'red'].map((k, i) =>
        lamp(206 + i * 27, 49, 9, COL[k], `tl ${tmr === 'unknown' ? '' : k === tmr ? (changed ? 'on lit' : 'lit') : 'off'}`)).join('');
      this._lastTmr = tmr;
      r.getElementById('tptitle2').textContent = this._t('tomorrow').toUpperCase();
      const tt = r.getElementById('tptmrtxt');
      tt.textContent = tmr === 'unknown' ? this._t('waiting') : this._t(tmr);
      tt.style.fill = tmr === 'red' ? '#d62d22' : tmr === 'blue' ? '#1f63c9' : '#3a4148';

      // Ecowatt : trois barres façon signal (J, J+1, J+2)
      r.getElementById('tpeco').innerHTML = hasEco ? eco.map((lv, i) => {
        const x = 214 + i * 22, h = lv === null || lv === undefined ? 6 : [10, 10, 18, 26][lv];
        const col = lv === null || lv === undefined ? '#4a525a' : ECO[lv];
        return `<rect class="eb l${lv ?? 'x'}" x="${x}" y="${160 - h}" width="14" height="${h}" rx="3" fill="${col}"/>
          <text class="elab" x="${x + 7}" y="169">${esc(['J', 'J+1', 'J+2'][i])}</text>`;
      }).join('') : '';

      // alertes
      const alerts = [];
      if (tmr === 'red') alerts.push(this._t('red_tomorrow'));
      else if (today === 'red' && !hc) alerts.push(this._t('red_now'));
      if (hasEco && eco.slice(0, 2).some((x) => x >= 2)) alerts.push(this._t('eco_alert'));
      const al = r.getElementById('tpalert'); al.textContent = alerts.join(' · '); al.classList.toggle('on', alerts.length > 0);

      // tuiles : prix en cours, jours restants par couleur
      // (la période HP / HC est déjà sur le badge et les voyants du compteur)
      const tiles = [];
      if (isFinite(price) && price > 0) tiles.push(['mdi:cash', this._t('price'), this._fmt(price, 4), `${c.currency || '€'}/kWh`, null, null]);
      if (c.entity_price) { const s = this._st(c.entity_price); tiles.push(['mdi:cash', this._t('price'), s ? s.state : '--', (s && s.attributes.unit_of_measurement) || '', c.entity_price, null]); }
      if (c.show_season !== false) ['red', 'white', 'blue'].forEach((k) => {
        if (!isNaN(left[k])) tiles.push([null, this._t(k + '_left'), String(Math.round(left[k])), `/ ${TOTAL[k]}`, c[`entity_${k}_left`], COL[k]]);
      });
      const tl = r.getElementById('tptiles');
      tl.style.display = c.show_tiles === false ? 'none' : '';
      tl.replaceChildren(...tiles.map(([ic, l, v, u, id, dot]) => {
        const d = document.createElement('div'); d.className = 'tile';
        d.innerHTML = `<div class="l">${ic ? `<ha-icon icon="${esc(ic)}"></ha-icon>` : '<i class="dot"></i>'}<span></span></div><div class="v"><b></b><small></small></div>`;
        if (dot) { const i = d.querySelector('.dot'); i.style.background = dot; if (dot === COL.white) i.style.boxShadow = 'inset 0 0 0 1px #9aa3aa'; }
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
