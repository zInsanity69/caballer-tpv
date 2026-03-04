import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './hooks/useAuth.js'
import { useCaja } from './hooks/useCaja.js'
import { api } from './lib/api.js'

// ── Utilidades ───────────────────────────────────────────────
const fmt = n => Number(n).toFixed(2).replace('.', ',') + ' €'
const getNow = () => new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })

function calcularPrecio(productoId, cantidad, precioBase, ofertas) {
  const ofertasP = (ofertas || [])
    .filter(o => o.producto_id === productoId && o.activa !== false)
    .sort((a, b) => b.cantidad_pack - a.cantidad_pack)

  if (!ofertasP.length) return { total: precioBase * cantidad, desglose: null }

  let restante = cantidad, total = 0, desglose = []
  for (const o of ofertasP) {
    if (restante <= 0) break
    const n = Math.floor(restante / o.cantidad_pack)
    if (n > 0) {
      total += n * o.precio_pack
      desglose.push({ tipo: 'pack', etiqueta: o.etiqueta, packs: n, unidades: n * o.cantidad_pack, coste: n * o.precio_pack, precioU: o.precio_pack / o.cantidad_pack })
      restante -= n * o.cantidad_pack
    }
  }
  if (restante > 0) {
    total += restante * precioBase
    desglose.push({ tipo: 'normal', etiqueta: 'Precio normal', packs: null, unidades: restante, coste: restante * precioBase, precioU: precioBase })
  }
  return { total, desglose: desglose.some(d => d.tipo === 'pack') ? desglose : null }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880; o.type = 'sine'
    g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2)
  } catch(e) {}
}

// ── Estilos globales ─────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0f;--s1:#13131a;--s2:#1c1c27;--s3:#252535;--s4:#2e2e42;
  --ac:#ff4d1c;--ac2:#ff8c42;--gold:#f5c518;--green:#22c55e;
  --blue:#3b82f6;--red:#ef4444;--purple:#a855f7;--cyan:#06b6d4;
  --tx:#f0f0f5;--tx2:#8888a8;--tx3:#5555708;
  --bd:rgba(255,255,255,.07);--bd2:rgba(255,255,255,.12);
  --r:14px;--rs:9px;--shadow:0 4px 24px rgba(0,0,0,.4);
}
html,body,#root{height:100%}
body{background:var(--bg);color:var(--tx);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
button{font-family:'DM Sans',sans-serif;cursor:pointer}
input,select{font-family:'DM Sans',sans-serif}

/* SCROLLBAR */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--s4);border-radius:2px}

/* LOADING */
.loading-screen{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--bg)}
.loading-logo{font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--ac);letter-spacing:3px}
.loading-spin{width:32px;height:32px;border:3px solid var(--s3);border-top-color:var(--ac);border-radius:50%;animation:spin .8s linear infinite}

