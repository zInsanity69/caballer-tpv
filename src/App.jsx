import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// INITIAL DATA
// ============================================================
const PRODUCTOS_INICIAL = [
  { id: 1,  nombre: "Bombeta Japonesa 50u.", precio: 1.00,  categoria: "Petardos",   edad_minima: 12, stock: 50,  codigo: "8410278001", activo: true },
  { id: 2,  nombre: "Bombetas Grandes 50u.", precio: 2.00,  categoria: "Petardos",   edad_minima: 12, stock: 40,  codigo: "8410278002", activo: true },
  { id: 3,  nombre: "Mini Petardo 100u.",    precio: 1.50,  categoria: "Petardos",   edad_minima: 16, stock: 60,  codigo: "8410278003", activo: true },
  { id: 4,  nombre: "Piratas 50u.",          precio: 1.00,  categoria: "Petardos",   edad_minima: 16, stock: 80,  codigo: "8410278004", activo: true },
  { id: 5,  nombre: "Bucaneros 50u.",        precio: 1.50,  categoria: "Petardos",   edad_minima: 16, stock: 70,  codigo: "8410278005", activo: true },
  { id: 6,  nombre: "Corsarios 50u.",        precio: 2.50,  categoria: "Petardos",   edad_minima: 16, stock: 55,  codigo: "8410278006", activo: true },
  { id: 7,  nombre: "100 Petardos 100u.",    precio: 1.50,  categoria: "Petardos",   edad_minima: 16, stock: 45,  codigo: "8410278007", activo: true },
  { id: 8,  nombre: "Cobras 50u.",           precio: 2.50,  categoria: "Petardos",   edad_minima: 16, stock: 50,  codigo: "8410278008", activo: true },
  { id: 9,  nombre: "Ninjas 100u.",          precio: 1.50,  categoria: "Petardos",   edad_minima: 16, stock: 90,  codigo: "8410278009", activo: true },
  { id: 10, nombre: "Supermasclet 25u.",     precio: 2.98,  categoria: "Petardos",   edad_minima: 16, stock: 30,  codigo: "8410278010", activo: true },
  { id: 11, nombre: "Granada Trueno 4u.",    precio: 5.50,  categoria: "Petardos",   edad_minima: 16, stock: 25,  codigo: "8410278011", activo: true },
  { id: 12, nombre: "Mega Masclet 20u.",     precio: 5.00,  categoria: "Petardos",   edad_minima: 16, stock: 20,  codigo: "8410278012", activo: true },
  { id: 13, nombre: "Kit Ninja",             precio: 4.50,  categoria: "Petardos",   edad_minima: 16, stock: 15,  codigo: "8410278013", activo: true },
  { id: 14, nombre: "Trueno Especial 8u.",   precio: 11.95, categoria: "Truenos",    edad_minima: 18, stock: 20,  codigo: "8410278014", activo: true },
  { id: 15, nombre: "Trueno Gigante 5u.",    precio: 14.95, categoria: "Truenos",    edad_minima: 18, stock: 15,  codigo: "8410278015", activo: true },
  { id: 16, nombre: "Traca 20 Petardos",     precio: 1.00,  categoria: "Truenos",    edad_minima: 16, stock: 40,  codigo: "8410278016", activo: true },
  { id: 17, nombre: "Traca 40 cobras",       precio: 1.50,  categoria: "Truenos",    edad_minima: 18, stock: 30,  codigo: "8410278017", activo: true },
  { id: 18, nombre: "Traca Saltarines",      precio: 1.00,  categoria: "Truenos",    edad_minima: 16, stock: 50,  codigo: "8410278018", activo: true },
  { id: 19, nombre: "Traca Mandarin",        precio: 1.00,  categoria: "Truenos",    edad_minima: 16, stock: 45,  codigo: "8410278019", activo: true },
  { id: 20, nombre: "Bengala Plumero 6u.",   precio: 2.50,  categoria: "Bengalas",   edad_minima: 12, stock: 60,  codigo: "8410278020", activo: true },
  { id: 21, nombre: "Chispitas 16cm. 10u.",  precio: 1.00,  categoria: "Bengalas",   edad_minima: 12, stock: 80,  codigo: "8410278021", activo: true },
  { id: 22, nombre: "Chispitas 30cm. 10u.",  precio: 2.00,  categoria: "Bengalas",   edad_minima: 12, stock: 70,  codigo: "8410278022", activo: true },
  { id: 23, nombre: "Chispitas 50cm. 10u.",  precio: 3.50,  categoria: "Bengalas",   edad_minima: 12, stock: 50,  codigo: "8410278023", activo: true },
  { id: 24, nombre: "Hypercolor 5u.",        precio: 3.50,  categoria: "Bengalas",   edad_minima: 12, stock: 40,  codigo: "8410278024", activo: true },
  { id: 25, nombre: "Coletas 6u.",           precio: 3.00,  categoria: "Cracker",    edad_minima: 16, stock: 35,  codigo: "8410278025", activo: true },
  { id: 26, nombre: "Canicas espaciales 6u.",precio: 2.00,  categoria: "Cracker",    edad_minima: 16, stock: 45,  codigo: "8410278026", activo: true },
  { id: 27, nombre: "Cracker Bomba 12u.",    precio: 2.00,  categoria: "Cracker",    edad_minima: 16, stock: 50,  codigo: "8410278027", activo: true },
  { id: 28, nombre: "Crackeritos 50u.",      precio: 4.00,  categoria: "Cracker",    edad_minima: 12, stock: 40,  codigo: "8410278028", activo: true },
  { id: 29, nombre: "Gusanitos 10u.",        precio: 2.00,  categoria: "Terrestres", edad_minima: 16, stock: 55,  codigo: "8410278029", activo: true },
  { id: 30, nombre: "Abeja Borracha 3u.",    precio: 1.50,  categoria: "Terrestres", edad_minima: 12, stock: 60,  codigo: "8410278030", activo: true },
  { id: 31, nombre: "Payasitos 3u.",         precio: 1.50,  categoria: "Terrestres", edad_minima: 12, stock: 70,  codigo: "8410278031", activo: true },
  { id: 32, nombre: "Ranas 4u.",             precio: 2.00,  categoria: "Terrestres", edad_minima: 16, stock: 45,  codigo: "8410278032", activo: true },
  { id: 33, nombre: "Bomberitos 6u.",        precio: 3.00,  categoria: "Terrestres", edad_minima: 12, stock: 40,  codigo: "8410278033", activo: true },
  { id: 34, nombre: "Mini F. Luminosa 4u.",  precio: 2.00,  categoria: "Fuentes",    edad_minima: 12, stock: 65,  codigo: "8410278034", activo: true },
  { id: 35, nombre: "Jarron Chino 2u.",      precio: 3.50,  categoria: "Fuentes",    edad_minima: 16, stock: 35,  codigo: "8410278035", activo: true },
  { id: 36, nombre: "Fuente Fenix 1u.",      precio: 2.00,  categoria: "Fuentes",    edad_minima: 16, stock: 30,  codigo: "8410278036", activo: true },
  { id: 37, nombre: "Flower Power 3u.",      precio: 5.50,  categoria: "Fuentes",    edad_minima: 16, stock: 25,  codigo: "8410278037", activo: true },
  { id: 38, nombre: "Furia 1u.",             precio: 5.95,  categoria: "Fuentes",    edad_minima: 16, stock: 20,  codigo: "8410278038", activo: true },
  { id: 39, nombre: "Pyropack XXL",          precio: 44.99, categoria: "Packs",      edad_minima: 16, stock: 10,  codigo: "8410278039", activo: true },
  { id: 40, nombre: "Maxi Mix Color",        precio: 25.99, categoria: "Packs",      edad_minima: 16, stock: 12,  codigo: "8410278040", activo: true },
  { id: 41, nombre: "Maxi Mix Trueno",       precio: 19.99, categoria: "Packs",      edad_minima: 16, stock: 8,   codigo: "8410278041", activo: true },
  { id: 42, nombre: "Destellos 12u.",        precio: 2.00,  categoria: "Efectos",    edad_minima: 16, stock: 55,  codigo: "8410278042", activo: true },
  { id: 43, nombre: "Fuchidors 10u.",        precio: 3.00,  categoria: "Efectos",    edad_minima: 12, stock: 50,  codigo: "8410278043", activo: true },
  { id: 44, nombre: "Magic Box 1u.",         precio: 1.75,  categoria: "Efectos",    edad_minima: 16, stock: 40,  codigo: "8410278044", activo: true },
  { id: 45, nombre: "Mecha Algodon 25cm.",   precio: 0.25,  categoria: "Accesorios", edad_minima: 0,  stock: 200, codigo: "8410278045", activo: true },
];

// OFERTAS — PACKS EXACTOS
// cantidad_pack = unidades exactas del pack
// precio_pack   = precio total de ESE pack (no por unidad)
// La logica: floor(cantidad / cantidad_pack) packs + resto a precio normal
// Si hay varias ofertas para un producto, se aplican de mayor a menor pack (greedy)
// Ejemplo: oferta 10x10 y 4x5. Cliente lleva 22 → 2 packs de 10 (20u, 20€) + 2 packs de 4?
// No: quedan 2 restantes, no llegan a 4, van a precio normal.
const OFERTAS_INICIAL = [
  { id: 1,  producto_id: 4,  etiqueta: "5 x 3€",    cantidad_pack: 5,  precio_pack: 3.00  },
  { id: 2,  producto_id: 4,  etiqueta: "4 x 5€",    cantidad_pack: 4,  precio_pack: 5.00  },
  { id: 3,  producto_id: 2,  etiqueta: "4 x 5€",    cantidad_pack: 4,  precio_pack: 5.00  },
  { id: 4,  producto_id: 2,  etiqueta: "10 x 10€",  cantidad_pack: 10, precio_pack: 10.00 },
  { id: 5,  producto_id: 8,  etiqueta: "3 x 5€",    cantidad_pack: 3,  precio_pack: 5.00  },
  { id: 6,  producto_id: 9,  etiqueta: "2 x 2,50€", cantidad_pack: 2,  precio_pack: 2.50  },
  { id: 7,  producto_id: 45, etiqueta: "5 x 1€",    cantidad_pack: 5,  precio_pack: 1.00  },
  { id: 8,  producto_id: 1,  etiqueta: "5 x 3€",    cantidad_pack: 5,  precio_pack: 3.00  },
  { id: 9,  producto_id: 27, etiqueta: "3 x 5€",    cantidad_pack: 3,  precio_pack: 5.00  },
  { id: 10, producto_id: 26, etiqueta: "3 x 5€",    cantidad_pack: 3,  precio_pack: 5.00  },
];

