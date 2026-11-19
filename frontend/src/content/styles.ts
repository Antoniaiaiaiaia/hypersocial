// Matches Hyperliquid's dark trade page. Values sampled from app.hyperliquid.xyz (2026-11-19).
export const C = {
  bg: '#0f1a1f',
  bg2: '#1b2429',
  line: '#273035',
  text: '#f6fefd',
  text2: '#d2dad7',
  muted: '#949e9c',
  long: '#50d2c1',
  longBg: 'rgba(80,210,193,.14)',
  short: '#ed7088',
  shortBg: 'rgba(237,112,136,.14)',
  view: '#8aa4ff',
  viewBg: 'rgba(138,164,255,.14)',
};

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { position: fixed; inset: 0; pointer-events: none; font: 12px/1.35 OurFont, system-ui, "Segoe UI", Roboto, sans-serif; color: ${C.text2}; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }

/* ---------- pins ---------- */
.pins { position: absolute; inset: 0; overflow: hidden; }
.pin-dot { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; border: 1.5px solid ${C.bg}; }
.stem { position: absolute; width: 1px; }
.pin { position: absolute; display: flex; align-items: center; gap: 6px; pointer-events: auto; cursor: pointer; transform: translate(-13px, -13px); }
.pin.left { flex-direction: row-reverse; transform: translate(calc(-100% + 13px), -13px); }
.av { width: 26px; height: 26px; border-radius: 50%; border: 2px solid currentColor; background: ${C.bg2}; object-fit: cover; flex: none; display: grid; place-items: center; font-size: 10px; font-weight: 600; color: ${C.text}; overflow: hidden; }
.av img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lab { background: rgba(15,26,31,.92); border: 1px solid currentColor; border-radius: 4px; padding: 2px 6px; white-space: nowrap; line-height: 1.25; }
.lab b { display: block; color: ${C.text}; font-weight: 500; font-size: 11.5px; }
.lab span { font-size: 11px; }
.cnt { position: absolute; right: -6px; top: -6px; min-width: 15px; height: 15px; border-radius: 8px; padding: 0 3px; font-size: 9.5px; font-weight: 700; line-height: 15px; text-align: center; color: ${C.bg}; }
.pin.nolab .lab { display: none; }
.pin:hover { z-index: 5; }
.pin:hover .lab { display: block; }
.pin.hi .av { box-shadow: 0 0 0 4px rgba(255,255,255,.18); }
.long { color: ${C.long}; } .short { color: ${C.short}; } .view { color: ${C.view}; }
.bg-long { background: ${C.long}; } .bg-short { background: ${C.short}; } .bg-view { background: ${C.view}; }

.tip { position: absolute; width: 280px; background: ${C.bg}; border: 1px solid ${C.line}; border-radius: 8px; padding: 10px 12px; box-shadow: 0 8px 28px rgba(0,0,0,.45); pointer-events: none; z-index: 10; }