/* LOGIN */
.login-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(255,77,28,.18) 0%,transparent 70%),var(--bg)}
.login-card{width:100%;max-width:400px;background:var(--s1);border:1px solid var(--bd2);border-radius:20px;padding:40px 36px}
.login-logo{font-family:'Bebas Neue',sans-serif;font-size:2.8rem;color:var(--ac);letter-spacing:3px;text-align:center;line-height:1}
.login-sub{text-align:center;color:var(--tx2);font-size:.8rem;margin:6px 0 32px;letter-spacing:.5px;text-transform:uppercase}
.login-title{font-size:1.2rem;font-weight:700;text-align:center;margin-bottom:24px}
.fg{margin-bottom:16px}
.fg label{display:block;font-size:.72rem;font-weight:700;color:var(--tx2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px}
.inp{width:100%;background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);padding:12px 15px;color:var(--tx);font-size:.95rem;outline:none;transition:border-color .2s,box-shadow .2s}
.inp:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(255,77,28,.12)}
.inp::placeholder{color:var(--tx2)}
select.inp option{background:var(--s2)}
.btn{display:block;width:100%;background:var(--ac);color:#fff;border:none;border-radius:var(--rs);padding:13px 20px;font-size:.95rem;font-weight:700;letter-spacing:.3px;transition:all .2s;margin-top:8px}
.btn:hover{background:#ff6535;transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,77,28,.35)}
.btn:active{transform:translateY(0)}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
.btn-ghost{background:transparent;border:1.5px solid var(--bd2);color:var(--tx2);border-radius:var(--rs);padding:8px 16px;font-size:.8rem;font-weight:600;transition:all .2s}
.btn-ghost:hover{border-color:var(--tx2);color:var(--tx)}
.btn-ghost.danger:hover{border-color:var(--red);color:var(--red)}
.btn-ghost.success:hover{border-color:var(--green);color:var(--green)}
.alert{border-radius:var(--rs);padding:11px 14px;font-size:.83rem;font-weight:500;margin-bottom:14px}
.alert-err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#f87171}
.alert-ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#4ade80}
.alert-info{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);color:#93c5fd}

/* TOPBAR */
.topbar{background:var(--s1);border-bottom:1px solid var(--bd);padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50;backdrop-filter:blur(12px)}
.topbar-logo{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:var(--ac);letter-spacing:2px}
.topbar-right{display:flex;align-items:center;gap:10px}
.badge{padding:3px 9px;border-radius:20px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.badge-admin{background:rgba(245,197,24,.12);color:var(--gold);border:1px solid rgba(245,197,24,.25)}
.badge-emp{background:rgba(59,130,246,.12);color:var(--blue);border:1px solid rgba(59,130,246,.25)}
.badge-green{background:rgba(34,197,94,.12);color:var(--green);border:1px solid rgba(34,197,94,.25)}

/* NAV */
.navtabs{background:var(--s1);border-bottom:1px solid var(--bd);padding:0 20px;display:flex;gap:0;overflow-x:auto}
.ntab{padding:12px 18px;font-size:.84rem;font-weight:600;color:var(--tx2);border:none;background:transparent;border-bottom:2px solid transparent;white-space:nowrap;transition:all .2s;letter-spacing:.2px}
.ntab.on{color:var(--ac);border-bottom-color:var(--ac)}
.ntab:hover:not(.on){color:var(--tx)}

/* CONTENT */
.page{flex:1;padding:20px;max-width:1440px;width:100%;margin:0 auto}

/* APERTURA CAJA */
.apertura-wrap{max-width:460px;margin:48px auto}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:18px;padding:32px}
.card-title{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:1px;margin-bottom:4px}
.card-sub{color:var(--tx2);font-size:.85rem;margin-bottom:24px;line-height:1.5}
.big-inp{width:100%;background:var(--s2);border:2px solid var(--bd);border-radius:var(--r);padding:18px 20px;font-size:1.9rem;font-weight:700;color:var(--tx);outline:none;transition:border-color .2s;margin-bottom:16px;text-align:center}
.big-inp:focus{border-color:var(--gold)}

/* TPV GRID */
.tpv-layout{display:flex;flex-direction:column;height:calc(100vh - 52px);overflow:hidden}
.tpv-subbar{background:var(--s1);border-bottom:1px solid var(--bd);padding:8px 18px;display:flex;align-items:center;gap:16px;font-size:.78rem;flex-wrap:wrap}
.tpv-grid{display:grid;grid-template-columns:1fr 360px;gap:0;flex:1;overflow:hidden}
@media(max-width:860px){.tpv-grid{grid-template-columns:1fr}}

/* PANEL PRODUCTOS */
.prod-panel{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--bd)}
.prod-search{padding:10px 14px;border-bottom:1px solid var(--bd);display:flex;gap:8px}
.prod-search .inp{flex:1;padding:9px 13px;font-size:.88rem}
.btn-scan{background:var(--ac);border:none;border-radius:var(--rs);padding:9px 14px;color:#fff;font-size:1.2rem;transition:all .2s;flex-shrink:0}
.btn-scan:hover{background:#ff6535}
.cat-bar{padding:8px 12px;border-bottom:1px solid var(--bd);display:flex;gap:5px;overflow-x:auto}
.cat-btn{padding:4px 12px;border-radius:20px;border:1px solid var(--bd);background:transparent;color:var(--tx2);font-size:.72rem;font-weight:600;white-space:nowrap;transition:all .15s}
.cat-btn.on{background:var(--ac);border-color:var(--ac);color:#fff}
.prod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:9px;padding:12px;overflow-y:auto;flex:1}
.prod-card{background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--rs);padding:11px 10px;position:relative;transition:all .2s;user-select:none}
.prod-card:active{transform:scale(.97)}
.prod-card.selected{border-color:var(--ac);background:rgba(255,77,28,.06)}
.prod-card.agotado{opacity:.38;pointer-events:none}
.prod-card:not(.agotado):hover{border-color:var(--ac);transform:translateY(-2px)}
.prod-name{font-size:.8rem;font-weight:600;line-height:1.3;margin-bottom:7px;min-height:30px}
.prod-price{font-size:1.05rem;font-weight:800;color:var(--ac)}
.prod-stock{font-size:.68rem;color:var(--tx2);margin-top:3px}
.prod-qty-badge{position:absolute;top:6px;left:6px;background:var(--ac);color:#fff;font-size:.65rem;font-weight:800;padding:2px 6px;border-radius:9px}
.ea-badge{position:absolute;top:6px;right:6px;font-size:.6rem;font-weight:700;padding:2px 5px;border-radius:8px}
.ea-t1{background:rgba(168,85,247,.2);color:var(--purple)}
.ea-12{background:rgba(34,197,94,.2);color:var(--green)}
.ea-16{background:rgba(59,130,246,.2);color:var(--blue)}
.ea-18{background:rgba(239,68,68,.2);color:var(--red)}
.oferta-dot{position:absolute;bottom:6px;right:6px;background:rgba(245,197,24,.15);color:var(--gold);font-size:.59rem;font-weight:700;padding:2px 5px;border-radius:6px;border:1px solid rgba(245,197,24,.25)}

/* TICKET PANEL */
.ticket-panel{display:flex;flex-direction:column;overflow:hidden;background:var(--s1)}
.ticket-head{padding:12px 16px;border-bottom:1px solid var(--bd)}
.ticket-head-title{font-family:'Bebas Neue',sans-serif;font-size:1.2rem;letter-spacing:1px}
.ticket-head-sub{font-size:.7rem;color:var(--tx2);margin-top:2px}
.ticket-items{flex:1;overflow-y:auto;padding:8px}
.ticket-empty{height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--tx2);gap:8px;font-size:.84rem}
.titem{background:var(--s2);border-radius:var(--rs);padding:9px 11px;margin-bottom:7px;display:flex;align-items:center;gap:8px}
.titem-body{flex:1;min-width:0}
.titem-name{font-size:.8rem;font-weight:600;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.titem-ctrl{display:flex;align-items:center;gap:5px}
.qty-btn{width:26px;height:26px;border-radius:50%;border:none;background:var(--s3);color:var(--tx);font-size:1rem;display:flex;align-items:center;justify-content:center;transition:background .15s}
.qty-btn:hover{background:var(--ac)}
.qty-val{min-width:24px;text-align:center;font-weight:700;font-size:.88rem}
.oferta-tag{font-size:.6rem;background:rgba(34,197,94,.15);color:var(--green);padding:2px 6px;border-radius:6px;font-weight:700;cursor:pointer}
.titem-price{margin-left:auto;text-align:right;flex-shrink:0}
.titem-price-unit{font-size:.68rem;color:var(--tx2)}
.titem-price-total{font-size:.9rem;font-weight:800;color:var(--ac)}
.del-btn{flex-shrink:0;width:30px;height:30px;border-radius:50%;border:1px solid rgba(239,68,68,.2);background:rgba(239,68,68,.08);color:var(--red);font-size:.85rem;display:flex;align-items:center;justify-content:center;transition:all .2s;align-self:center}
.del-btn:hover{background:rgba(239,68,68,.25);border-color:var(--red)}
.desglose{background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.12);border-radius:var(--rs);padding:7px 9px;margin-top:5px;font-size:.69rem}
.desglose-row{display:flex;justify-content:space-between;padding:2px 0}
.desglose-row.pack{color:var(--green)}
.desglose-row.normal{color:var(--tx2)}
.ticket-foot{border-top:1px solid var(--bd);padding:12px 16px}
.ticket-subtotal{display:flex;justify-content:space-between;font-size:.78rem;color:var(--tx2);margin-bottom:3px}
.ticket-total-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}
.ticket-total-label{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;letter-spacing:1px}
.ticket-total-amt{font-family:'Bebas Neue',sans-serif;font-size:1.9rem;color:var(--ac)}
.btn-cobrar{width:100%;background:linear-gradient(135deg,var(--ac),var(--ac2));border:none;border-radius:var(--r);padding:15px;color:#fff;font-size:1rem;font-weight:800;letter-spacing:.4px;transition:all .2s}
.btn-cobrar:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(255,77,28,.4)}
.btn-cobrar:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.btn-clear{width:100%;background:transparent;border:1px solid var(--bd);border-radius:var(--rs);padding:8px;color:var(--tx2);font-size:.78rem;font-weight:600;transition:all .2s;margin-top:6px}
.btn-clear:hover{border-color:var(--red);color:var(--red)}

/* MODALES */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(6px)}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:var(--s1);border:1px solid var(--bd2);border-radius:20px 20px 0 0;padding:28px 24px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;animation:slideUp .28s ease}
@media(min-width:600px){.modal{border-radius:20px;animation:fadeIn .2s ease}}
@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
.modal-title{font-family:'Bebas Neue',sans-serif;font-size:1.65rem;margin-bottom:16px;letter-spacing:1px}
.metodo-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.metodo-btn{background:var(--s2);border:2px solid var(--bd);border-radius:var(--r);padding:16px 12px;text-align:center;transition:all .2s}
.metodo-btn.on{border-color:var(--ac);background:rgba(255,77,28,.08)}
.metodo-btn:hover{border-color:var(--ac)}
.metodo-icon{font-size:1.8rem;margin-bottom:5px}
.metodo-label{font-weight:700;font-size:.88rem}
.cambio-box{background:var(--s2);border-radius:var(--r);padding:16px;text-align:center;margin:12px 0}
.cambio-label{font-size:.72rem;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.cambio-amt{font-family:'Bebas Neue',sans-serif;font-size:2.3rem;color:var(--green)}
.resumen-row{display:flex;justify-content:space-between;padding:6px 0;font-size:.84rem;border-bottom:1px solid var(--bd)}
.resumen-row:last-child{border-bottom:none;font-weight:700;padding-top:10px;font-size:.9rem}

/* SCANNER */
.scanner-video-wrap{width:100%;aspect-ratio:4/3;background:#000;border-radius:var(--r);position:relative;overflow:hidden;margin:12px 0}
video{width:100%;height:100%;object-fit:cover}
.scan-frame{position:absolute;inset:18%;border:3px solid var(--ac);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.5);pointer-events:none}
.scan-line{position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--ac),transparent);animation:scanLine 1.8s ease-in-out infinite;pointer-events:none}
@keyframes scanLine{0%,100%{top:18%;opacity:0}10%{opacity:1}90%{opacity:1}50%{top:82%}}
.scan-status{display:flex;align-items:center;justify-content:center;gap:7px;font-size:.75rem;margin:5px 0}
.scan-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.scan-loading{position:absolute;inset:0;background:rgba(0,0,0,.7);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:.82rem;color:var(--tx2)}

/* SUCCESS */
.success-modal{text-align:center;padding:8px 0}
.success-icon{font-size:3.5rem;margin-bottom:12px}
.success-title{font-family:'Bebas Neue',sans-serif;font-size:1.9rem;color:var(--green);margin-bottom:8px;letter-spacing:1px}
.success-detail{font-size:.84rem;color:var(--tx2);line-height:1.7}