const CASETAS_INICIAL = [
  { id: 1, nombre: "La Petarderia Ruzafa",     activa: true },
  { id: 2, nombre: "La Petarderia Massanassa", activa: true },
  { id: 3, nombre: "La Petarderia Cabanyal",   activa: true },
  { id: 4, nombre: "La Petarderia Alzira",     activa: true },
];

const USUARIOS_INICIAL = [
  { id: 1, nombre: "Admin Principal", email: "admin@lapetarderia.es", password: "admin123", rol: "ADMIN",    caseta_id: null, activo: true },
  { id: 2, nombre: "Maria Garcia",    email: "maria@lapetarderia.es", password: "emp123",   rol: "EMPLEADO", caseta_id: 1,    activo: true },
  { id: 3, nombre: "Carlos Lopez",    email: "carlos@lapetarderia.es",password: "emp123",   rol: "EMPLEADO", caseta_id: 2,    activo: true },
  { id: 4, nombre: "Ana Martinez",    email: "ana@lapetarderia.es",   password: "emp123",   rol: "EMPLEADO", caseta_id: 3,    activo: true },
];

const CATEGORIAS = ["Todos","Petardos","Truenos","Bengalas","Cracker","Terrestres","Fuentes","Efectos","Packs","Accesorios"];

// ============================================================
// LOGICA DE PRECIOS POR PACKS EXACTOS
// Si hay varias ofertas, aplica primero la de mayor pack (greedy)
// Resto que no completa ningun pack -> precio normal
// ============================================================
function calcularPrecio(productoId, cantidad, precioBase, ofertas) {
  const ofertasProducto = ofertas
    .filter(o => o.producto_id === productoId)
    .sort((a, b) => b.cantidad_pack - a.cantidad_pack); // mayor pack primero

  if (ofertasProducto.length === 0) {
    return { total: precioBase * cantidad, desglose: null };
  }

  let restante = cantidad;
  let total = 0;
  let desglose = [];

  for (const oferta of ofertasProducto) {
    if (restante <= 0) break;
    const nPacks = Math.floor(restante / oferta.cantidad_pack);
    if (nPacks > 0) {
      const unidades = nPacks * oferta.cantidad_pack;
      const coste = nPacks * oferta.precio_pack;
      total += coste;
      restante -= unidades;
      desglose.push({
        tipo: "pack",
        etiqueta: oferta.etiqueta,
        packs: nPacks,
        unidades,
        coste,
        precioU: oferta.precio_pack / oferta.cantidad_pack,
      });
    }
  }

  if (restante > 0) {
    const coste = restante * precioBase;
    total += coste;
    desglose.push({ tipo: "normal", etiqueta: "Precio normal", packs: null, unidades: restante, coste, precioU: precioBase });
  }

  const hayOferta = desglose.some(d => d.tipo === "pack");
  return { total, desglose: hayOferta ? desglose : null };
}

// ============================================================
// UTILS
// ============================================================
const fmt = n => n.toFixed(2).replace(".", ",") + " \u20ac";
const getNow = () => new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });
const newId = arr => arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = "sine";
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2);
  } catch(e) {}
}

// ============================================================
// STYLES
// ============================================================
const S = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0f;--s1:#13131a;--s2:#1c1c27;--s3:#252535;
  --ac:#ff4d1c;--ac2:#ff8c42;--gold:#f5c842;--green:#22c55e;
  --blue:#3b82f6;--red:#ef4444;--purple:#a855f7;
  --tx:#f0f0f5;--tx2:#9090a8;--bd:rgba(255,255,255,.08);
  --r:12px;--rs:8px;
}
body{background:var(--bg);color:var(--tx);font-family:'DM Sans',sans-serif;min-height:100vh;overflow-x:hidden}