/* ---------- panel ---------- */
.panel { position: absolute; background: ${C.bg}; pointer-events: auto; display: flex; flex-direction: column; overflow: hidden; }
.ph { padding: 8px 8px 0; display: flex; flex-direction: column; gap: 8px; }
.seg { display: flex; gap: 2px; background: ${C.bg2}; border-radius: 6px; padding: 2px; align-self: flex-start; }
.seg button { padding: 3px 10px; border-radius: 4px; color: ${C.muted}; }
.seg button.on { background: ${C.line}; color: ${C.text}; }
.row { display: flex; align-items: center; gap: 8px; }
.sp { flex: 1; }
.src { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: ${C.muted}; border: 1px solid ${C.line}; border-radius: 3px; padding: 1px 5px; }
.sum { background: ${C.bg2}; border-radius: 6px; padding: 10px 12px; }
.sum .k { color: ${C.muted}; font-size: 11px; }
.sum .big { font-size: 20px; color: ${C.long}; margin-top: 2px; }
.sum .big.bear { color: ${C.short}; }
.sum .big small { font-size: 12px; color: ${C.muted}; margin-left: 6px; }
.bar { height: 3px; border-radius: 2px; background: ${C.short}; margin-top: 8px; overflow: hidden; }
.bar i { display: block; height: 100%; background: ${C.long}; }
.chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip { border: 1px solid ${C.line}; border-radius: 999px; padding: 2px 9px; color: ${C.text2}; }
.chip.on { background: ${C.line}; color: ${C.text}; }
.list { flex: 1; overflow-y: auto; padding: 6px 8px 8px; scrollbar-width: thin; scrollbar-color: ${C.line} transparent; }
.card { border: 1px solid transparent; border-radius: 6px; padding: 8px 8px 10px; }
.card + .card { border-top-color: ${C.line}; border-top-left-radius: 0; border-top-right-radius: 0; }
.card.hi { border-color: ${C.long}55; background: ${C.bg2}; }
.card .who { display: flex; gap: 8px; align-items: center; }
.card .who .av { width: 28px; height: 28px; border-width: 0; }
.card .nm { color: ${C.text}; font-weight: 500; font-size: 13px; }
.card .hd { color: ${C.muted}; font-size: 11px; }
.card .t { color: ${C.muted}; font-size: 11px; margin-left: auto; align-self: flex-start; }
.card q { display: block; margin: 6px 0 8px; color: ${C.text2}; font-size: 12.5px; quotes: "“" "”"; }
.card .media { display: block; width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px; margin-bottom: 8px; border: 1px solid ${C.line}; }
.badge { font-size: 10px; font-weight: 600; letter-spacing: .05em; padding: 1px 5px; border-radius: 3px; border: 1px solid currentColor; }
.foot { display: flex; align-items: center; gap: 8px; }
.foot .px { color: ${C.text2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn { border: 1px solid ${C.line}; border-radius: 4px; padding: 2px 8px; color: ${C.text2}; margin-left: auto; white-space: nowrap; }
.btn:hover { border-color: ${C.long}; color: ${C.long}; }
.by { text-align: center; color: ${C.muted}; font-size: 11px; padding: 6px 0 8px; border-top: 1px solid ${C.line}; }
.by b { color: ${C.text2}; font-weight: 600; }
.covnote { font-size: 11px; color: ${C.view}; }
.pstat { font-size: 11px; color: ${C.muted}; min-height: 14px; }
.empty { color: ${C.muted}; text-align: center; padding: 28px 12px; }
.err { color: ${C.short}; }

/* ---------- analytics ---------- */
.ana { position: absolute; background: ${C.bg}; pointer-events: auto; display: grid; grid-template-columns: 1fr 1.6fr 1fr 1.1fr; overflow: auto; }
.ana section { padding: 10px 14px; border-right: 1px solid ${C.line}; min-width: 0; }
.ana section:last-child { border-right: 0; }
.ana h4 { margin: 0 0 6px; font-size: 11px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: ${C.muted}; display: flex; gap: 8px; }
.ana .big { font-size: 24px; color: ${C.long}; }
.ana .big.bear { color: ${C.short}; }
.ana .big small { font-size: 12px; color: ${C.muted}; margin-left: 6px; }
.ana .note { color: ${C.text2}; margin-top: 10px; }
.ana .kv { display: flex; justify-content: space-between; margin-top: 10px; }
.ana .sub { color: ${C.muted}; font-size: 11px; display: flex; justify-content: space-between; }
.ana .pnl { font-size: 15px; }
.ana .tr { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.ana .tr .av { width: 22px; height: 22px; border-width: 0; }
.ana .tr .nm { color: ${C.text}; font-size: 12px; line-height: 1.1; }
.ana .tr .hd { color: ${C.muted}; font-size: 10.5px; }
.ana .tr .r { margin-left: auto; text-align: right; }
.ana svg text { font: 10px OurFont, system-ui, sans-serif; fill: ${C.muted}; }
.legend { margin-left: auto; text-transform: none; letter-spacing: 0; display: flex; gap: 8px; }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
`;