/* ADMIN */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:20px 18px}
.stat-val{font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--ac);letter-spacing:1px}
.stat-label{font-size:.72rem;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-top:3px}
.section-title{font-family:'Bebas Neue',sans-serif;font-size:1.25rem;letter-spacing:1px;color:var(--tx2);margin-bottom:12px;margin-top:6px}
.table-wrap{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;overflow-x:auto;margin-bottom:20px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:9px 14px;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;color:var(--tx2);border-bottom:1px solid var(--bd);white-space:nowrap}
td{padding:10px 14px;font-size:.83rem;border-bottom:1px solid rgba(255,255,255,.04)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}
.chip{font-size:.68rem;padding:3px 9px;border-radius:20px;font-weight:700;display:inline-block;white-space:nowrap}
.chip-green{background:rgba(34,197,94,.12);color:var(--green)}
.chip-red{background:rgba(239,68,68,.12);color:var(--red)}
.chip-gold{background:rgba(245,197,24,.12);color:var(--gold)}
.chip-blue{background:rgba(59,130,246,.12);color:var(--blue)}
.chip-purple{background:rgba(168,85,247,.12);color:var(--purple)}
.chip-gray{background:rgba(255,255,255,.06);color:var(--tx2)}
.form-panel{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:18px;margin-bottom:16px}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:11px;margin-bottom:12px}
.form-grid .fg{margin-bottom:0}
.btn-add{background:var(--green);border:none;border-radius:var(--rs);padding:9px 20px;color:#fff;font-weight:700;font-size:.84rem;transition:all .2s}
.btn-add:hover{background:#16a34a}
.btn-row{display:flex;gap:5px;flex-wrap:wrap}
.info-tip{background:rgba(245,197,24,.05);border:1px solid rgba(245,197,24,.18);border-radius:var(--rs);padding:11px 14px;margin-bottom:14px;font-size:.79rem;color:var(--tx2);line-height:1.65}
.stock-bar-wrap{width:60px;height:4px;background:var(--s3);border-radius:2px;overflow:hidden;display:inline-block}
.stock-bar{height:100%;border-radius:2px}

/* TOAST */
.toast-wrap{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:500;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.toast{padding:10px 20px;border-radius:var(--r);font-size:.83rem;font-weight:600;white-space:nowrap;animation:toastIn .25s ease;border:1px solid}
.toast-ok{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.3);color:#4ade80}
.toast-err{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3);color:#f87171}
@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media(max-width:768px){.page{padding:12px}.prod-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:7px}}
`

// ── Toast ────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'ok') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])
  return { toasts, show }
}

function Toasts({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}
    </div>
  )
}

// ── Login ────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const go = async () => {
    if (!email || !pass) { setErr('Rellena email y contraseña'); return }
    setLoading(true); setErr('')
    try { await onLogin(email, pass) }
    catch (e) { setErr(e.message || 'Credenciales incorrectas') }
    finally { setLoading(false) }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">La Petarderia</div>
        <div className="login-sub">Sistema TPV Profesional 2026</div>
        <div className="login-title">Acceso al sistema</div>
        {err && <div className="alert alert-err">{err}</div>}
        <div className="fg">
          <label>Email</label>
          <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@lapetarderia.es" onKeyDown={e => e.key === 'Enter' && go()} autoFocus />
        </div>
        <div className="fg">
          <label>Contraseña</label>
          <input className="inp" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && go()} />
        </div>
        <button className="btn" onClick={go} disabled={loading}>{loading ? 'Entrando...' : 'Entrar al sistema'}</button>
      </div>
    </div>
  )
}

// ── Scanner real con ZXing ───────────────────────────────────
function ScannerModal({ productos, onDetect, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [estado, setEstado] = useState('cargando') // cargando | activo | error
  const [errMsg, setErrMsg] = useState('')
  const [manual, setManual] = useState('')
  const [notFound, setNotFound] = useState('')

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // Cargar ZXing desde CDN
      if (!window.ZXingBrowser) {
        try {
          await new Promise((res, rej) => {
            if (document.querySelector('#zxing-script')) { res(); return }
            const s = document.createElement('script')
            s.id = 'zxing-script'
            s.src = 'https://unpkg.com/@zxing/browser@0.1.4/umd/index.min.js'
            s.onload = res; s.onerror = rej
            document.head.appendChild(s)
          })
        } catch {
          if (!cancelled) { setEstado('error'); setErrMsg('Error cargando librería de escaneo. Usa búsqueda manual.') }
          return
        }
      }
      if (cancelled) return

      try {
        const { BrowserMultiFormatReader, BarcodeFormat } = window.ZXingBrowser
        const hints = new Map()
        hints.set(2, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.UPC_A])

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 })
        readerRef.current = reader

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (!devices.length) { setEstado('error'); setErrMsg('No se encontró cámara en este dispositivo.'); return }

        // Preferir cámara trasera
        const cam = devices.find(d => /back|rear|trasera|environment/i.test(d.label)) || devices[devices.length - 1]

        if (cancelled) return
        setEstado('activo')

        const ultimosEAN = new Set()

        await reader.decodeFromVideoDevice(cam.deviceId, videoRef.current, (result, err) => {
          if (cancelled || !result) return
          const ean = result.getText()
          if (ultimosEAN.has(ean)) return
          ultimosEAN.add(ean)
          setTimeout(() => ultimosEAN.delete(ean), 2000) // anti-repetición 2s

          const prod = productos.find(p => p.activo && (p.codigo_ean === ean || p.codigo === ean))
          if (prod) {
            playBeep()
            if (navigator.vibrate) navigator.vibrate([80])
            onDetect(prod)
          } else {
            setNotFound(`Código ${ean} no encontrado en catálogo`)
            setManual(ean)
            setTimeout(() => setNotFound(''), 4000)
          }
        })
      } catch (e) {
        if (!cancelled) {
          setEstado('error')
          if (e.name === 'NotAllowedError' || /permission/i.test(e.message)) {
            setErrMsg('Permiso de cámara denegado. Actívalo en los ajustes del navegador.')
          } else {
            setErrMsg('No se pudo iniciar la cámara: ' + (e.message || e.name))
          }
        }
      }
    }

    init()
    return () => {
      cancelled = true
      try { readerRef.current?.reset() } catch {}
    }
  }, [])

  const buscar = () => {
    const q = manual.trim()
    if (!q) return
    const p = productos.find(p => p.activo && (
      p.codigo_ean === q || p.codigo === q ||
      p.nombre.toLowerCase().includes(q.toLowerCase())
    ))
    if (p) { playBeep(); onDetect(p) }
    else setNotFound('No encontrado: ' + q)
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-title">Escanear Producto</div>

        <div className="scanner-video-wrap">
          <video ref={videoRef} autoPlay playsInline muted />
          {estado === 'activo' && (
            <>
              <div className="scan-frame" />
              <div className="scan-line" />
            </>
          )}
          {estado === 'cargando' && (
            <div className="scan-loading">
              <div className="loading-spin" />
              <span>Iniciando cámara...</span>
            </div>
          )}
          {estado === 'error' && (
            <div className="scan-loading">
              <span style={{ fontSize: '2rem' }}>📷</span>
              <span style={{ color: 'var(--red)', textAlign: 'center', padding: '0 20px' }}>{errMsg}</span>
            </div>
          )}
        </div>

        {estado === 'activo' && (
          <div className="scan-status">
            <span className="scan-dot" />
            <span style={{ color: 'var(--tx2)' }}>Leyendo código EAN en tiempo real</span>
          </div>
        )}

        {notFound && <div className="alert alert-err" style={{ marginTop: 8 }}>{notFound}</div>}

        <div style={{ marginTop: 12, fontSize: '.74rem', color: 'var(--tx2)', marginBottom: 6 }}>
          O busca manualmente:
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="inp" style={{ flex: 1 }} placeholder="Código EAN o nombre..." value={manual}
            onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
          <button className="btn" style={{ width: 'auto', marginTop: 0, padding: '10px 16px' }} onClick={buscar}>Buscar</button>
        </div>

        <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Cerrar escáner</button>
      </div>
    </div>
  )
}

// ── Ticket Item ───────────────────────────────────────────────
function TicketItem({ item, ofertas, onQty, onDel }) {
  const [open, setOpen] = useState(false)
  const { total, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
  const hayOferta = !!desglose

  return (
    <div className="titem">
      <div className="titem-body">
        <div className="titem-name">{item.nombre}</div>
        <div className="titem-ctrl">
          <button className="qty-btn" onClick={() => onQty(item.id, -1)}>−</button>
          <span className="qty-val">{item.cantidad}</span>
          <button className="qty-btn" onClick={() => onQty(item.id, +1)}>+</button>
          {hayOferta && (
            <span className="oferta-tag" onClick={() => setOpen(o => !o)}>
              OFERTA {open ? '▲' : '▼'}
            </span>
          )}
          <div className="titem-price">
            <div className="titem-price-unit">{hayOferta ? 'con oferta' : `${fmt(item.precio)}/u.`}</div>
            <div className="titem-price-total">{fmt(total)}</div>
          </div>
        </div>
        {hayOferta && open && (
          <div className="desglose">
            {desglose.map((d, i) => (
              <div key={i} className={`desglose-row ${d.tipo}`}>
                <span>{d.tipo === 'pack' ? `${d.packs}× pack ${d.etiqueta} = ${d.unidades}u. a ${fmt(d.precioU)}/u.` : `${d.unidades}u. precio normal (${fmt(d.precioU)}/u.)`}</span>
                <span>{fmt(d.coste)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="del-btn" onClick={() => onDel(item.id)}>✕</button>
    </div>
  )
}

// ── Apertura Caja ─────────────────────────────────────────────
function AperturaCaja({ usuario, caseta, cajaActiva, onAbrir, onUnirse }) {
  const [dinero, setDinero] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  if (cajaActiva) {
    return (
      <div className="apertura-wrap">
        <div className="card">
          <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 14 }}>🔓</div>
          <div className="card-title" style={{ color: 'var(--green)', textAlign: 'center' }}>Caja abierta</div>
          <div className="card-sub" style={{ textAlign: 'center' }}>{caseta?.nombre}</div>
          <div className="alert alert-ok" style={{ marginBottom: 16 }}>
            <strong>{cajaActiva.abierto_por}</strong> abrió la caja a las {new Date(cajaActiva.abierto_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.<br />
            Tus ventas se acumularán en la misma caja.
          </div>
          <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 18, fontSize: '.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: 'var(--tx2)' }}>Apertura</span><span style={{ fontWeight: 700 }}>{fmt(cajaActiva.apertura)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: 'var(--tx2)' }}>Tickets del turno</span><span style={{ fontWeight: 700 }}>{cajaActiva.num_tickets}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--tx2)' }}>Total acumulado</span>
              <span style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(cajaActiva.total_ventas || 0)}</span>
            </div>
          </div>
          <button className="btn" onClick={onUnirse}>Unirme al turno →</button>
        </div>
      </div>
    )
  }

  const abrir = async () => {
    setLoading(true); setErr('')
    try { await onAbrir(parseFloat(dinero) || 0) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="apertura-wrap">
      <div className="card">
        <div className="card-title">Apertura de Caja</div>
        <div className="card-sub">
          Hola <strong>{usuario.nombre}</strong> — {caseta?.nombre}<br />
          <span style={{ fontSize: '.78rem' }}>Introduce el efectivo inicial del turno.</span>
        </div>
        {err && <div className="alert alert-err">{err}</div>}
        <input className="big-inp" type="number" placeholder="0,00" value={dinero} onChange={e => setDinero(e.target.value)} min="0" step="0.01" autoFocus />
        <button className="btn" onClick={abrir} disabled={loading}>{loading ? 'Abriendo...' : 'Abrir caja y comenzar'}</button>
      </div>
    </div>
  )
}

// ── Finalizar Venta ───────────────────────────────────────────
function FinalizarModal({ total, onConfirm, onClose }) {
  const [metodo, setMetodo] = useState('')
  const [recibido, setRecibido] = useState('')
  const [loading, setLoading] = useState(false)
  const cambio = metodo === 'efectivo' ? Math.max(0, (parseFloat(recibido) || 0) - total) : 0
  const puedeConfirmar = metodo && (metodo === 'tarjeta' || (parseFloat(recibido) || 0) >= total)

  const confirmar = async () => {
    setLoading(true)
    try { await onConfirm({ metodo_pago: metodo, cambio }) }
    finally { setLoading(false) }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-title">Finalizar Venta</div>
        <div style={{ fontSize: '.84rem', color: 'var(--tx2)', marginBottom: 8 }}>Total a cobrar:</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '3rem', color: 'var(--ac)', marginBottom: 16, lineHeight: 1 }}>{fmt(total)}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Método de pago</div>
        <div className="metodo-grid">
          <div className={`metodo-btn ${metodo === 'efectivo' ? 'on' : ''}`} onClick={() => setMetodo('efectivo')}>
            <div className="metodo-icon">💵</div><div className="metodo-label">Efectivo</div>
          </div>
          <div className={`metodo-btn ${metodo === 'tarjeta' ? 'on' : ''}`} onClick={() => setMetodo('tarjeta')}>
            <div className="metodo-icon">💳</div><div className="metodo-label">Tarjeta</div>
          </div>
        </div>
        {metodo === 'efectivo' && (
          <>
            <div className="fg">
              <label>Dinero recibido</label>
              <input className="big-inp" type="number" style={{ fontSize: '1.6rem', marginBottom: 0 }}
                value={recibido} onChange={e => setRecibido(e.target.value)} placeholder="0,00" autoFocus min={total} step=".5" />
            </div>
            <div className="cambio-box">
              <div className="cambio-label">Cambio a devolver</div>
              <div className="cambio-amt">{fmt(cambio)}</div>
            </div>
          </>
        )}
        <button className="btn" onClick={confirmar} disabled={!puedeConfirmar || loading} style={{ marginTop: 6 }}>
          {loading ? 'Procesando...' : '✓ Confirmar Venta'}
        </button>
        <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Cierre Caja ───────────────────────────────────────────────
function CierreCajaModal({ caja, caseta, onCerrar, onClose }) {
  const [contado, setContado] = useState('')
  const [loading, setLoading] = useState(false)
  const [detalle, setDetalle] = useState(null)

  useEffect(() => {
    // Cargar detalle de ventas por empleado
    api.cajaActiva(caja.caseta_id).then(d => setDetalle(d)).catch(() => {})
  }, [caja.caseta_id])

  const esperado = Number(caja.apertura) + Number(caja.total_efectivo || 0)
  const dif = (parseFloat(contado) || 0) - esperado

  const cerrar = async () => {
    setLoading(true)
    try { await onCerrar(parseFloat(contado) || 0) }
    finally { setLoading(false) }
  }

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">Cierre de Caja</div>
        <div style={{ background: 'rgba(245,197,24,.06)', border: '1px solid rgba(245,197,24,.2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14, fontSize: '.8rem' }}>
          <strong style={{ color: 'var(--gold)' }}>{caseta?.nombre}</strong><br />
          <span style={{ color: 'var(--tx2)' }}>Turno abierto por <strong style={{ color: 'var(--tx)' }}>{caja.abierto_por}</strong></span>
        </div>

        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <div style={{ padding: '10px 14px', fontSize: '.72rem', color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bd)' }}>
            Resumen del turno
          </div>
          <div style={{ padding: '12px 14px', fontSize: '.84rem' }}>
            <div className="resumen-row"><span>Apertura de caja</span><span>{fmt(caja.apertura)}</span></div>
            <div className="resumen-row"><span>Ventas en efectivo</span><span style={{ color: 'var(--green)' }}>+{fmt(caja.total_efectivo || 0)}</span></div>
            <div className="resumen-row"><span>Ventas con tarjeta</span><span style={{ color: 'var(--blue)' }}>{fmt(caja.total_tarjeta || 0)}</span></div>
            <div className="resumen-row"><span>Tickets totales</span><span>{caja.num_tickets || 0}</span></div>
            <div className="resumen-row"><span>Esperado en caja física</span><span style={{ color: 'var(--ac)', fontWeight: 700 }}>{fmt(esperado)}</span></div>
          </div>
        </div>

        <div className="fg">
          <label>Dinero contado físicamente en caja</label>
          <input className="big-inp" type="number" style={{ fontSize: '1.5rem', marginBottom: 0 }}
            value={contado} onChange={e => setContado(e.target.value)} placeholder="0,00" min="0" step=".01" autoFocus />
        </div>

        {contado && (
          <div className="cambio-box" style={{ marginTop: 10 }}>
            <div className="cambio-label">{dif >= 0 ? 'Sobra en caja' : 'Falta en caja'}</div>
            <div className="cambio-amt" style={{ color: dif < 0 ? 'var(--red)' : 'var(--green)' }}>
              {dif >= 0 ? '+' : ''}{fmt(Math.abs(dif))}
            </div>
          </div>
        )}

        <button className="btn" onClick={cerrar} disabled={loading} style={{ marginTop: 14 }}>
          {loading ? 'Cerrando...' : 'Confirmar cierre de caja'}
        </button>
        <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── TPV Principal ─────────────────────────────────────────────
function TPV({ usuario, caseta, caja, onVenta, onCerrarCaja }) {
  const [productos, setProductos] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [ticket, setTicket] = useState([])
  const [busq, setBusq] = useState('')
  const [cat, setCat] = useState('Todos')
  const [showScan, setShowScan] = useState(false)
  const [showFin, setShowFin] = useState(false)
  const [showOk, setShowOk] = useState(null)
  const [showCierre, setShowCierre] = useState(false)
  const [loadingProd, setLoadingProd] = useState(true)
  const { toasts, show: toast } = useToast()

  const CATEGORIAS = ['Todos', 'Petardos', 'Truenos', 'Bengalas', 'Cracker', 'Terrestres', 'Fuentes', 'Efectos', 'Packs', 'Accesorios']

  useEffect(() => {
    Promise.all([api.productos(caseta.id), api.ofertas()])
      .then(([p, o]) => { setProductos(p); setOfertas(o) })
      .catch(() => toast('Error cargando productos', 'err'))
      .finally(() => setLoadingProd(false))
  }, [caseta.id])

  const prodsFiltrados = productos.filter(p => {
    if (!p.activo) return false
    if (cat !== 'Todos' && p.categoria !== cat) return false
    if (busq && !p.nombre.toLowerCase().includes(busq.toLowerCase()) && !(p.codigo_ean || p.codigo || '').includes(busq)) return false
    return true
  })

  const agregar = useCallback((prod) => {
    // Usar el stock de la caseta
    const stockDisp = prod.stock_caseta ?? prod.stock ?? prod.cantidad ?? 0
    if (stockDisp <= 0) { toast('Sin stock disponible', 'err'); return }
    setTicket(prev => {
      const idx = prev.findIndex(i => i.id === prod.id)
      if (idx >= 0) {
        if (prev[idx].cantidad >= stockDisp) { toast('Stock insuficiente', 'err'); return prev }
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: n[idx].cantidad + 1 }; return n
      }
      return [...prev, { ...prod, cantidad: 1 }]
    })
    setShowScan(false)
  }, [])

  const cambiarQty = (id, delta) => setTicket(prev => prev.map(i => {
    if (i.id !== id) return i
    const q = i.cantidad + delta
    if (q <= 0) return null
    const stockDisp = i.stock_caseta ?? i.stock ?? i.cantidad ?? 99
    if (q > stockDisp) { toast('Stock insuficiente', 'err'); return i }
    return { ...i, cantidad: q }
  }).filter(Boolean))

  const total = ticket.reduce((s, i) => s + calcularPrecio(i.id, i.cantidad, i.precio, ofertas).total, 0)
  const numItems = ticket.reduce((s, i) => s + i.cantidad, 0)

  const confirmarVenta = async (pago) => {
    const items = ticket.map(i => {
      const { total: t } = calcularPrecio(i.id, i.cantidad, i.precio, ofertas)
      return { producto_id: i.id, cantidad: i.cantidad, precio_unit: i.precio, precio_total: t, con_oferta: calcularPrecio(i.id, i.cantidad, i.precio, ofertas).desglose !== null }
    })
    const payload = { caseta_id: caseta.id, caja_id: caja.caja_id, metodo_pago: pago.metodo_pago, total, cambio: pago.cambio || 0, items }
    const ticket_guardado = await api.crearTicket(payload)
    onVenta({ metodo_pago: pago.metodo_pago, total })
    // Actualizar stock en UI
    setProductos(prev => prev.map(p => {
      const item = ticket.find(i => i.id === p.id)
      if (!item) return p
      return { ...p, stock_caseta: Math.max(0, (p.stock_caseta ?? 50) - item.cantidad) }
    }))
    setShowFin(false)
    setShowOk({ ...payload, cambio: pago.cambio, fecha: getNow() })
    setTicket([])
  }

  const eaBadge = p => {
    const cls = p.edad_minima === 0 ? 'ea-t1' : p.edad_minima <= 12 ? 'ea-12' : p.edad_minima <= 16 ? 'ea-16' : 'ea-18'
    const lbl = p.edad_minima === 0 ? 'T1' : `${p.edad_minima}+`
    return <span className={`ea-badge ${cls}`}>{lbl}</span>
  }

  return (
    <div className="tpv-layout">
      <div className="tpv-subbar">
        <span><span style={{ color: 'var(--tx2)' }}>Caseta:</span> <strong>{caseta.nombre}</strong></span>
        <span style={{ color: 'var(--tx2)' }}>|</span>
        <span style={{ color: 'var(--tx2)' }}>Turno: <strong style={{ color: 'var(--green)' }}>{caja.num_tickets || 0}</strong> tickets · <strong style={{ color: 'var(--ac)' }}>{fmt((caja.total_efectivo || 0) + (caja.total_tarjeta || 0))}</strong></span>
        {caja.abierto_por !== usuario.nombre && <span style={{ color: 'var(--tx2)', fontSize: '.75rem' }}>Caja abierta por <strong style={{ color: 'var(--tx)' }}>{caja.abierto_por}</strong></span>}
        <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setShowCierre(true)}>Cerrar caja</button>
      </div>

      <div className="tpv-grid">
        {/* Panel productos */}
        <div className="prod-panel">
          <div className="prod-search">
            <input className="inp" style={{ flex: 1 }} placeholder="Buscar por nombre o código EAN..." value={busq} onChange={e => setBusq(e.target.value)} />
            <button className="btn-scan" onClick={() => setShowScan(true)}>📷</button>
          </div>
          <div className="cat-bar">
            {CATEGORIAS.map(c => <button key={c} className={`cat-btn ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          {loadingProd ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx2)' }}>
              <div className="loading-spin" />
            </div>
          ) : (
            <div className="prod-grid">
              {prodsFiltrados.map(p => {
                const enT = ticket.find(i => i.id === p.id)
                const stock = p.stock_caseta ?? p.cantidad ?? 50
                const tieneOferta = ofertas.some(o => o.producto_id === p.id)
                return (
                  <div key={p.id} className={`prod-card ${enT ? 'selected' : ''} ${stock === 0 ? 'agotado' : ''}`} onClick={() => agregar(p)}>
                    {eaBadge(p)}
                    {enT && <span className="prod-qty-badge">{enT.cantidad}</span>}
                    <div className="prod-name">{p.nombre}</div>
                    <div className="prod-price">{fmt(p.precio)}</div>
                    <div className="prod-stock">{stock === 0 ? 'Agotado' : `Stock: ${stock}`}</div>
                    {tieneOferta && <span className="oferta-dot">OFERTA</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Panel ticket */}
        <div className="ticket-panel">
          <div className="ticket-head">
            <div className="ticket-head-title">Ticket de Venta</div>
            <div className="ticket-head-sub">{getNow()} · {usuario.nombre}</div>
          </div>
          <div className="ticket-items">
            {ticket.length === 0 ? (
              <div className="ticket-empty">
                <span style={{ fontSize: '2.4rem', opacity: .35 }}>🛒</span>
                <span>Ticket vacío</span>
                <span style={{ fontSize: '.73rem' }}>Toca un producto o escanea</span>
              </div>
            ) : ticket.map(item => (
              <TicketItem key={item.id} item={item} ofertas={ofertas} onQty={cambiarQty} onDel={id => setTicket(p => p.filter(i => i.id !== id))} />
            ))}
          </div>
          <div className="ticket-foot">
            <div className="ticket-subtotal"><span>Artículos</span><span>{numItems}</span></div>
            <div className="ticket-total-row">
              <span className="ticket-total-label">TOTAL</span>
              <span className="ticket-total-amt">{fmt(total)}</span>
            </div>
            <button className="btn-cobrar" disabled={ticket.length === 0} onClick={() => setShowFin(true)}>
              Cobrar →
            </button>
            {ticket.length > 0 && <button className="btn-clear" onClick={() => setTicket([])}>✕ Limpiar ticket</button>}
          </div>
        </div>
      </div>

      {showScan && <ScannerModal productos={productos} onDetect={agregar} onClose={() => setShowScan(false)} />}
      {showFin && <FinalizarModal total={total} onConfirm={confirmarVenta} onClose={() => setShowFin(false)} />}
      {showCierre && <CierreCajaModal caja={caja} caseta={caseta} onCerrar={async (c) => { await api.cerrarCaja(caja.caja_id, c); onCerrarCaja() }} onClose={() => setShowCierre(false)} />}

      {showOk && (
        <div className="overlay">
          <div className="modal success-modal">
            <div className="success-icon">🎉</div>
            <div className="success-title">Venta Confirmada</div>
            <div className="success-detail">
              {showOk.fecha}<br />
              Empleado: {usuario.nombre}<br />
              Total: <strong style={{ color: 'var(--ac)' }}>{fmt(showOk.total)}</strong><br />
              {showOk.metodo_pago === 'efectivo' ? `💵 Efectivo · Cambio: ${fmt(showOk.cambio)}` : '💳 Tarjeta'}
            </div>
            <button className="btn" style={{ marginTop: 20 }} onClick={() => setShowOk(null)}>Nueva venta</button>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} />
    </div>
  )
}

// ── Admin — Productos ─────────────────────────────────────────
function AdminProductos() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busq, setBusq] = useState('')
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const CATS = ['Petardos', 'Truenos', 'Bengalas', 'Cracker', 'Terrestres', 'Fuentes', 'Efectos', 'Packs', 'Accesorios']
  const F0 = { nombre: '', precio: '', categoria: 'Petardos', edad_minima: '16', codigo_ean: '', activo: true }
  const [form, setForm] = useState(F0)
  const show = (txt, ok = true) => { setMsg({ txt, ok }); setTimeout(() => setMsg(null), 3500) }

  useEffect(() => { api.admin.productos().then(setProductos).finally(() => setLoading(false)) }, [])

  const guardar = async () => {
    if (!form.nombre || !form.precio || !form.codigo_ean) { show('Nombre, precio y código son obligatorios', false); return }
    try {
      if (editId) {
        const p = await api.admin.editarProducto(editId, { ...form, precio: parseFloat(form.precio), edad_minima: parseInt(form.edad_minima) })
        setProductos(prev => prev.map(x => x.id === editId ? p : x))
        show('Producto actualizado')
      } else {
        const p = await api.admin.crearProducto({ ...form, precio: parseFloat(form.precio), edad_minima: parseInt(form.edad_minima) })
        setProductos(prev => [...prev, p])
        show('Producto añadido')
      }
      setForm(F0); setEditId(null)
    } catch (e) { show(e.message, false) }
  }

  const toggle = async (id, activo) => {
    try {
      await api.admin.toggleProducto(id, !activo)
      setProductos(prev => prev.map(p => p.id === id ? { ...p, activo: !activo } : p))
    } catch (e) { show(e.message, false) }
  }

  const eaLabel = m => m === 0 ? 'T1' : `${m}+`
  const eaChip = m => m === 0 ? 'chip-purple' : m <= 12 ? 'chip-green' : m <= 16 ? 'chip-blue' : 'chip-red'
  const prods = productos.filter(p => !busq || p.nombre.toLowerCase().includes(busq.toLowerCase()) || (p.codigo_ean || '').includes(busq))

  return (
    <div>
      <div className="section-title">{editId ? 'Editar Producto' : 'Nuevo Producto'}</div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-err'}`}>{msg.txt}</div>}
      <div className="form-panel">
        <div className="form-grid">
          <div className="fg"><label>Nombre</label><input className="inp" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del producto" /></div>
          <div className="fg"><label>Precio (€)</label><input className="inp" type="number" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} placeholder="0,00" min="0" step=".01" /></div>
          <div className="fg"><label>Código EAN</label><input className="inp" value={form.codigo_ean} onChange={e => setForm({ ...form, codigo_ean: e.target.value })} placeholder="8410278000" /></div>
          <div className="fg"><label>Categoría</label><select className="inp" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="fg"><label>Edad mínima</label>
            <select className="inp" value={form.edad_minima} onChange={e => setForm({ ...form, edad_minima: e.target.value })}>
              <option value="0">T1 (requiere DNI)</option><option value="12">12+</option><option value="16">16+</option><option value="18">18+</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-add" onClick={guardar}>{editId ? 'Guardar cambios' : 'Añadir producto'}</button>
          {editId && <button className="btn-ghost" onClick={() => { setEditId(null); setForm(F0) }}>Cancelar</button>}
        </div>
      </div>

      <div className="section-title">Catálogo ({productos.length} productos)</div>
      <div style={{ marginBottom: 10 }}><input className="inp" style={{ maxWidth: 340 }} placeholder="Buscar..." value={busq} onChange={e => setBusq(e.target.value)} /></div>
      {loading ? <div style={{ color: 'var(--tx2)', padding: 20 }}>Cargando...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Código EAN</th><th>Categoría</th><th>Precio</th><th>Edad</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {prods.map(p => (
                <tr key={p.id} style={{ opacity: p.activo ? 1 : .5 }}>
                  <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                  <td style={{ color: 'var(--tx2)', fontFamily: 'monospace', fontSize: '.8rem' }}>{p.codigo_ean}</td>
                  <td style={{ color: 'var(--tx2)' }}>{p.categoria}</td>
                  <td style={{ color: 'var(--ac)', fontWeight: 700 }}>{fmt(p.precio)}</td>
                  <td><span className={`chip ${eaChip(p.edad_minima)}`}>{eaLabel(p.edad_minima)}</span></td>
                  <td><span className={`chip ${p.activo ? 'chip-green' : 'chip-red'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <div className="btn-row">
                      <button className="btn-ghost" onClick={() => { setForm({ nombre: p.nombre, precio: String(p.precio), categoria: p.categoria, edad_minima: String(p.edad_minima), codigo_ean: p.codigo_ean, activo: p.activo }); setEditId(p.id) }}>Editar</button>
                      <button className={`btn-ghost ${p.activo ? '' : 'success'}`} onClick={() => toggle(p.id, p.activo)}>{p.activo ? 'Desact.' : 'Activar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Admin — Ofertas ───────────────────────────────────────────
function AdminOfertas() {
  const [ofertas, setOfertas] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const F0 = { producto_id: '', etiqueta: '', cantidad_pack: '', precio_pack: '' }
  const [form, setForm] = useState(F0)
  const show = (txt, ok = true) => { setMsg({ txt, ok }); setTimeout(() => setMsg(null), 3500) }

  useEffect(() => {
    Promise.all([api.admin.ofertas(), api.admin.productos()])
      .then(([o, p]) => { setOfertas(o); setProductos(p.filter(x => x.activo)) })
      .finally(() => setLoading(false))
  }, [])

  const pu = (pack, cant) => cant && pack ? parseFloat(pack) / parseInt(cant) : 0

  const guardar = async () => {
    if (!form.producto_id || !form.etiqueta || !form.cantidad_pack || !form.precio_pack) { show('Todos los campos son obligatorios', false); return }
    const obj = { ...form, producto_id: parseInt(form.producto_id), cantidad_pack: parseInt(form.cantidad_pack), precio_pack: parseFloat(form.precio_pack) }
    try {
      if (editId) {
        const o = await api.admin.editarOferta(editId, obj)
        setOfertas(prev => prev.map(x => x.id === editId ? o : x)); show('Oferta actualizada')
      } else {
        const o = await api.admin.crearOferta(obj)
        setOfertas(prev => [...prev, o]); show('Oferta añadida')
      }
      setForm(F0); setEditId(null)
    } catch (e) { show(e.message, false) }
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta oferta?')) return
    try { await api.admin.eliminarOferta(id); setOfertas(prev => prev.filter(o => o.id !== id)) }
    catch (e) { show(e.message, false) }
  }

  const prodSel = form.producto_id ? productos.find(p => p.id === parseInt(form.producto_id)) : null
  const precioU = pu(form.precio_pack, form.cantidad_pack)

  return (
    <div>
      <div className="section-title">{editId ? 'Editar Oferta' : 'Nueva Oferta'}</div>
      <div className="info-tip">
        <strong style={{ color: 'var(--gold)' }}>Packs exactos:</strong> Si hay oferta <em>4×5€</em> y el cliente lleva 9 unidades → 2 packs de 4 (8u. a 5€/pack) + 1u. a precio normal. Si hay packs de 4 y 10, se aplican primero los de 10.
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-err'}`}>{msg.txt}</div>}
      <div className="form-panel">
        <div className="form-grid">
          <div className="fg"><label>Producto</label>
            <select className="inp" value={form.producto_id} onChange={e => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">-- Seleccionar --</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({fmt(p.precio)})</option>)}
            </select>
          </div>
          <div className="fg"><label>Etiqueta visible</label><input className="inp" value={form.etiqueta} onChange={e => setForm({ ...form, etiqueta: e.target.value })} placeholder="Ej: 4 x 5€" /></div>
          <div className="fg"><label>Unidades por pack</label><input className="inp" type="number" value={form.cantidad_pack} onChange={e => setForm({ ...form, cantidad_pack: e.target.value })} placeholder="4" min="2" /></div>
          <div className="fg"><label>Precio total del pack (€)</label><input className="inp" type="number" value={form.precio_pack} onChange={e => setForm({ ...form, precio_pack: e.target.value })} placeholder="5.00" min="0" step=".01" /></div>
        </div>
        {form.cantidad_pack && form.precio_pack && (
          <div style={{ fontSize: '.8rem', marginBottom: 11, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--gold)' }}>€/unidad con oferta: <strong>{fmt(precioU)}</strong></span>
            {prodSel && <span style={{ color: 'var(--green)' }}>Ahorro: <strong>{fmt(prodSel.precio - precioU)}/u.</strong></span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-add" onClick={guardar}>{editId ? 'Guardar cambios' : 'Añadir oferta'}</button>
          {editId && <button className="btn-ghost" onClick={() => { setEditId(null); setForm(F0) }}>Cancelar</button>}
        </div>
      </div>

      <div className="section-title">Ofertas activas ({ofertas.length})</div>
      {loading ? <div style={{ color: 'var(--tx2)', padding: 20 }}>Cargando...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Etiqueta</th><th>Pack</th><th>Precio pack</th><th>€/unidad</th><th>Precio normal</th><th>Ahorro/u.</th><th>Acciones</th></tr></thead>
            <tbody>
              {ofertas.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 24 }}>Sin ofertas</td></tr> :
                ofertas.map(o => {
                  const p = productos.find(x => x.id === o.producto_id)
                  const pu2 = o.precio_pack / o.cantidad_pack
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{p?.nombre || <span style={{ color: 'var(--red)' }}>Eliminado</span>}</td>
                      <td><span className="chip chip-gold">{o.etiqueta}</span></td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{o.cantidad_pack}u.</td>
                      <td style={{ color: 'var(--ac)', fontWeight: 700 }}>{fmt(o.precio_pack)}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(pu2)}</td>
                      <td style={{ color: 'var(--tx2)' }}>{p ? fmt(p.precio) : '—'}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 700 }}>{p ? `-${fmt(p.precio - pu2)}` : '—'}</td>
                      <td>
                        <div className="btn-row">
                          <button className="btn-ghost" onClick={() => { setForm({ producto_id: String(o.producto_id), etiqueta: o.etiqueta, cantidad_pack: String(o.cantidad_pack), precio_pack: String(o.precio_pack) }); setEditId(o.id) }}>Editar</button>
                          <button className="btn-ghost danger" onClick={() => eliminar(o.id)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Admin — Usuarios ──────────────────────────────────────────
function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [casetas, setCasetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const F0 = { nombre: '', email: '', password: '', rol: 'EMPLEADO', caseta_id: '' }
  const [form, setForm] = useState(F0)
  const show = (txt, ok = true) => { setMsg({ txt, ok }); setTimeout(() => setMsg(null), 3500) }

  useEffect(() => {
    Promise.all([api.admin.usuarios(), api.admin.casetas()])
      .then(([u, c]) => { setUsuarios(u); setCasetas(c) })
      .finally(() => setLoading(false))
  }, [])

  const guardar = async () => {
    if (!form.nombre || !form.email) { show('Nombre y email son obligatorios', false); return }
    if (!editId && !form.password) { show('La contraseña es obligatoria para nuevos usuarios', false); return }
    if (form.rol === 'EMPLEADO' && !form.caseta_id) { show('El empleado necesita una caseta asignada', false); return }
    try {
      const payload = { ...form, caseta_id: form.caseta_id ? parseInt(form.caseta_id) : null }
      if (!payload.password) delete payload.password
      if (editId) {
        const u = await api.admin.editarUsuario(editId, payload)
        setUsuarios(prev => prev.map(x => x.id === editId ? u : x)); show('Usuario actualizado')
      } else {
        const u = await api.admin.crearUsuario(payload)
        setUsuarios(prev => [...prev, u]); show('Usuario creado')
      }
      setForm(F0); setEditId(null)
    } catch (e) { show(e.message, false) }
  }

  const toggle = async (id, activo) => {
    try { await api.admin.toggleUsuario(id, !activo); setUsuarios(prev => prev.map(u => u.id === id ? { ...u, activo: !activo } : u)) }
    catch (e) { show(e.message, false) }
  }

  return (
    <div>
      <div className="section-title">{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</div>
      <div className="info-tip">
        <strong style={{ color: 'var(--gold)' }}>Roles:</strong> <strong>ADMIN</strong> — acceso completo, sin caseta. <strong>EMPLEADO</strong> — solo TPV de su caseta asignada.
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-err'}`}>{msg.txt}</div>}
      <div className="form-panel">
        <div className="form-grid">
          <div className="fg"><label>Nombre completo</label><input className="inp" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre Apellidos" /></div>
          <div className="fg"><label>Email</label><input className="inp" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@lapetarderia.es" /></div>
          <div className="fg"><label>{editId ? 'Nueva contraseña (vacío=no cambiar)' : 'Contraseña'}</label><input className="inp" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" /></div>
          <div className="fg"><label>Rol</label>
            <select className="inp" value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value, caseta_id: e.target.value === 'ADMIN' ? '' : form.caseta_id })}>
              <option value="EMPLEADO">Empleado</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          {form.rol === 'EMPLEADO' && (
            <div className="fg"><label>Caseta asignada</label>
              <select className="inp" value={form.caseta_id} onChange={e => setForm({ ...form, caseta_id: e.target.value })}>
                <option value="">-- Seleccionar --</option>
                {casetas.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-add" onClick={guardar}>{editId ? 'Guardar cambios' : 'Crear usuario'}</button>
          {editId && <button className="btn-ghost" onClick={() => { setEditId(null); setForm(F0) }}>Cancelar</button>}
        </div>
      </div>

      <div className="section-title">Usuarios ({usuarios.length})</div>
      {loading ? <div style={{ color: 'var(--tx2)', padding: 20 }}>Cargando...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Caseta</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {usuarios.map(u => {
                const c = casetas.find(x => x.id === u.caseta_id)
                return (
                  <tr key={u.id} style={{ opacity: u.activo ? 1 : .5 }}>
                    <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                    <td style={{ color: 'var(--tx2)', fontSize: '.8rem' }}>{u.email}</td>
                    <td><span className={`chip ${u.rol === 'ADMIN' ? 'chip-gold' : 'chip-blue'}`}>{u.rol}</span></td>
                    <td style={{ color: 'var(--tx2)' }}>{c?.nombre || '— Global —'}</td>
                    <td><span className={`chip ${u.activo ? 'chip-green' : 'chip-red'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div className="btn-row">
                        <button className="btn-ghost" onClick={() => { setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, caseta_id: u.caseta_id ? String(u.caseta_id) : '' }); setEditId(u.id) }}>Editar</button>
                        <button className={`btn-ghost ${u.activo ? '' : 'success'}`} onClick={() => toggle(u.id, u.activo)}>{u.activo ? 'Desact.' : 'Activar'}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Admin — Dashboard ─────────────────────────────────────────
function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.admin.stats(), api.admin.ventasRecientes()])
      .then(([s, v]) => { setStats(s); setVentas(v) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--tx2)', padding: 20 }}>Cargando estadísticas...</div>

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-val">{fmt(stats?.total_hoy || 0)}</div><div className="stat-label">Ventas hoy</div></div>
        <div className="stat-card"><div className="stat-val">{stats?.tickets_hoy || 0}</div><div className="stat-label">Tickets hoy</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: stats?.stock_bajo > 5 ? 'var(--red)' : 'var(--ac)' }}>{stats?.stock_bajo || 0}</div><div className="stat-label">Stock bajo</div></div>
        <div className="stat-card"><div className="stat-val">{stats?.casetas_activas || 0}</div><div className="stat-label">Casetas activas</div></div>
        <div className="stat-card"><div className="stat-val">{stats?.empleados_activos || 0}</div><div className="stat-label">Empleados</div></div>
        <div className="stat-card"><div className="stat-val">{stats?.ofertas_activas || 0}</div><div className="stat-label">Ofertas activas</div></div>
      </div>

      <div className="section-title">Ventas recientes</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Empleado</th><th>Caseta</th><th>Artículos</th><th>Método</th><th>Total</th></tr></thead>
          <tbody>
            {ventas.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 24 }}>Sin ventas registradas</td></tr> :
              ventas.map(v => (
                <tr key={v.id}>
                  <td style={{ color: 'var(--tx2)', fontSize: '.78rem' }}>{new Date(v.created_at).toLocaleString('es-ES')}</td>
                  <td>{v.empleado_nombre}</td>
                  <td style={{ color: 'var(--tx2)' }}>{v.caseta_nombre}</td>
                  <td>{v.num_items}</td>
                  <td>{v.metodo_pago === 'efectivo' ? '💵 Efectivo' : '💳 Tarjeta'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(v.total)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {stats?.stock_critico?.length > 0 && (
        <>
          <div className="section-title">Stock crítico</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Caseta</th><th>Stock</th><th>Estado</th></tr></thead>
              <tbody>
                {stats.stock_critico.map((s, i) => (
                  <tr key={i}>
                    <td>{s.nombre}</td>
                    <td style={{ color: 'var(--tx2)' }}>{s.caseta_nombre}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div className="stock-bar-wrap"><div className="stock-bar" style={{ width: `${Math.min(100, s.cantidad / 50 * 100)}%`, background: s.cantidad === 0 ? 'var(--red)' : s.cantidad < 10 ? 'var(--red)' : 'var(--gold)' }} /></div>
                        <span style={{ color: s.cantidad === 0 ? 'var(--red)' : 'var(--gold)', fontWeight: 700 }}>{s.cantidad}</span>
                      </div>
                    </td>
                    <td><span className={`chip ${s.cantidad === 0 ? 'chip-red' : 'chip-gold'}`}>{s.cantidad === 0 ? 'Agotado' : 'Stock bajo'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Admin Panel ───────────────────────────────────────────────
function AdminPanel({ usuario, onLogout }) {
  const [tab, setTab] = useState('dashboard')
  const TABS = [['dashboard', 'Dashboard'], ['productos', 'Productos'], ['ofertas', 'Ofertas'], ['usuarios', 'Usuarios']]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="topbar">
        <div className="topbar-logo">La Petarderia</div>
        <div className="topbar-right">
          <span style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>{usuario.nombre}</span>
          <span className="badge badge-admin">Admin</span>
          <button className="btn-ghost" onClick={onLogout}>Salir</button>
        </div>
      </div>
      <div className="navtabs">
        {TABS.map(([k, l]) => <button key={k} className={`ntab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="page">
        {tab === 'dashboard' && <AdminDashboard />}
        {tab === 'productos' && <AdminProductos />}
        {tab === 'ofertas' && <AdminOfertas />}
        {tab === 'usuarios' && <AdminUsuarios />}
      </div>
    </div>
  )
}

// ── App Root ──────────────────────────────────────────────────
export default function App() {
  const { usuario, loading, login, logout } = useAuth()
  const { caja, abrir, unirse, cerrar, registrarVenta, recargar } = useCaja(usuario)
  const [casetas, setCasetas] = useState([])

  useEffect(() => {
    if (usuario?.rol === 'EMPLEADO') {
      api.admin.casetas().then(setCasetas).catch(() => {})
    }
  }, [usuario])

  if (loading) return (
    <>
      <style>{STYLES}</style>
      <div className="loading-screen">
        <div className="loading-logo">La Petarderia</div>
        <div className="loading-spin" />
      </div>
    </>
  )

  if (!usuario) return <><style>{STYLES}</style><Login onLogin={login} /></>

  if (usuario.rol === 'ADMIN') return <><style>{STYLES}</style><AdminPanel usuario={usuario} onLogout={logout} /></>

  const caseta = casetas.find(c => c.id === usuario.caseta_id)

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div className="topbar">
          <div className="topbar-logo">La Petarderia</div>
          <div className="topbar-right">
            <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>{caseta?.nombre}</span>
            <span className="badge badge-emp">Empleado</span>
            <button className="btn-ghost" onClick={logout}>Salir</button>
          </div>
        </div>

        {!caja ? (
          <AperturaCaja usuario={usuario} caseta={caseta} cajaActiva={null} onAbrir={abrir} onUnirse={unirse} />
        ) : (
          <TPV usuario={usuario} caseta={caseta} caja={caja} onVenta={registrarVenta}
            onCerrarCaja={() => { cerrar(0); recargar() }} />
        )}
      </div>
    </>
  )
}