/* LOGIN */
.lw{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 0%,#ff4d1c22 0%,transparent 60%),var(--bg)}
.lc{background:var(--s1);border:1px solid var(--bd);border-radius:20px;padding:44px 38px;width:100%;max-width:420px}
.ll{font-family:'Bebas Neue',sans-serif;font-size:2.6rem;color:var(--ac);letter-spacing:2px;text-align:center;margin-bottom:4px}
.ls{text-align:center;color:var(--tx2);font-size:.83rem;margin-bottom:32px}
.lt{font-size:1.35rem;font-weight:700;text-align:center;margin-bottom:26px}
.fg{margin-bottom:16px}
.fg label{display:block;font-size:.78rem;font-weight:600;color:var(--tx2);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
.fg input,.fg select{width:100%;background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:11px 14px;color:var(--tx);font-size:.95rem;font-family:'DM Sans',sans-serif;outline:none;transition:border .2s}
.fg input:focus,.fg select:focus{border-color:var(--ac)}
.fg select option{background:var(--s2)}
.btn-p{width:100%;background:var(--ac);color:white;border:none;border-radius:var(--rs);padding:13px;font-size:1rem;font-weight:700;cursor:pointer;transition:all .2s;margin-top:6px;font-family:'DM Sans',sans-serif}
.btn-p:hover{background:#ff6040;transform:translateY(-1px)}
.btn-p:disabled{opacity:.4;cursor:not-allowed;transform:none}
.err-box{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:var(--rs);padding:11px;color:#ef4444;font-size:.85rem;margin-bottom:14px;text-align:center}
.ok-box{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);border-radius:var(--rs);padding:11px;color:var(--green);font-size:.85rem;margin-bottom:14px;text-align:center}

/* LAYOUT */
.app{display:flex;flex-direction:column;min-height:100vh}
.topbar{background:var(--s1);border-bottom:1px solid var(--bd);padding:11px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.tl{font-family:'Bebas Neue',sans-serif;font-size:1.55rem;color:var(--ac);letter-spacing:2px}
.ti{display:flex;align-items:center;gap:10px}
.badge{padding:4px 9px;border-radius:20px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.ba{background:rgba(245,200,66,.15);color:var(--gold);border:1px solid rgba(245,200,66,.3)}
.be{background:rgba(59,130,246,.15);color:var(--blue);border:1px solid rgba(59,130,246,.3)}
.btn-o{background:transparent;border:1px solid var(--bd);border-radius:var(--rs);padding:6px 13px;color:var(--tx2);font-size:.78rem;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif}
.btn-o:hover{border-color:var(--ac);color:var(--ac)}

/* NAV TABS */
.navtabs{background:var(--s1);border-bottom:1px solid var(--bd);padding:0 20px;display:flex;gap:2px;overflow-x:auto}
.ntab{padding:13px 17px;font-size:.86rem;font-weight:600;color:var(--tx2);border:none;background:transparent;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .2s;font-family:'DM Sans',sans-serif}
.ntab.on{color:var(--ac);border-bottom-color:var(--ac)}
.ntab:hover:not(.on){color:var(--tx)}

/* CONTENT */
.cnt{flex:1;padding:22px 20px;max-width:1400px;width:100%;margin:0 auto}

/* APERTURA */
.apw{max-width:460px;margin:56px auto}
.apc{background:var(--s1);border:1px solid var(--bd);border-radius:20px;padding:38px}
.apt{font-family:'Bebas Neue',sans-serif;font-size:1.9rem;color:var(--gold);margin-bottom:6px}
.aps{color:var(--tx2);font-size:.86rem;margin-bottom:22px}
.bi{width:100%;background:var(--s2);border:2px solid var(--bd);border-radius:var(--r);padding:18px;font-size:1.8rem;font-weight:700;color:var(--tx);outline:none;transition:border .2s;margin-bottom:14px;font-family:'DM Sans',sans-serif}
.bi:focus{border-color:var(--gold)}

/* TPV */
.tpvg{display:grid;grid-template-columns:1fr 370px;gap:18px;height:calc(100vh - 108px)}
@media(max-width:900px){.tpvg{grid-template-columns:1fr;height:auto}}
.pp{background:var(--s1);border:1px solid var(--bd);border-radius:14px;display:flex;flex-direction:column;overflow:hidden}
.sb{padding:12px 14px;border-bottom:1px solid var(--bd);display:flex;gap:9px}
.si{flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:9px 13px;color:var(--tx);font-size:.93rem;outline:none;font-family:'DM Sans',sans-serif}
.si:focus{border-color:var(--ac)}
.bsc{background:var(--ac);border:none;border-radius:var(--rs);padding:9px 14px;color:white;font-size:1.1rem;cursor:pointer;transition:all .2s}
.bsc:hover{background:#ff6040}
.cb{padding:9px 13px;border-bottom:1px solid var(--bd);display:flex;gap:5px;overflow-x:auto}
.ct{padding:5px 12px;border-radius:20px;border:1px solid var(--bd);background:transparent;color:var(--tx2);font-size:.74rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s;font-family:'DM Sans',sans-serif}
.ct.on{background:var(--ac);border-color:var(--ac);color:white}
.pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px;padding:13px;overflow-y:auto;flex:1}
.pc{background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:12px 10px;cursor:pointer;transition:all .2s;position:relative}
.pc:hover{background:var(--s3);border-color:var(--ac);transform:translateY(-2px)}
.pc:active{transform:scale(.97)}
.pn{font-size:.83rem;font-weight:600;color:var(--tx);line-height:1.3;margin-bottom:7px;min-height:32px}
.pp2{font-size:1.05rem;font-weight:800;color:var(--ac)}
.pst{font-size:.7rem;color:var(--tx2);margin-top:3px}
.pea{position:absolute;top:7px;right:7px;font-size:.62rem;font-weight:700;padding:2px 5px;border-radius:9px}
.e12{background:rgba(34,197,94,.2);color:var(--green)}
.e16{background:rgba(59,130,246,.2);color:var(--blue)}
.e18{background:rgba(239,68,68,.2);color:var(--red)}
.et1{background:rgba(168,85,247,.2);color:var(--purple)}
.ocbadge{position:absolute;bottom:7px;right:7px;background:rgba(245,200,66,.15);color:var(--gold);font-size:.6rem;font-weight:700;padding:2px 5px;border-radius:7px;border:1px solid rgba(245,200,66,.25)}

/* TICKET */
.tp{background:var(--s1);border:1px solid var(--bd);border-radius:14px;display:flex;flex-direction:column;overflow:hidden}
.th{padding:13px 17px;border-bottom:1px solid var(--bd)}
.tt{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:1px}
.tm{font-size:.72rem;color:var(--tx2);margin-top:2px}
.tis{flex:1;overflow-y:auto;padding:9px}
.te{display:flex;flex-direction:column;align-items:center;justify-content:center;height:180px;color:var(--tx2);font-size:.86rem;gap:7px}
.ti{background:var(--s2);border-radius:var(--rs);padding:9px 11px;margin-bottom:7px}
.tin{font-size:.82rem;font-weight:600;margin-bottom:5px}
.tc{display:flex;align-items:center;gap:5px}
.qb{width:26px;height:26px;border-radius:50%;border:none;background:var(--s3);color:var(--tx);font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:'DM Sans',sans-serif}
.qb:hover{background:var(--ac)}
.qd{min-width:26px;text-align:center;font-weight:700;font-size:.9rem}
.tp2{margin-left:auto;text-align:right}
.tpu{font-size:.7rem;color:var(--tx2)}
.tpt{font-size:.9rem;font-weight:700;color:var(--ac)}
.ob{font-size:.6rem;background:rgba(34,197,94,.2);color:var(--green);padding:2px 6px;border-radius:7px;font-weight:700}
.td{background:transparent;border:none;color:var(--tx2);cursor:pointer;font-size:.9rem;padding:3px;transition:color .2s}
.td:hover{color:var(--red)}
.dsg{background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:var(--rs);padding:7px 9px;margin-top:5px;font-size:.7rem}
.drow{display:flex;justify-content:space-between;padding:2px 0}
.drow.pk{color:var(--green)}
.drow.nm{color:var(--tx2)}
.tf{border-top:1px solid var(--bd);padding:13px 17px}
.tsb{display:flex;justify-content:space-between;font-size:.81rem;color:var(--tx2);margin-bottom:3px}
.ttr{display:flex;justify-content:space-between;align-items:center}
.ttl{font-family:'Bebas Neue',sans-serif;font-size:1.65rem;letter-spacing:1px}
.tta{font-family:'Bebas Neue',sans-serif;font-size:1.9rem;color:var(--ac)}
.bfin{width:100%;background:linear-gradient(135deg,var(--ac),var(--ac2));border:none;border-radius:var(--r);padding:15px;color:white;font-size:1rem;font-weight:800;cursor:pointer;margin-top:11px;transition:all .2s;letter-spacing:.5px;font-family:'DM Sans',sans-serif}
.bfin:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,77,28,.4)}
.bfin:disabled{opacity:.4;cursor:not-allowed;transform:none}
.bclr{width:100%;background:transparent;border:1px solid var(--bd);border-radius:var(--rs);padding:8px;color:var(--tx2);font-size:.81rem;font-weight:600;cursor:pointer;margin-top:6px;transition:all .2s;font-family:'DM Sans',sans-serif}
.bclr:hover{border-color:var(--red);color:var(--red)}

/* MODAL */
.mo{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.mc{background:var(--s1);border:1px solid var(--bd);border-radius:20px;padding:28px;width:100%;max-width:460px;max-height:92vh;overflow-y:auto}
.mc.wide{max-width:660px}
.mt{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;margin-bottom:16px;letter-spacing:1px}
.mg2{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:16px}
.mb{background:var(--s2);border:2px solid var(--bd);border-radius:var(--r);padding:17px 13px;cursor:pointer;text-align:center;transition:all .2s}
.mb.on{border-color:var(--ac);background:rgba(255,77,28,.1)}
.mb:hover{border-color:var(--ac)}
.mi2{font-size:1.9rem;margin-bottom:6px}
.ml{font-weight:700;font-size:.9rem}
.cbox{background:var(--s2);border-radius:var(--r);padding:16px;margin:12px 0;text-align:center}
.clbl{font-size:.76rem;color:var(--tx2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.camt{font-family:'Bebas Neue',sans-serif;font-size:2.3rem;color:var(--green)}
.bs{width:100%;background:transparent;border:1px solid var(--bd);border-radius:var(--rs);padding:10px;color:var(--tx2);font-size:.86rem;cursor:pointer;margin-top:7px;transition:all .2s;font-family:'DM Sans',sans-serif}
.bs:hover{border-color:var(--tx2);color:var(--tx)}

/* SCANNER */
.scp{width:100%;aspect-ratio:4/3;background:var(--s2);border-radius:var(--r);margin:12px 0;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;border:2px dashed var(--bd)}
video{width:100%;height:100%;object-fit:cover;border-radius:calc(var(--r) - 2px)}
.sf{position:absolute;inset:20%;border:3px solid var(--ac);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.5)}
.sl{position:absolute;top:0;left:0;right:0;height:3px;background:var(--ac);animation:sc 2s linear infinite}
@keyframes sc{0%{opacity:0;transform:translateX(-30%)}50%{opacity:1;transform:translateX(30%)}100%{opacity:0;transform:translateX(90%)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.mi{display:flex;gap:7px;margin-top:9px}
.mi input{flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:9px 13px;color:var(--tx);font-size:.9rem;outline:none;font-family:'DM Sans',sans-serif}
.mi input:focus{border-color:var(--ac)}
.bm{background:var(--ac);border:none;border-radius:var(--rs);padding:9px 15px;color:white;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif}

/* ADMIN STATS */
.ag{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:13px;margin-bottom:24px}
.sc{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:20px 17px}
.sv{font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--ac);letter-spacing:1px}
.sl2{font-size:.74rem;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-top:3px}
.stit{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:1px;margin-bottom:13px;color:var(--tx2);margin-top:6px}
.tw{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;overflow-x:auto;margin-bottom:20px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:9px 13px;font-size:.71rem;text-transform:uppercase;letter-spacing:.5px;color:var(--tx2);border-bottom:1px solid var(--bd)}
td{padding:10px 13px;font-size:.84rem;border-bottom:1px solid rgba(255,255,255,.04)}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--s2)}
.sbw{width:65px;height:5px;background:var(--s3);border-radius:3px;overflow:hidden}
.sbr{height:100%;border-radius:3px}
.chip{font-size:.7rem;padding:3px 9px;border-radius:18px;font-weight:700;display:inline-block}
.cg{background:rgba(34,197,94,.15);color:var(--green)}
.cy{background:rgba(245,200,66,.15);color:var(--gold)}
.cr{background:rgba(239,68,68,.15);color:var(--red)}
.cb2{background:rgba(59,130,246,.15);color:var(--blue)}
.cp{background:rgba(168,85,247,.15);color:var(--purple)}

/* ADMIN FORMS */
.iform{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:18px;margin-bottom:16px}
.frow{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:11px;align-items:end;margin-bottom:11px}
.frow .fg{margin-bottom:0}
.badd{background:var(--green);border:none;border-radius:var(--rs);padding:9px 18px;color:white;font-weight:700;cursor:pointer;transition:all .2s;font-size:.86rem;font-family:'DM Sans',sans-serif}
.badd:hover{background:#16a34a}
.bedit{background:transparent;border:1px solid var(--bd);border-radius:6px;padding:4px 10px;color:var(--tx2);font-size:.76rem;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif}
.bedit:hover{border-color:var(--blue);color:var(--blue)}
.bdel{background:transparent;border:1px solid var(--bd);border-radius:6px;padding:4px 10px;color:var(--tx2);font-size:.76rem;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif}
.bdel:hover{border-color:var(--red);color:var(--red)}
.btog{background:transparent;border:1px solid var(--bd);border-radius:6px;padding:4px 10px;font-size:.76rem;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif}
.acell{display:flex;gap:5px;flex-wrap:wrap}
.info-box{background:rgba(245,200,66,.05);border:1px solid rgba(245,200,66,.2);border-radius:var(--rs);padding:13px 15px;margin-bottom:14px;font-size:.8rem;color:var(--tx2);line-height:1.65}

/* SUCCESS */
.smw{text-align:center}
.si2{font-size:3.2rem;margin-bottom:12px}
.st{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:var(--green);margin-bottom:6px}
.sd{font-size:.84rem;color:var(--tx2);line-height:1.6}

/* TOAST */
.twrap{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:999;pointer-events:none}
.toast{background:var(--s3);border:1px solid var(--bd);border-radius:var(--rs);padding:10px 18px;font-size:.84rem;font-weight:600;white-space:nowrap;animation:tin .3s ease}
.te2{border-color:rgba(239,68,68,.4);color:var(--red)}
.tok{border-color:rgba(34,197,94,.4);color:var(--green)}
@keyframes tin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--s3);border-radius:2px}
@media(max-width:768px){.cnt{padding:13px 10px}.pg{grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:7px}}
`;

// ============================================================
// TOAST
// ============================================================
function Toast({ msg, type }) {
  return <div className="twrap"><div className={`toast ${type === "error" ? "te2" : "tok"}`}>{msg}</div></div>;
}

// ============================================================
// LOGIN
// ============================================================
function Login({ usuarios, onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const go = () => {
    const u = usuarios.find(u => u.email === email.trim() && u.password === pass && u.activo);
    if (!u) { setErr("Credenciales incorrectas o usuario inactivo"); return; }
    onLogin(u);
  };
  return (
    <div className="lw">
      <div className="lc">
        <div className="ll">La Petarderia</div>
        <div className="ls">Sistema TPV Profesional 2026</div>
        <div className="lt">Acceso al sistema</div>
        {err && <div className="err-box">{err}</div>}
        <div className="fg"><label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@lapetarderia.es" onKeyDown={e=>e.key==="Enter"&&go()}/>
        </div>
        <div className="fg"><label>Contrasena</label>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&go()}/>
        </div>
        <button className="btn-p" onClick={go}>Entrar al sistema</button>
        <div style={{marginTop:16,padding:11,background:"rgba(255,255,255,.04)",borderRadius:7,fontSize:".73rem",color:"var(--tx2)"}}>
          Admin: admin@lapetarderia.es / admin123 &nbsp;|&nbsp; Empleado: maria@lapetarderia.es / emp123
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APERTURA CAJA
// ============================================================
function AperturaCaja({ usuario, casetas, cajaExistente, onAbrir, onUnirse }) {
  const [dinero, setDinero] = useState("");
  const c = casetas.find(c => c.id === usuario.caseta_id);

  if (cajaExistente) {
    return (
      <div className="apw">
        <div className="apc">
          <div style={{fontSize:"2.5rem",marginBottom:12,textAlign:"center"}}>🔓</div>
          <div className="apt" style={{color:"var(--green)"}}>Caja ya abierta</div>
          <div className="aps">{c?.nombre}</div>
          <div style={{background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.2)",borderRadius:"var(--rs)",padding:"13px 15px",marginBottom:22,fontSize:".84rem",lineHeight:1.65}}>
            Tu compau00f1ero/a <strong style={{color:"var(--tx)"}}>{cajaExistente.abiertoBy}</strong> abrio la caja a las {cajaExistente.abiertoEn}. Todos vuestros tickets se acumularan en la misma caja.
          </div>
          <div style={{background:"var(--s2)",borderRadius:"var(--rs)",padding:"11px 14px",marginBottom:20,fontSize:".82rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"var(--tx2)"}}>Apertura</span><span style={{fontWeight:700}}>{fmt(cajaExistente.apertura)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"var(--tx2)"}}>Tickets hasta ahora</span><span style={{fontWeight:700}}>{cajaExistente.ventas.length}</span></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--tx2)"}}>Total acumulado</span><span style={{fontWeight:700,color:"var(--ac)"}}>{fmt(cajaExistente.totalEfectivo + cajaExistente.totalTarjeta)}</span></div>
          </div>
          <button className="btn-p" onClick={onUnirse}>Unirme al turno y vender</button>
        </div>
      </div>
    );
  }

  return (
    <div className="apw">
      <div className="apc">
        <div className="apt">Apertura de Caja</div>
        <div className="aps">Hola <strong>{usuario.nombre}</strong> — {c?.nombre}</div>
        <div className="aps" style={{marginBottom:20}}>Introduce el efectivo inicial del turno.<br/><span style={{fontSize:".78rem",color:"var(--tx2)"}}>Si un companero se une luego, compartira esta caja.</span></div>
        <input className="bi" type="number" placeholder="0,00" value={dinero} onChange={e=>setDinero(e.target.value)} autoFocus min="0" step="0.01"/>
        <button className="btn-p" onClick={()=>onAbrir(parseFloat(dinero)||0)}>Abrir caja y comenzar</button>
      </div>
    </div>
  );
}

// ============================================================
// SCANNER MODAL — usa @zxing/browser para lectura EAN real
// Se carga dinamicamente desde CDN para no necesitar npm
// ============================================================
function ScannerModal({ productos, onClose, onDetect }) {
  const videoRef = useRef(null);
  const [manual, setManual] = useState("");
  const [estado, setEstado] = useState("iniciando"); // iniciando | escaneando | error
  const [errMsg, setErrMsg] = useState("");
  const [ultimoCod, setUltimoCod] = useState("");
  const readerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const iniciarScanner = async () => {
      // Cargar ZXing desde CDN si no esta disponible
      if (!window.ZXingBrowser) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://unpkg.com/@zxing/browser@0.1.4/umd/index.min.js";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        } catch(e) {
          if (!cancelled) { setEstado("error"); setErrMsg("No se pudo cargar el lector. Usa busqueda manual."); }
          return;
        }
      }

      if (cancelled) return;

      try {
        const hints = new Map();
        // Formatos EAN-13, EAN-8, Code128, Code39
        const { BarcodeFormat, BrowserMultiFormatReader } = window.ZXingBrowser;
        hints.set(2, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ]);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        readerRef.current = reader;

        // Obtener camara trasera
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const camTrasera = devices.find(d =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("trasera") ||
          d.label.toLowerCase().includes("environment")
        ) || devices[devices.length - 1] || devices[0];

        if (!camTrasera) {
          setEstado("error"); setErrMsg("No se encontro camara disponible.");
          return;
        }

        if (cancelled) return;
        setEstado("escaneando");

        await reader.decodeFromVideoDevice(
          camTrasera.deviceId,
          videoRef.current,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              const codigo = result.getText();
              if (codigo === ultimoCod) return; // evitar duplicados
              setUltimoCod(codigo);

              // Buscar en catalogo
              const prod = productos.find(p => p.activo && p.codigo === codigo);
              if (prod) {
                playBeep();
                if (navigator.vibrate) navigator.vibrate(80);
                onDetect(prod);
              } else {
                // Codigo leido pero no en catalogo — mostrar el codigo para busqueda manual
                setManual(codigo);
                setErrMsg("Codigo " + codigo + " no esta en el catalogo. Buscalo manualmente.");
                setTimeout(() => setErrMsg(""), 4000);
              }
            }
          }
        );
      } catch(e) {
        if (!cancelled) {
          setEstado("error");
          setErrMsg(e.message?.includes("Permission") || e.name === "NotAllowedError"
            ? "Permiso de camara denegado. Activa la camara en los ajustes del navegador."
            : "Error al iniciar la camara: " + (e.message || e.name));
        }
      }
    };

    iniciarScanner();

    return () => {
      cancelled = true;
      try { readerRef.current?.reset(); } catch(e) {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch(e) {}
    };
  }, []);

  const buscarManual = () => {
    const q = manual.trim();
    if (!q) return;
    const p = productos.find(p => p.activo && (
      p.codigo === q ||
      p.nombre.toLowerCase().includes(q.toLowerCase())
    ));
    if (p) { playBeep(); onDetect(p); }
    else setErrMsg("No encontrado: " + q);
  };

  return (
    <div className="mo" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mc">
        <div className="mt">Escanear Producto</div>

        {/* Visor de camara */}
        <div className="scp" style={{position:"relative",background:"#000"}}>
          <video ref={videoRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"calc(var(--r) - 2px)"}}/>

          {/* Marco de escaneo */}
          {estado === "escaneando" && (
            <>
              <div style={{position:"absolute",inset:"15%",border:"3px solid var(--ac)",borderRadius:12,boxShadow:"0 0 0 9999px rgba(0,0,0,.45)",pointerEvents:"none"}}/>
              <div style={{position:"absolute",top:"15%",left:"15%",right:"15%",height:3,background:"linear-gradient(90deg,transparent,var(--ac),transparent)",animation:"sc 1.8s ease-in-out infinite",pointerEvents:"none"}}/>
            </>
          )}

          {/* Estado iniciando */}
          {estado === "iniciando" && (
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.7)",gap:10}}>
              <div style={{fontSize:"2rem",animation:"spin 1s linear infinite"}}>⟳</div>
              <span style={{fontSize:".82rem",color:"var(--tx2)"}}>Iniciando camara...</span>
            </div>
          )}

          {/* Error camara */}
          {estado === "error" && (
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.85)",gap:8,padding:16,textAlign:"center"}}>
              <span style={{fontSize:"1.8rem"}}>📷</span>
              <span style={{fontSize:".82rem",color:"var(--red)"}}>{errMsg}</span>
            </div>
          )}
        </div>

        {/* Indicador estado */}
        {estado === "escaneando" && (
          <div style={{textAlign:"center",fontSize:".75rem",color:"var(--green)",margin:"6px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"var(--green)",display:"inline-block",animation:"pulse 1s ease-in-out infinite"}}/>
            Leyendo codigos EAN en tiempo real...
          </div>
        )}

        {/* Error de producto no encontrado */}
        {errMsg && estado !== "error" && (
          <div className="err-box" style={{marginTop:6,marginBottom:0}}>{errMsg}</div>
        )}

        {/* Busqueda manual */}
        <div style={{marginTop:10,fontSize:".75rem",color:"var(--tx2)",marginBottom:5}}>O introduce el codigo / nombre manualmente:</div>
        <div className="mi">
          <input
            placeholder="Codigo EAN o nombre del producto..."
            value={manual}
            onChange={e=>setManual(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&buscarManual()}
          />
          <button className="bm" onClick={buscarManual}>Buscar</button>
        </div>

        <button className="bs" style={{marginTop:12}} onClick={onClose}>Cerrar escaner</button>
      </div>
    </div>
  );
}

// ============================================================
// TICKET ITEM con desglose de packs
// ============================================================
function TicketItem({ item, ofertas, onQty, onDel }) {
  const [open, setOpen] = useState(false);
  const { total, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas);
  const hayOferta = desglose !== null;

  return (
    <div className="ti" style={{display:"flex",alignItems:"center",gap:8}}>
      {/* Contenido principal */}
      <div style={{flex:1,minWidth:0}}>
        <div className="tin">{item.nombre}</div>
        <div className="tc">
          <button className="qb" onClick={()=>onQty(item.id,-1)}>-</button>
          <span className="qd">{item.cantidad}</span>
          <button className="qb" onClick={()=>onQty(item.id,1)}>+</button>
          {hayOferta && (
            <span className="ob" style={{cursor:"pointer"}} onClick={()=>setOpen(!open)}>
              OFERTA {open?"▲":"▼"}
            </span>
          )}
          <div className="tp2">
            <div className="tpu">{hayOferta?"con oferta":fmt(item.precio)+" u."}</div>
            <div className="tpt">{fmt(total)}</div>
          </div>
        </div>
        {hayOferta && open && (
          <div className="dsg">
            {desglose.map((d,i) => (
              <div key={i} className={`drow ${d.tipo==="pack"?"pk":"nm"}`}>
                <span>
                  {d.tipo==="pack"
                    ? `${d.packs} pack ${d.etiqueta} = ${d.unidades}u. a ${fmt(d.precioU)}/u.`
                    : `${d.unidades}u. a precio normal (${fmt(d.precioU)}/u.)`
                  }
                </span>
                <span>{fmt(d.coste)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Botón eliminar — extremo derecho, centrado verticalmente */}
      <button
        onClick={()=>onDel(item.id)}
        style={{flexShrink:0,width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",color:"var(--red)",fontSize:"1rem",cursor:"pointer",transition:"all .2s",alignSelf:"center"}}
        onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,.28)";e.currentTarget.style.borderColor="var(--red)"}}
        onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,.1)";e.currentTarget.style.borderColor="rgba(239,68,68,.25)"}}>
        ✕
      </button>
    </div>
  );
}

// ============================================================
// FINALIZAR VENTA
// ============================================================
function FinalizarModal({ total, onConfirm, onClose }) {
  const [metodo, setMetodo] = useState("");
  const [recibido, setRecibido] = useState("");
  const cambio = metodo==="efectivo" ? Math.max(0,(parseFloat(recibido)||0)-total) : 0;
  return (
    <div className="mo">
      <div className="mc">
        <div className="mt">Finalizar Venta</div>
        <div style={{fontSize:".84rem",color:"var(--tx2)",marginBottom:10}}>Total a cobrar:</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2.8rem",color:"var(--ac)",marginBottom:16}}>{fmt(total)}</div>
        <div style={{fontSize:".76rem",color:"var(--tx2)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Metodo de pago</div>
        <div className="mg2">
          <div className={`mb ${metodo==="efectivo"?"on":""}`} onClick={()=>setMetodo("efectivo")}><div className="mi2">💵</div><div className="ml">Efectivo</div></div>
          <div className={`mb ${metodo==="tarjeta"?"on":""}`} onClick={()=>setMetodo("tarjeta")}><div className="mi2">💳</div><div className="ml">Tarjeta</div></div>
        </div>
        {metodo==="efectivo" && (
          <>
            <div className="fg"><label>Dinero recibido</label>
              <input type="number" className="bi" style={{fontSize:"1.5rem",marginBottom:0}} value={recibido} onChange={e=>setRecibido(e.target.value)} placeholder="0,00" autoFocus min={total} step=".5"/>
            </div>
            <div className="cbox"><div className="clbl">Cambio a devolver</div><div className="camt">{fmt(cambio)}</div></div>
          </>
        )}
        <button className="btn-p" disabled={!metodo||(metodo==="efectivo"&&(parseFloat(recibido)||0)<total)} onClick={()=>onConfirm({metodo,recibido:parseFloat(recibido)||total,cambio})}>
          Confirmar Venta
        </button>
        <button className="bs" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ============================================================
// TPV EMPLEADO
// ============================================================
function TPV({ usuario, casetas, productos, ofertas, caja, onVenta, onCerrarCaja }) {
  const [ticket, setTicket] = useState([]);
  const [busq, setBusq] = useState("");
  const [cat, setCat] = useState("Todos");
  const [showScan, setShowScan] = useState(false);
  const [showFin, setShowFin] = useState(false);
  const [showOk, setShowOk] = useState(null);
  const [toast, setToast] = useState(null);
  const caseta = casetas.find(c => c.id === usuario.caseta_id);

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),2500); };

  const prodsFiltrados = productos.filter(p => {
    if (!p.activo) return false;
    if (cat !== "Todos" && p.categoria !== cat) return false;
    if (busq && !p.nombre.toLowerCase().includes(busq.toLowerCase()) && !p.codigo.includes(busq)) return false;
    return true;
  });

  const agregar = useCallback((prod) => {
    if (prod.stock <= 0) { showToast("Sin stock disponible","error"); return; }
    setTicket(prev => {
      const idx = prev.findIndex(i => i.id === prod.id);
      if (idx >= 0) {
        if (prev[idx].cantidad >= prod.stock) { showToast("Stock insuficiente","error"); return prev; }
        const n = [...prev]; n[idx] = {...n[idx], cantidad: n[idx].cantidad + 1}; return n;
      }
      return [...prev, {...prod, cantidad: 1}];
    });
    setShowScan(false);
  }, []);

  const cambiarQty = (id, delta) => setTicket(prev => prev.map(i => {
    if (i.id !== id) return i;
    const q = i.cantidad + delta;
    if (q <= 0) return null;
    if (q > i.stock) { showToast("Stock insuficiente","error"); return i; }
    return {...i, cantidad: q};
  }).filter(Boolean));

  const total = ticket.reduce((s,i) => s + calcularPrecio(i.id, i.cantidad, i.precio, ofertas).total, 0);

  const confirmar = (pago) => {
    const venta = {id:Date.now(),fecha:getNow(),empleado:usuario.nombre,caseta:caseta?.nombre,metodo:pago.metodo,total,cambio:pago.cambio};
    onVenta(venta);
    setShowFin(false); setShowOk(venta); setTicket([]);
  };

  const eaBadge = (p) => {
    if (p.edad_minima === 0) return <span className="pea et1">T1</span>;
    if (p.edad_minima === 12) return <span className="pea e12">12+</span>;
    if (p.edad_minima === 16) return <span className="pea e16">16+</span>;
    return <span className="pea e18">18+</span>;
  };

  return (
    <>
      <div style={{padding:"9px 20px",background:"var(--s1)",borderBottom:"1px solid var(--bd)",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <span style={{fontSize:".81rem"}}><span style={{color:"var(--tx2)"}}>Caseta: </span><strong>{caseta?.nombre}</strong></span>
        <span style={{fontSize:".78rem",color:"var(--tx2)"}}>|</span>
        <span style={{fontSize:".78rem",color:"var(--tx2)"}}>Tickets turno: <strong style={{color:"var(--green)"}}>{caja.ventas.length}</strong></span>
        <span style={{fontSize:".78rem",color:"var(--tx2)"}}>Total: <strong style={{color:"var(--ac)"}}>{fmt(caja.totalEfectivo + caja.totalTarjeta)}</strong></span>
        {caja.abiertoBy !== usuario.nombre && <span style={{fontSize:".76rem",color:"var(--tx2)"}}>Caja abierta por <strong style={{color:"var(--tx)"}}>{caja.abiertoBy}</strong></span>}
        <button className="btn-o" style={{marginLeft:"auto"}} onClick={onCerrarCaja}>Cerrar Caja</button>
      </div>
      <div className="cnt">
        <div className="tpvg">
          <div className="pp">
            <div className="sb">
              <input className="si" placeholder="Buscar producto o codigo EAN..." value={busq} onChange={e=>setBusq(e.target.value)}/>
              <button className="bsc" onClick={()=>setShowScan(true)}>📷</button>
            </div>
            <div className="cb">
              {CATEGORIAS.map(c=><button key={c} className={`ct ${cat===c?"on":""}`} onClick={()=>setCat(c)}>{c}</button>)}
            </div>
            <div className="pg">
              {prodsFiltrados.map(p => {
                const enT = ticket.find(i => i.id === p.id);
                const tieneOferta = ofertas.some(o => o.producto_id === p.id);
                return (
                  <div key={p.id} className="pc" onClick={()=>agregar(p)}
                    style={{opacity:p.stock===0?.4:1,outline:enT?"2px solid var(--ac)":"none"}}>
                    {eaBadge(p)}
                    <div className="pn">{p.nombre}</div>
                    <div className="pp2">{fmt(p.precio)}</div>
                    <div className="pst">{p.stock===0?"Agotado":`Stock: ${p.stock}`}{enT&&<span style={{color:"var(--green)"}}> · {enT.cantidad}</span>}</div>
                    {tieneOferta && <span className="ocbadge">OFERTA</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="tp">
            <div className="th">
              <div className="tt">Ticket de Venta</div>
              <div className="tm">{getNow()} · {usuario.nombre}</div>
            </div>
            <div className="tis">
              {ticket.length===0 ? (
                <div className="te"><span style={{fontSize:"2.2rem",opacity:.4}}>🛒</span><span>Ticket vacio</span><span style={{fontSize:".71rem"}}>Toca un producto o escanea</span></div>
              ) : ticket.map(item => (
                <TicketItem key={item.id} item={item} ofertas={ofertas} onQty={cambiarQty} onDel={id=>setTicket(p=>p.filter(i=>i.id!==id))}/>
              ))}
            </div>
            <div className="tf">
              <div className="tsb"><span>Articulos</span><span>{ticket.reduce((s,i)=>s+i.cantidad,0)}</span></div>
              <div className="ttr"><span className="ttl">TOTAL</span><span className="tta">{fmt(total)}</span></div>
              <button className="bfin" disabled={ticket.length===0} onClick={()=>setShowFin(true)}>Finalizar Venta →</button>
              {ticket.length>0&&<button className="bclr" onClick={()=>setTicket([])}>Limpiar ticket</button>}
            </div>
          </div>
        </div>
      </div>
      {showScan&&<ScannerModal productos={productos} onClose={()=>setShowScan(false)} onDetect={agregar}/>}
      {showFin&&<FinalizarModal total={total} onConfirm={confirmar} onClose={()=>setShowFin(false)}/>}
      {showOk&&(
        <div className="mo">
          <div className="mc smw">
            <div className="si2">🎉</div>
            <div className="st">Venta Confirmada!</div>
            <div className="sd">
              {showOk.fecha}<br/>Empleado: {showOk.empleado}<br/>
              Total: <strong>{fmt(showOk.total)}</strong><br/>
              {showOk.metodo==="efectivo"?`Efectivo · Cambio: ${fmt(showOk.cambio)}`:"Tarjeta"}
            </div>
            <button className="btn-p" style={{marginTop:20}} onClick={()=>setShowOk(null)}>Nueva Venta</button>
          </div>
        </div>
      )}
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
    </>
  );
}

// ============================================================
// ADMIN — GESTION PRODUCTOS
// ============================================================
function GestionProductos({ productos, setProductos }) {
  const CATS = ["Petardos","Truenos","Bengalas","Cracker","Terrestres","Fuentes","Efectos","Packs","Accesorios"];
  const F0 = {nombre:"",precio:"",categoria:"Petardos",edad_minima:"16",stock:"",codigo:"",activo:true};
  const [form, setForm] = useState(F0);
  const [editId, setEditId] = useState(null);
  const [busq, setBusq] = useState("");
  const [msg, setMsg] = useState(null);
  const show = (txt,ok=true)=>{setMsg({txt,ok});setTimeout(()=>setMsg(null),3000);};

  const guardar = () => {
    if (!form.nombre.trim()||!form.precio||!form.codigo.trim()) { show("Nombre, precio y codigo son obligatorios",false); return; }
    if (editId) {
      setProductos(prev=>prev.map(p=>p.id===editId
        ?{...p,...form,precio:parseFloat(form.precio),edad_minima:parseInt(form.edad_minima),stock:parseInt(form.stock)||0}
        :p));
      show("Producto actualizado");
    } else {
      if (productos.find(p=>p.codigo===form.codigo.trim())) { show("Ese codigo ya existe",false); return; }
      setProductos(prev=>[...prev,{...form,id:newId(prev),precio:parseFloat(form.precio),edad_minima:parseInt(form.edad_minima),stock:parseInt(form.stock)||0,activo:true}]);
      show("Producto anadido");
    }
    setForm(F0); setEditId(null);
  };
  const editar = (p) => { setForm({nombre:p.nombre,precio:String(p.precio),categoria:p.categoria,edad_minima:String(p.edad_minima),stock:String(p.stock),codigo:p.codigo,activo:p.activo}); setEditId(p.id); };
  const toggle = (id) => setProductos(prev=>prev.map(p=>p.id===id?{...p,activo:!p.activo}:p));
  const eliminar = (id) => { if (window.confirm("Eliminar producto definitivamente?")) setProductos(prev=>prev.filter(p=>p.id!==id)); };

  const prods = productos.filter(p=>!busq||p.nombre.toLowerCase().includes(busq.toLowerCase())||p.codigo.includes(busq));

  const eaLabel = (m) => m===0?"T1":m===12?"12+":m===16?"16+":"18+";
  const eaClass = (m) => m===0?"cp":m===12?"cg":m===16?"cb2":"cr";

  return (
    <div>
      <div className="stit">{editId?"Editar Producto":"Nuevo Producto"}</div>
      {msg&&<div className={msg.ok?"ok-box":"err-box"}>{msg.txt}</div>}
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre del producto"/></div>
          <div className="fg"><label>Precio (EUR)</label><input type="number" value={form.precio} onChange={e=>setForm({...form,precio:e.target.value})} placeholder="0,00" min="0" step=".01"/></div>
          <div className="fg"><label>Codigo EAN</label><input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value})} placeholder="8410278000"/></div>
          <div className="fg"><label>Categoria</label>
            <select value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>
              {CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg"><label>Edad minima</label>
            <select value={form.edad_minima} onChange={e=>setForm({...form,edad_minima:e.target.value})}>
              <option value="0">T1 (requiere DNI)</option>
              <option value="12">12+</option>
              <option value="16">16+</option>
              <option value="18">18+</option>
            </select>
          </div>
          <div className="fg"><label>Stock inicial</label><input type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} placeholder="0" min="0"/></div>
        </div>
        <div style={{display:"flex",gap:9}}>
          <button className="badd" onClick={guardar}>{editId?"Guardar cambios":"Anadir producto"}</button>
          {editId&&<button className="bs" style={{width:"auto",marginTop:0}} onClick={()=>{setEditId(null);setForm(F0);}}>Cancelar</button>}
        </div>
      </div>
      <div className="stit">Catalogo ({productos.length} productos)</div>
      <div style={{marginBottom:11}}>
        <input className="si" placeholder="Buscar en catalogo..." value={busq} onChange={e=>setBusq(e.target.value)} style={{maxWidth:340}}/>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>Codigo</th><th>Categoria</th><th>Precio</th><th>Edad</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {prods.map(p=>(
              <tr key={p.id} style={{opacity:p.activo?1:.5}}>
                <td style={{fontWeight:600}}>{p.nombre}</td>
                <td style={{color:"var(--tx2)",fontSize:".76rem"}}>{p.codigo}</td>
                <td style={{color:"var(--tx2)"}}>{p.categoria}</td>
                <td style={{color:"var(--ac)",fontWeight:700}}>{fmt(p.precio)}</td>
                <td><span className={`chip ${eaClass(p.edad_minima)}`}>{eaLabel(p.edad_minima)}</span></td>
                <td style={{color:p.stock===0?"var(--red)":p.stock<10?"var(--gold)":"var(--green)",fontWeight:700}}>{p.stock}</td>
                <td><span className={`chip ${p.activo?"cg":"cr"}`}>{p.activo?"Activo":"Inactivo"}</span></td>
                <td>
                  <div className="acell">
                    <button className="bedit" onClick={()=>editar(p)}>Editar</button>
                    <button className="btog" style={{color:p.activo?"var(--gold)":"var(--green)"}} onClick={()=>toggle(p.id)}>{p.activo?"Desact.":"Activar"}</button>
                    <button className="bdel" onClick={()=>eliminar(p.id)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN — GESTION OFERTAS
// ============================================================
function GestionOfertas({ ofertas, setOfertas, productos }) {
  const F0 = {producto_id:"",etiqueta:"",cantidad_pack:"",precio_pack:""};
  const [form, setForm] = useState(F0);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState(null);
  const show = (txt,ok=true)=>{setMsg({txt,ok});setTimeout(()=>setMsg(null),3000);};

  const precioU = (pack,cant) => cant && pack ? (parseFloat(pack)/parseInt(cant)) : 0;

  const guardar = () => {
    if (!form.producto_id||!form.cantidad_pack||!form.precio_pack||!form.etiqueta) { show("Todos los campos son obligatorios",false); return; }
    const obj = {...form,producto_id:parseInt(form.producto_id),cantidad_pack:parseInt(form.cantidad_pack),precio_pack:parseFloat(form.precio_pack)};
    if (editId) {
      setOfertas(prev=>prev.map(o=>o.id===editId?{...o,...obj}:o));
      show("Oferta actualizada");
    } else {
      setOfertas(prev=>[...prev,{...obj,id:newId(prev)}]);
      show("Oferta anadida");
    }
    setForm(F0); setEditId(null);
  };
  const editar=(o)=>{setForm({producto_id:String(o.producto_id),etiqueta:o.etiqueta,cantidad_pack:String(o.cantidad_pack),precio_pack:String(o.precio_pack)});setEditId(o.id);};
  const eliminar=(id)=>{if(window.confirm("Eliminar esta oferta?"))setOfertas(prev=>prev.filter(o=>o.id!==id));};
  const prodActivos = productos.filter(p=>p.activo);
  const pu = precioU(form.precio_pack, form.cantidad_pack);
  const prodSel = form.producto_id ? productos.find(p=>p.id===parseInt(form.producto_id)) : null;

  return (
    <div>
      <div className="stit">{editId?"Editar Oferta":"Nueva Oferta"}</div>
      <div className="info-box">
        <strong style={{color:"var(--gold)"}}>Como funcionan los packs:</strong><br/>
        Cada oferta es un pack de <em>N unidades por X euros</em>. Si el cliente lleva una cantidad que NO es multiple exacto, el resto va a precio normal.<br/>
        Ejemplo — Oferta <strong>4 x 5€</strong>: llevar 9 = 2 packs de 4 (8u a 5€/pack) + 1u a precio normal.<br/>
        Si hay varias ofertas para el mismo producto (ej: 4x5 y 10x10), se aplican primero los packs mayores.
      </div>
      {msg&&<div className={msg.ok?"ok-box":"err-box"}>{msg.txt}</div>}
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Producto</label>
            <select value={form.producto_id} onChange={e=>setForm({...form,producto_id:e.target.value})}>
              <option value="">-- Seleccionar --</option>
              {prodActivos.map(p=><option key={p.id} value={p.id}>{p.nombre} ({fmt(p.precio)})</option>)}
            </select>
          </div>
          <div className="fg"><label>Etiqueta visible</label><input value={form.etiqueta} onChange={e=>setForm({...form,etiqueta:e.target.value})} placeholder="Ej: 4 x 5€"/></div>
          <div className="fg"><label>Unidades del pack</label><input type="number" value={form.cantidad_pack} onChange={e=>setForm({...form,cantidad_pack:e.target.value})} placeholder="4" min="2"/></div>
          <div className="fg"><label>Precio total pack (EUR)</label><input type="number" value={form.precio_pack} onChange={e=>setForm({...form,precio_pack:e.target.value})} placeholder="5.00" min="0" step=".01"/></div>
        </div>
        {form.cantidad_pack&&form.precio_pack&&(
          <div style={{fontSize:".8rem",marginBottom:11,display:"flex",gap:18,flexWrap:"wrap"}}>
            <span style={{color:"var(--gold)"}}>Precio/u. con oferta: <strong>{fmt(pu)}</strong></span>
            {prodSel&&<span style={{color:"var(--green)"}}>Ahorro vs. normal: <strong>{fmt(prodSel.precio-pu)}/u.</strong></span>}
          </div>
        )}
        <div style={{display:"flex",gap:9}}>
          <button className="badd" onClick={guardar}>{editId?"Guardar cambios":"Anadir oferta"}</button>
          {editId&&<button className="bs" style={{width:"auto",marginTop:0}} onClick={()=>{setEditId(null);setForm(F0);}}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Ofertas activas ({ofertas.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Etiqueta</th><th>Pack</th><th>Precio pack</th><th>EUR/unidad</th><th>Precio normal</th><th>Ahorro/u.</th><th>Acciones</th></tr></thead>
          <tbody>
            {ofertas.length===0
              ? <tr><td colSpan={8} style={{textAlign:"center",color:"var(--tx2)",padding:24}}>No hay ofertas configuradas</td></tr>
              : ofertas.map(o=>{
                const p=productos.find(x=>x.id===o.producto_id);
                const pu2=o.precio_pack/o.cantidad_pack;
                const ahorro=p?p.precio-pu2:0;
                return (
                  <tr key={o.id}>
                    <td style={{fontWeight:600}}>{p?p.nombre:<span style={{color:"var(--red)"}}>Producto eliminado</span>}</td>
                    <td><span className="chip cy">{o.etiqueta}</span></td>
                    <td style={{textAlign:"center",fontWeight:700}}>{o.cantidad_pack}u.</td>
                    <td style={{color:"var(--ac)",fontWeight:700}}>{fmt(o.precio_pack)}</td>
                    <td style={{color:"var(--gold)",fontWeight:700}}>{fmt(pu2)}</td>
                    <td style={{color:"var(--tx2)"}}>{p?fmt(p.precio):"—"}</td>
                    <td style={{color:ahorro>0?"var(--green)":"var(--red)",fontWeight:700}}>{ahorro>0?`-${fmt(ahorro)}`:"—"}</td>
                    <td><div className="acell">
                      <button className="bedit" onClick={()=>editar(o)}>Editar</button>
                      <button className="bdel" onClick={()=>eliminar(o.id)}>Eliminar</button>
                    </div></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN — GESTION USUARIOS
// ============================================================
function GestionUsuarios({ usuarios, setUsuarios, casetas }) {
  const F0 = {nombre:"",email:"",password:"",rol:"EMPLEADO",caseta_id:""};
  const [form, setForm] = useState(F0);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState(null);
  const show = (txt,ok=true)=>{setMsg({txt,ok});setTimeout(()=>setMsg(null),3000);};

  const guardar = () => {
    if (!form.nombre.trim()||!form.email.trim()) { show("Nombre y email son obligatorios",false); return; }
    if (!editId&&!form.password.trim()) { show("La contrasena es obligatoria para nuevos usuarios",false); return; }
    if (form.rol==="EMPLEADO"&&!form.caseta_id) { show("El empleado debe tener una caseta asignada",false); return; }
    if (editId) {
      setUsuarios(prev=>prev.map(u=>u.id===editId
        ?{...u,nombre:form.nombre,email:form.email,rol:form.rol,caseta_id:form.caseta_id?parseInt(form.caseta_id):null,...(form.password?{password:form.password}:{})}
        :u));
      show("Usuario actualizado");
    } else {
      if (usuarios.find(u=>u.email===form.email.trim())) { show("Ese email ya existe",false); return; }
      setUsuarios(prev=>[...prev,{...form,id:newId(prev),caseta_id:form.caseta_id?parseInt(form.caseta_id):null,activo:true}]);
      show("Usuario creado");
    }
    setForm(F0); setEditId(null);
  };
  const editar=(u)=>{setForm({nombre:u.nombre,email:u.email,password:"",rol:u.rol,caseta_id:u.caseta_id?String(u.caseta_id):""});setEditId(u.id);};
  const toggle=(id)=>setUsuarios(prev=>prev.map(u=>u.id===id?{...u,activo:!u.activo}:u));
  const eliminar=(id)=>{if(window.confirm("Eliminar usuario definitivamente?"))setUsuarios(prev=>prev.filter(u=>u.id!==id));};

  return (
    <div>
      <div className="stit">{editId?"Editar Usuario":"Nuevo Usuario"}</div>
      <div className="info-box">
        <strong style={{color:"var(--gold)"}}>Roles del sistema:</strong><br/>
        <strong>ADMIN</strong>: Acceso completo al panel, gestion de productos, ofertas, usuarios y estadisticas globales. No tiene caseta asignada.<br/>
        <strong>EMPLEADO</strong>: Solo accede al TPV de su caseta asignada. Puede abrir/cerrar caja y crear ventas.
      </div>
      {msg&&<div className={msg.ok?"ok-box":"err-box"}>{msg.txt}</div>}
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre completo</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre Apellidos"/></div>
          <div className="fg"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="usuario@lapetarderia.es"/></div>
          <div className="fg"><label>{editId?"Nueva contrasena (vacio=no cambiar)":"Contrasena"}</label><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••"/></div>
          <div className="fg"><label>Rol</label>
            <select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value,caseta_id:e.target.value==="ADMIN"?"":form.caseta_id})}>
              <option value="EMPLEADO">Empleado</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          {form.rol==="EMPLEADO"&&(
            <div className="fg"><label>Caseta asignada</label>
              <select value={form.caseta_id} onChange={e=>setForm({...form,caseta_id:e.target.value})}>
                <option value="">-- Seleccionar --</option>
                {casetas.filter(c=>c.activa).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:9}}>
          <button className="badd" onClick={guardar}>{editId?"Guardar cambios":"Crear usuario"}</button>
          {editId&&<button className="bs" style={{width:"auto",marginTop:0}} onClick={()=>{setEditId(null);setForm(F0);}}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Usuarios del sistema ({usuarios.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Caseta</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {usuarios.map(u=>{
              const c=casetas.find(c=>c.id===u.caseta_id);
              return (
                <tr key={u.id} style={{opacity:u.activo?1:.5}}>
                  <td style={{fontWeight:600}}>{u.nombre}</td>
                  <td style={{color:"var(--tx2)",fontSize:".8rem"}}>{u.email}</td>
                  <td><span className={`chip ${u.rol==="ADMIN"?"cy":"cb2"}`}>{u.rol}</span></td>
                  <td style={{color:"var(--tx2)"}}>{c?.nombre||"— Global —"}</td>
                  <td><span className={`chip ${u.activo?"cg":"cr"}`}>{u.activo?"Activo":"Inactivo"}</span></td>
                  <td>
                    <div className="acell">
                      <button className="bedit" onClick={()=>editar(u)}>Editar</button>
                      <button className="btog" style={{color:u.activo?"var(--gold)":"var(--green)"}} onClick={()=>toggle(u.id)}>{u.activo?"Desact.":"Activar"}</button>
                      <button className="bdel" onClick={()=>eliminar(u.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN — DASHBOARD
// ============================================================
function Dashboard({ productos, ofertas, usuarios, casetas }) {
  const stockBajo = productos.filter(p=>p.activo&&p.stock<15).length;
  const ventasDemo = [
    {id:1,fecha:"04/03/2026 10:23",empleado:"Maria Garcia",caseta:"Ruzafa",total:24.50,metodo:"efectivo",items:5},
    {id:2,fecha:"04/03/2026 10:45",empleado:"Carlos Lopez",caseta:"Massanassa",total:12.00,metodo:"tarjeta",items:3},
    {id:3,fecha:"04/03/2026 11:12",empleado:"Ana Martinez",caseta:"Cabanyal",total:44.99,metodo:"efectivo",items:1},
    {id:4,fecha:"04/03/2026 11:35",empleado:"Maria Garcia",caseta:"Ruzafa",total:8.50,metodo:"tarjeta",items:4},
  ];
  const totalHoy = ventasDemo.reduce((s,v)=>s+v.total,0);

  return (
    <>
      <div className="ag">
        <div className="sc"><div className="sv">{fmt(totalHoy)}</div><div className="sl2">Ventas hoy</div></div>
        <div className="sc"><div className="sv">{ventasDemo.length}</div><div className="sl2">Tickets hoy</div></div>
        <div className="sc"><div className="sv" style={{color:stockBajo>5?"var(--red)":"var(--ac)"}}>{stockBajo}</div><div className="sl2">Stock bajo</div></div>
        <div className="sc"><div className="sv">{casetas.filter(c=>c.activa).length}</div><div className="sl2">Casetas</div></div>
        <div className="sc"><div className="sv">{usuarios.filter(u=>u.activo&&u.rol==="EMPLEADO").length}</div><div className="sl2">Empleados</div></div>
        <div className="sc"><div className="sv">{ofertas.length}</div><div className="sl2">Ofertas activas</div></div>
      </div>
      <div className="stit">Ventas recientes</div>
      <div className="tw">
        <table>
          <thead><tr><th>Fecha</th><th>Empleado</th><th>Caseta</th><th>Items</th><th>Metodo</th><th>Total</th></tr></thead>
          <tbody>
            {ventasDemo.map(v=>(
              <tr key={v.id}>
                <td style={{color:"var(--tx2)"}}>{v.fecha}</td><td>{v.empleado}</td>
                <td style={{color:"var(--tx2)"}}>{v.caseta}</td><td>{v.items}</td>
                <td>{v.metodo==="efectivo"?"Efectivo":"Tarjeta"}</td>
                <td style={{fontWeight:700,color:"var(--ac)"}}>{fmt(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stit">Stock critico</div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Categoria</th><th>Stock</th><th>Estado</th></tr></thead>
          <tbody>
            {productos.filter(p=>p.activo&&p.stock<20).sort((a,b)=>a.stock-b.stock).slice(0,8).map(p=>(
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td style={{color:"var(--tx2)"}}>{p.categoria}</td>
                <td>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    <div className="sbw"><div className="sbr" style={{width:`${Math.min(100,p.stock/50*100)}%`,background:p.stock<10?"var(--red)":p.stock<20?"var(--gold)":"var(--green)"}}/></div>
                    <span style={{color:p.stock<10?"var(--red)":"var(--gold)",fontWeight:700}}>{p.stock}</span>
                  </div>
                </td>
                <td><span className={`chip ${p.stock===0?"cr":"cy"}`}>{p.stock===0?"Agotado":"Stock bajo"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
// ADMIN PANEL
// ============================================================
function AdminPanel({ usuario, usuarios, setUsuarios, productos, setProductos, ofertas, setOfertas, casetas, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const TABS = [["dashboard","Dashboard"],["productos","Productos"],["ofertas","Ofertas"],["usuarios","Usuarios"],["casetas","Casetas"]];
  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">La Petarderia TPV</div>
        <div className="ti">
          <span style={{fontSize:".81rem",color:"var(--tx2)"}}>{usuario.nombre}</span>
          <span className="badge ba">Admin</span>
          <button className="btn-o" onClick={onLogout}>Salir</button>
        </div>
      </div>
      <div className="navtabs">
        {TABS.map(([k,l])=><button key={k} className={`ntab ${tab===k?"on":""}`} onClick={()=>setTab(k)}>{l}</button>)}
      </div>
      <div className="cnt">
        {tab==="dashboard"&&<Dashboard productos={productos} ofertas={ofertas} usuarios={usuarios} casetas={casetas}/>}
        {tab==="productos"&&<GestionProductos productos={productos} setProductos={setProductos}/>}
        {tab==="ofertas"&&<GestionOfertas ofertas={ofertas} setOfertas={setOfertas} productos={productos}/>}
        {tab==="usuarios"&&<GestionUsuarios usuarios={usuarios} setUsuarios={setUsuarios} casetas={casetas}/>}
        {tab==="casetas"&&(
          <>
            <div className="stit">Casetas activas</div>
            <div className="tw">
              <table>
                <thead><tr><th>Nombre</th><th>Empleados</th><th>Estado</th></tr></thead>
                <tbody>
                  {casetas.map(c=>{
                    const emps=usuarios.filter(u=>u.caseta_id===c.id&&u.activo).length;
                    return (
                      <tr key={c.id}>
                        <td style={{fontWeight:600}}>{c.nombre}</td>
                        <td>{emps}</td>
                        <td><span className={`chip ${c.activa?"cg":"cr"}`}>{c.activa?"Activa":"Inactiva"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CIERRE CAJA — muestra ventas de TODA la caseta en el turno
// ============================================================
function CierreCajaModal({ usuario, cajaCaseta, casetas, onClose, onCerrar }) {
  const [contado, setContado] = useState("");
  const caseta = casetas.find(c => c.id === cajaCaseta.caseta_id);
  const esperado = cajaCaseta.apertura + cajaCaseta.totalEfectivo;
  const dif = (parseFloat(contado)||0) - esperado;

  // Empleados que han vendido en este turno
  const empleadosQueVendieron = [...new Set(cajaCaseta.ventas.map(v => v.empleado))];

  return (
    <div className="mo">
      <div className="mc">
        <div className="mt">Cierre de Caja</div>

        {/* Info de caseta y turno */}
        <div style={{background:"rgba(245,200,66,.06)",border:"1px solid rgba(245,200,66,.2)",borderRadius:"var(--rs)",padding:"10px 13px",marginBottom:14,fontSize:".8rem"}}>
          <div style={{fontWeight:700,color:"var(--gold)",marginBottom:4}}>{caseta?.nombre}</div>
          <div style={{color:"var(--tx2)"}}>
            Turno abierto por: <strong style={{color:"var(--tx)"}}>{cajaCaseta.abiertoBy}</strong> a las {cajaCaseta.abiertoEn}
          </div>
          <div style={{color:"var(--tx2)",marginTop:2}}>
            Empleados en este turno: <strong style={{color:"var(--tx)"}}>{empleadosQueVendieron.join(", ")}</strong>
          </div>
        </div>

        {/* Resumen de ventas por empleado */}
        {empleadosQueVendieron.length > 1 && (
          <div style={{marginBottom:14}}>
            <div style={{fontSize:".75rem",color:"var(--tx2)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:7}}>Desglose por empleado</div>
            <div style={{background:"var(--s2)",borderRadius:"var(--rs)",overflow:"hidden"}}>
              {empleadosQueVendieron.map((emp, i) => {
                const ventasEmp = cajaCaseta.ventas.filter(v => v.empleado === emp);
                const totalEmp = ventasEmp.reduce((s,v) => s+v.total, 0);
                const efectivoEmp = ventasEmp.filter(v=>v.metodo==="efectivo").reduce((s,v)=>s+v.total,0);
                const tarjetaEmp = ventasEmp.filter(v=>v.metodo==="tarjeta").reduce((s,v)=>s+v.total,0);
                return (
                  <div key={emp} style={{padding:"9px 12px",borderBottom:i<empleadosQueVendieron.length-1?"1px solid var(--bd)":"none",fontSize:".82rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontWeight:600}}>{emp}</span>
                      <span style={{fontWeight:700,color:"var(--ac)"}}>{fmt(totalEmp)}</span>
                    </div>
                    <div style={{display:"flex",gap:14,color:"var(--tx2)",fontSize:".75rem"}}>
                      <span>💵 Efectivo: {fmt(efectivoEmp)}</span>
                      <span>💳 Tarjeta: {fmt(tarjetaEmp)}</span>
                      <span>{ventasEmp.length} tickets</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Totales de la caja */}
        <div style={{background:"var(--s2)",borderRadius:"var(--rs)",padding:13,marginBottom:16,fontSize:".83rem"}}>
          <div style={{fontSize:".72rem",color:"var(--tx2)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:9}}>Total caja</div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--bd)"}}><span>Apertura de caja</span><span>{fmt(cajaCaseta.apertura)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--bd)"}}><span>Ventas en efectivo</span><span style={{color:"var(--green)"}}>+{fmt(cajaCaseta.totalEfectivo)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--bd)"}}><span>Ventas con tarjeta</span><span style={{color:"var(--blue)"}}>{fmt(cajaCaseta.totalTarjeta)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--bd)"}}><span>Total tickets</span><span>{cajaCaseta.ventas.length}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"9px 0 0",fontWeight:700,fontSize:".9rem"}}>
            <span>Esperado en caja</span>
            <span style={{color:"var(--ac)"}}>{fmt(esperado)}</span>
          </div>
        </div>

        <div className="fg"><label>Dinero contado fisicamente en caja</label>
          <input type="number" className="bi" style={{fontSize:"1.4rem",marginBottom:0}} value={contado} onChange={e=>setContado(e.target.value)} placeholder="0,00" min="0" step=".01" autoFocus/>
        </div>
        {contado && (
          <div className="cbox">
            <div className="clbl">{dif >= 0 ? "Sobra en caja" : "Falta en caja"}</div>
            <div className="camt" style={{color:dif<0?"var(--red)":"var(--green)"}}>{dif>=0?"+":""}{fmt(Math.abs(dif))}</div>
          </div>
        )}
        <button className="btn-p" onClick={()=>onCerrar(parseFloat(contado)||0)}>Confirmar cierre de caja</button>
        <button className="bs" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ============================================================
// APP ROOT
// La caja es POR CASETA, no por empleado.
// Solo puede haber una caja abierta por caseta a la vez.
// Todos los empleados de la misma caseta comparten la misma caja.
// ============================================================
export default function App() {
  const [productos, setProductos] = useState(PRODUCTOS_INICIAL);
  const [ofertas, setOfertas] = useState(OFERTAS_INICIAL);
  const [usuarios, setUsuarios] = useState(USUARIOS_INICIAL);
  const [casetas] = useState(CASETAS_INICIAL);
  const [usuario, setUsuario] = useState(null);
  const [showCierre, setShowCierre] = useState(false);

  // cajasPorCaseta: { [caseta_id]: { caseta_id, apertura, abiertoBy, abiertoEn, ventas[], totalEfectivo, totalTarjeta } }
  const [cajasPorCaseta, setCajasPorCaseta] = useState({});

  const handleLogout = () => setUsuario(null);

  // Caja de la caseta del empleado logueado
  const cajaActual = usuario?.caseta_id ? cajasPorCaseta[usuario.caseta_id] : null;

  const abrirCaja = (dineroInicial) => {
    const caseta_id = usuario.caseta_id;
    setCajasPorCaseta(prev => ({
      ...prev,
      [caseta_id]: {
        caseta_id,
        apertura: dineroInicial,
        abiertoBy: usuario.nombre,
        abiertoEn: getNow(),
        ventas: [],
        totalEfectivo: 0,
        totalTarjeta: 0,
      }
    }));
  };

  // Registrar una venta en la caja de la caseta
  const registrarVenta = (venta) => {
    const caseta_id = usuario.caseta_id;
    setCajasPorCaseta(prev => {
      const caja = prev[caseta_id];
      const nuevaVenta = { ...venta, empleado: usuario.nombre, fecha: getNow() };
      return {
        ...prev,
        [caseta_id]: {
          ...caja,
          ventas: [...caja.ventas, nuevaVenta],
          totalEfectivo: caja.totalEfectivo + (venta.metodo === "efectivo" ? venta.total : 0),
          totalTarjeta: caja.totalTarjeta + (venta.metodo === "tarjeta" ? venta.total : 0),
        }
      };
    });
  };

  const cerrarCaja = () => {
    const caseta_id = usuario.caseta_id;
    setCajasPorCaseta(prev => {
      const next = { ...prev };
      delete next[caseta_id];
      return next;
    });
    setShowCierre(false);
  };

  if (!usuario) return <><style>{S}</style><Login usuarios={usuarios} onLogin={setUsuario}/></>;

  if (usuario.rol === "ADMIN") return (
    <><style>{S}</style>
      <AdminPanel usuario={usuario} usuarios={usuarios} setUsuarios={setUsuarios} productos={productos} setProductos={setProductos} ofertas={ofertas} setOfertas={setOfertas} casetas={casetas} onLogout={handleLogout}/>
    </>
  );

  // EMPLEADO
  const caseta = casetas.find(c => c.id === usuario.caseta_id);
  return (
    <><style>{S}</style>
      <div className="app">
        <div className="topbar">
          <div className="tl">La Petarderia</div>
          <div className="ti">
            <span style={{fontSize:".81rem",color:"var(--tx2)"}}>{caseta?.nombre}</span>
            <span className="badge be">Empleado</span>
            <button className="btn-o" onClick={handleLogout}>Salir</button>
          </div>
        </div>

        {!cajaActual ? (
          // Pantalla de apertura — si ya hay caja abierta en esta caseta por otro compañero,
          // se puede unir directamente sin introducir dinero de nuevo
          <AperturaCaja
            usuario={usuario}
            casetas={casetas}
            cajaExistente={cajasPorCaseta[usuario.caseta_id]}
            onAbrir={abrirCaja}
            onUnirse={() => {/* la caja ya existe, no hace falta hacer nada */}}
          />
        ) : (
          <TPV
            usuario={usuario}
            casetas={casetas}
            productos={productos}
            ofertas={ofertas}
            caja={cajaActual}
            onVenta={registrarVenta}
            onCerrarCaja={()=>setShowCierre(true)}
          />
        )}

        {showCierre && cajaActual && (
          <CierreCajaModal
            usuario={usuario}
            cajaCaseta={cajaActual}
            casetas={casetas}
            onClose={()=>setShowCierre(false)}
            onCerrar={cerrarCaja}
          />
        )}
      </div>
    </>
  );
}
