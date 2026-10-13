/* =========================================================================
   Estoque de Marketing — Sapion
   Aplicação: login, situação dos kits, lançamentos, cadastros e planilha.
   ========================================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const AUTH_KEY = "sapion-estoque-auth";
  const RESP_KEY = "sapion-estoque-responsavel";
  const app = document.getElementById("app");

  const state = {
    db: Store.emptyDb(),
    tab: "kits",
    busca: "",
    filtros: { periodo: "30", tipo: "", kit: "", busca: "" },
    limite: 50,
  };
  let store = null;

  /* ======================================================================
     Utilidades
     ====================================================================== */

  const $ = (sel, root = document) => root.querySelector(sel);
  const nf = new Intl.NumberFormat("pt-BR");
  const num = (n) => nf.format(n || 0);
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + num(Math.abs(n));
  const pad = (n) => String(n).padStart(2, "0");
  const nowIso = () => new Date().toISOString();

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtData(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtDia(d) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function toInputDate(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  /* Converte um texto em número inteiro >= min. Retorna null se inválido. */
  function inteiro(v, min = 0) {
    const s = String(v == null ? "" : v).trim();
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return n >= min ? n : null;
  }

  const cmpNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true });

  function icons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function getResp() {
    try { return localStorage.getItem(RESP_KEY) || ""; } catch (e) { return ""; }
  }
  function setResp(v) {
    try { localStorage.setItem(RESP_KEY, v); } catch (e) { /* sem armazenamento: ignora */ }
  }

  async function sha256(texto) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return sha256Fallback(texto);
  }

  /* SHA-256 em JavaScript puro, usado só se o navegador não tiver crypto.subtle. */
  function sha256Fallback(texto) {
    const bytes = unescape(encodeURIComponent(texto));
    const K = [];
    const H = [];
    let n = 2;
    let found = 0;
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    while (found < 64) {
      let primo = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) { primo = false; break; }
      if (primo) {
        if (found < 8) H[found] = frac(Math.pow(n, 1 / 2));
        K[found] = frac(Math.pow(n, 1 / 3));
        found++;
      }
      n++;
    }
    const words = [];
    const msg = bytes + "\x80" + "\x00".repeat((119 - (bytes.length % 64)) % 64);
    for (let i = 0; i < msg.length; i++) words[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
    words.push((bytes.length * 8 / 4294967296) | 0, (bytes.length * 8) | 0);
    const rot = (x, r) => (x >>> r) | (x << (32 - r));
    for (let j = 0; j < words.length; j += 16) {
      const w = words.slice(j, j + 16);
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        if (i >= 16) {
          const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }

  /* ======================================================================
     Toasts
     ====================================================================== */

  function toast(msg, tipo = "ok") {
    let wrap = $(".toasts");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toasts";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast" + (tipo === "error" ? " toast--error" : "");
    el.innerHTML = `<i data-lucide="${tipo === "error" ? "circle-alert" : "circle-check"}"></i><span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    icons();
    setTimeout(() => el.remove(), tipo === "error" ? 6000 : 3600);
  }

  /* ======================================================================
     Dados derivados
     ====================================================================== */

  const getKit = (id) => state.db.kits.find((k) => k.id === id);
  const getItem = (id) => state.db.itens.find((i) => i.id === id);
  const getLanc = (id) => state.db.lancamentos.find((l) => l.id === id);
  const kitsOrdenados = () => [...state.db.kits].sort(cmpNome);
  const itensDoKit = (kitId) => state.db.itens.filter((i) => i.kitId === kitId).sort(cmpNome);
  const nomeKitL = (l) => (getKit(l.kitId) || {}).nome || l.kitNome || "—";
  const nomeItemL = (l) => (getItem(l.itemId) || {}).nome || l.itemNome || "—";

  function lancOrdenados() {
    return [...state.db.lancamentos].sort(
      (a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criadoEm).localeCompare(String(a.criadoEm))
    );
  }

  function lancNoPeriodo(dias) {
    if (dias === "todos") return lancOrdenados();
    const limite = Date.now() - Number(dias) * 86400000;
    return lancOrdenados().filter((l) => new Date(l.data).getTime() >= limite);
  }

  function statusItem(it) {
    if (it.quantidade <= 0) return { key: "esgotado", label: "Esgotado", tone: "danger" };
    if (it.estoqueMinimo > 0 && it.quantidade <= it.estoqueMinimo) return { key: "baixo", label: "Estoque baixo", tone: "warning" };
    return { key: "ok", label: "Em dia", tone: "success" };
  }

  function resumoKit(kit) {
    const itens = itensDoKit(kit.id);
    const contam = itens.filter((i) => i.qtdPorKit > 0);
    const completos = contam.length ? Math.max(0, Math.min(...contam.map((i) => Math.floor(i.quantidade / i.qtdPorKit)))) : 0;
    // A situação do kit considera os itens obrigatórios; itens opcionais (0 por kit) só contam se forem os únicos.
    const st = (contam.length ? contam : itens).map(statusItem);
    let status;
    if (!itens.length) status = { key: "vazio", label: "Sem itens", tone: "neutral" };
    else if (st.some((s) => s.key === "esgotado")) status = { key: "esgotado", label: "Item esgotado", tone: "danger" };
    else if (st.some((s) => s.key === "baixo")) status = { key: "baixo", label: "Estoque baixo", tone: "warning" };
    else status = { key: "ok", label: "Em dia", tone: "success" };
    return { itens, completos, status, temContagem: contam.length > 0 };
  }

  const TIPOS = {
    entrada: { label: "Entrada", tone: "success", delta: "in" },
    saida: { label: "Saída", tone: "danger", delta: "out" },
    ajuste: { label: "Ajuste", tone: "brand", delta: "adj" },
  };

  /* ======================================================================
     Persistência
     ====================================================================== */

  async function salvar(changes, msg) {
    try {
      await store.commit(changes);
      Store.apply(state.db, changes);
      renderView();
      if (msg) toast(msg);
      return true;
    } catch (e) {
      console.error(e);
      toast("Não foi possível salvar: " + (e.message || e), "error");
      return false;
    }
  }

  /* No modo compartilhado, busca os dados mais recentes antes de mexer em quantidades. */
  async function sincronizar() {
    if (store.mode !== "supabase") return;
    try {
      state.db = await store.load();
    } catch (e) {
      console.error(e);
    }
  }

  /* ======================================================================
     Login
     ====================================================================== */

  function renderLogin() {
    closeModal();
    app.innerHTML = `
      <main class="login">
        <div class="login__inner">
          <img class="login__logo" src="assets/logos/lockup-white-transparent.png" alt="Sapion Nova Educação">
          <div class="card login__card">
            <h1>Estoque de Marketing</h1>
            <p>Controle dos kits e materiais de marketing da Sapion. Digite a senha de administrador para entrar.</p>
            <form class="login__form" id="login-form" novalidate>
              <div class="field">
                <label class="field__label" for="senha">Senha</label>
                <input class="input" id="senha" name="senha" type="password" autocomplete="current-password" required>
              </div>
              <button class="btn" type="submit"><i data-lucide="lock"></i> Entrar</button>
            </form>
          </div>
          <p class="login__tagline">Aprenda algo novo todos os dias.</p>
        </div>
      </main>`;
    icons();
    const form = $("#login-form");
    const input = $("#senha");
    input.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(form);
      const hash = await sha256(input.value);
      if (hash !== CONFIG.senhaHash) {
        fieldError(form, "senha", "Senha incorreta. Tente de novo.");
        input.select();
        return;
      }
      sessionStorage.setItem(AUTH_KEY, hash);
      startApp();
    });
  }

  function sair() {
    sessionStorage.removeItem(AUTH_KEY);
    renderLogin();
  }

  /* ======================================================================
     Estrutura principal
     ====================================================================== */

  async function startApp() {
    app.innerHTML = `<div class="loading"><div class="spinner" role="status" aria-label="Carregando"></div></div>`;
    try {
      store = Store.create(CONFIG);
      await store.init();
      state.db = await store.load();
    } catch (e) {
      console.error(e);
      app.innerHTML = `
        <main class="container">
          <div class="card empty">
            <div class="empty__icon"><i data-lucide="database"></i></div>
            <h3>Não conseguimos carregar os dados</h3>
            <p>${esc(e.message || e)}</p>
            <p>Confira a configuração em <strong>js/config.js</strong> e sua conexão com a internet.</p>
            <button class="btn" type="button" onclick="location.reload()"><i data-lucide="refresh-cw"></i> Tentar de novo</button>
          </div>
        </main>`;
      icons();
      return;
    }
    renderShell();
  }

  function renderShell() {
    const modo = store.mode === "supabase" ? "Banco compartilhado" : "Dados salvos neste navegador";
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar__inner">
          <div class="topbar__brand">
            <img class="topbar__logo" src="assets/logos/lockup-black-color.png" alt="Sapion Nova Educação">
            <span class="topbar__divider"></span>
            <div class="topbar__title">Estoque de Marketing<small>${modo}</small></div>
          </div>
          <div class="topbar__actions">
            <button class="btn btn--secondary btn--sm" type="button" data-action="exportar" aria-label="Baixar planilha">
              <i data-lucide="file-spreadsheet"></i><span class="label-desktop">Baixar planilha</span>
            </button>
            <button class="btn btn--sm" type="button" data-action="novo-lancamento" aria-label="Novo lançamento">
              <i data-lucide="arrow-left-right"></i><span class="label-desktop">Novo lançamento</span>
            </button>
            <button class="icon-btn" type="button" data-action="menu-app" aria-label="Mais opções" aria-haspopup="menu">
              <i data-lucide="ellipsis-vertical"></i>
            </button>
          </div>
        </div>
      </header>
      <main class="container">
        <nav class="tabs" role="tablist" id="tabs" aria-label="Seções"></nav>
        <section id="view"></section>
      </main>`;
    renderView();
  }

  function renderTabs() {
    const el = $("#tabs");
    if (!el) return;
    const tabs = [
      ["kits", "Situação dos kits", "layout-grid", state.db.kits.length],
      ["lancamentos", "Lançamentos", "history", state.db.lancamentos.length],
    ];
    el.innerHTML = tabs.map(([k, label, ic, c]) => `
      <button class="tab" type="button" role="tab" aria-selected="${state.tab === k}" data-action="tab" data-tab="${k}">
        <i data-lucide="${ic}"></i>${label}<span class="count">${num(c)}</span>
      </button>`).join("");
  }

  function renderView() {
    const view = $("#view");
    if (!view) return;
    renderTabs();
    if (state.tab === "lancamentos") {
      view.innerHTML = viewLancamentos();
      renderLancList();
    } else {
      view.innerHTML = viewKits();
      renderKitsList();
    }
    icons();
  }

  /* ======================================================================
     Aba: Situação dos kits
     ====================================================================== */

  function viewKits() {
    const resumos = state.db.kits.map(resumoKit);
    const completos = resumos.reduce((s, r) => s + r.completos, 0);
    const st = state.db.itens.map(statusItem);
    const baixos = st.filter((s) => s.key === "baixo").length;
    const esgotados = st.filter((s) => s.key === "esgotado").length;
    return `
      <div class="stats">
        <div class="card stat">
          <span class="stat__label"><i data-lucide="boxes"></i>Kits</span>
          <span class="stat__value">${num(state.db.kits.length)}</span>
          <span class="stat__hint">${num(state.db.itens.length)} itens cadastrados</span>
        </div>
        <div class="card stat">
          <span class="stat__label"><i data-lucide="package-check"></i>Kits completos</span>
          <span class="stat__value">${num(completos)}</span>
          <span class="stat__hint">prontos para montar com o estoque atual</span>
        </div>
        <div class="card stat stat--warning">
          <span class="stat__label"><i data-lucide="triangle-alert"></i>Estoque baixo</span>
          <span class="stat__value">${num(baixos)}</span>
          <span class="stat__hint">itens no mínimo ou abaixo dele</span>
        </div>
        <div class="card stat stat--danger">
          <span class="stat__label"><i data-lucide="circle-off"></i>Esgotados</span>
          <span class="stat__value">${num(esgotados)}</span>
          <span class="stat__hint">itens com estoque zerado</span>
        </div>
      </div>
      <div class="section-head">
        <div>
          <h2>Situação dos kits</h2>
          <p>Quantidade disponível de cada item e quantos kits completos dá para montar.</p>
        </div>
        <div class="toolbar">
          <div class="search">
            <i data-lucide="search"></i>
            <input class="input input--sm" id="busca-kits" type="search" placeholder="Buscar kit ou item" aria-label="Buscar kit ou item" value="${esc(state.busca)}">
          </div>
          <button class="btn btn--secondary btn--sm" type="button" data-action="novo-item"><i data-lucide="plus"></i>Novo item</button>
          <button class="btn btn--sm" type="button" data-action="novo-kit"><i data-lucide="plus"></i>Novo kit</button>
        </div>
      </div>
      <div id="kits-list"></div>`;
  }

  function renderKitsList() {
    const el = $("#kits-list");
    if (!el) return;
    if (!state.db.kits.length) {
      el.innerHTML = `
        <div class="card empty">
          <div class="empty__icon"><i data-lucide="boxes"></i></div>
          <h3>Nenhum kit cadastrado ainda</h3>
          <p>Comece criando um kit (por exemplo, "Kit Seminário") e depois adicione os itens que fazem parte dele.</p>
          <button class="btn" type="button" data-action="novo-kit"><i data-lucide="plus"></i>Criar primeiro kit</button>
        </div>`;
      icons();
      return;
    }
    const q = norm(state.busca);
    const cards = [];
    for (const kit of kitsOrdenados()) {
      const r = resumoKit(kit);
      let itens = r.itens;
      if (q) {
        const kitBate = norm(kit.nome + " " + kit.descricao).includes(q);
        if (!kitBate) {
          itens = itens.filter((i) => norm(i.nome + " " + i.codigo).includes(q));
          if (!itens.length) continue;
        }
      }
      cards.push(kitCard(kit, r, itens));
    }
    el.innerHTML = cards.length
      ? `<div class="kits">${cards.join("")}</div>`
      : `<div class="card empty">
           <div class="empty__icon"><i data-lucide="search-x"></i></div>
           <h3>Nada encontrado</h3>
           <p>Nenhum kit ou item corresponde a "${esc(state.busca)}".</p>
         </div>`;
    icons();
  }

  function kitCard(kit, r, itens) {
    const filtrado = itens.length !== r.itens.length;
    return `
      <article class="card kit">
        <div class="kit__head">
          <div class="kit__info">
            <h3 class="kit__name">${esc(kit.nome)}</h3>
            ${kit.descricao ? `<p class="kit__desc">${esc(kit.descricao)}</p>` : ""}
            <div class="kit__meta">
              <span class="badge badge--${r.status.tone}">${r.status.label}</span>
              <span class="badge badge--neutral badge--plain">${num(r.itens.length)} ${r.itens.length === 1 ? "item" : "itens"}</span>
            </div>
          </div>
          ${r.temContagem ? `
            <div class="kit__complete" title="Quantos kits completos dá para montar com o estoque atual">
              <strong>${num(r.completos)}</strong><span>${r.completos === 1 ? "kit completo" : "kits completos"}</span>
            </div>` : ""}
          <button class="icon-btn" type="button" data-action="menu-kit" data-id="${kit.id}" aria-label="Opções do kit ${esc(kit.nome)}" aria-haspopup="menu">
            <i data-lucide="ellipsis"></i>
          </button>
        </div>
        ${r.itens.length ? `
          <ul class="items">${itens.map(itemRow).join("")}</ul>
          <div class="kit__foot">
            ${filtrado ? `<span class="mode-chip">Mostrando ${itens.length} de ${r.itens.length} itens</span>` : `
            <button class="btn btn--ghost btn--sm" type="button" data-action="novo-item" data-kit="${kit.id}"><i data-lucide="plus"></i>Adicionar item</button>`}
          </div>` : `
          <div class="kit__empty">
            <span>Este kit ainda não tem itens.</span>
            <button class="btn btn--secondary btn--sm" type="button" data-action="novo-item" data-kit="${kit.id}"><i data-lucide="plus"></i>Adicionar item</button>
          </div>`}
      </article>`;
  }

  function itemRow(it) {
    const st = statusItem(it);
    const ref = it.estoqueMinimo > 0 ? it.estoqueMinimo * 2 : Math.max(it.quantidade, 1);
    const pct = it.quantidade <= 0 ? 0 : Math.max(4, Math.min(100, Math.round((it.quantidade / ref) * 100)));
    const mod = st.key === "ok" ? "" : st.key === "baixo" ? "warning" : "danger";
    const sub = [
      it.codigo ? esc(it.codigo) : "",
      it.qtdPorKit > 0 ? `${num(it.qtdPorKit)} por kit` : "opcional no kit",
      it.estoqueMinimo > 0 ? `mín. ${num(it.estoqueMinimo)}` : "",
    ].filter(Boolean).join(" · ");
    return `
      <li class="item">
        <div>
          <div class="item__name">${esc(it.nome)}</div>
          <div class="item__sub">${sub}${st.key !== "ok" ? ` · <strong>${st.label}</strong>` : ""}</div>
          <div class="item__bar ${mod ? "item__bar--" + mod : ""}" aria-hidden="true"><span style="width:${pct}%"></span></div>
        </div>
        <div class="item__qty ${mod ? "item__qty--" + mod : ""}">
          <strong>${num(it.quantidade)}</strong><span>${esc(it.unidade)}</span>
        </div>
        <div class="item__actions">
          <button class="icon-btn icon-btn--in" type="button" data-action="entrada" data-id="${it.id}" title="Lançar entrada" aria-label="Lançar entrada de ${esc(it.nome)}"><i data-lucide="plus"></i></button>
          <button class="icon-btn icon-btn--out" type="button" data-action="saida" data-id="${it.id}" title="Lançar saída" aria-label="Lançar saída de ${esc(it.nome)}"><i data-lucide="minus"></i></button>
          <button class="icon-btn" type="button" data-action="menu-item" data-id="${it.id}" title="Mais opções" aria-label="Mais opções de ${esc(it.nome)}" aria-haspopup="menu"><i data-lucide="ellipsis-vertical"></i></button>
        </div>
      </li>`;
  }

  /* ======================================================================
     Aba: Lançamentos
     ====================================================================== */

  function viewLancamentos() {
    const f = state.filtros;
    const opt = (v, label, atual) => `<option value="${v}" ${v === atual ? "selected" : ""}>${esc(label)}</option>`;
    return `
      <div class="section-head">
        <div>
          <h2>Lançamentos</h2>
          <p>Entradas, saídas e ajustes, do mais recente para o mais antigo.</p>
        </div>
        <div class="toolbar">
          <button class="btn btn--sm" type="button" data-action="novo-lancamento"><i data-lucide="arrow-left-right"></i>Novo lançamento</button>
        </div>
      </div>
      <div class="card filters">
        <div class="search">
          <i data-lucide="search"></i>
          <input class="input input--sm" id="f-busca" type="search" placeholder="Buscar por item, kit, descrição ou responsável" aria-label="Buscar lançamentos" value="${esc(f.busca)}">
        </div>
        <select class="select select--sm" id="f-periodo" aria-label="Período">
          ${opt("7", "Última semana", f.periodo)}${opt("30", "Últimos 30 dias", f.periodo)}${opt("90", "Últimos 90 dias", f.periodo)}${opt("365", "Último ano", f.periodo)}${opt("todos", "Todo o período", f.periodo)}
        </select>
        <select class="select select--sm" id="f-tipo" aria-label="Tipo">
          ${opt("", "Todos os tipos", f.tipo)}${opt("entrada", "Entradas", f.tipo)}${opt("saida", "Saídas", f.tipo)}${opt("ajuste", "Ajustes", f.tipo)}
        </select>
        <select class="select select--sm" id="f-kit" aria-label="Kit">
          ${opt("", "Todos os kits", f.kit)}${kitsOrdenados().map((k) => opt(k.id, k.nome, f.kit)).join("")}
        </select>
      </div>
      <div class="card" id="lanc-list"></div>`;
  }

  function lancFiltrados() {
    const f = state.filtros;
    let ls = lancNoPeriodo(f.periodo);
    if (f.tipo) ls = ls.filter((l) => l.tipo === f.tipo);
    if (f.kit) ls = ls.filter((l) => l.kitId === f.kit);
    if (f.busca) {
      const q = norm(f.busca);
      ls = ls.filter((l) => norm([nomeItemL(l), nomeKitL(l), l.observacao, l.responsavel].join(" ")).includes(q));
    }
    return ls;
  }

  function renderLancList() {
    const el = $("#lanc-list");
    if (!el) return;
    if (!state.db.lancamentos.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty__icon"><i data-lucide="history"></i></div>
          <h3>Nenhum lançamento ainda</h3>
          <p>Cada entrada, saída ou ajuste de estoque aparece aqui, com a descrição do motivo.</p>
          <button class="btn" type="button" data-action="novo-lancamento"><i data-lucide="arrow-left-right"></i>Fazer um lançamento</button>
        </div>`;
      icons();
      return;
    }
    const ls = lancFiltrados();
    if (!ls.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty__icon"><i data-lucide="search-x"></i></div>
          <h3>Nenhum lançamento com esses filtros</h3>
          <p>Tente ampliar o período ou limpar a busca.</p>
          <button class="btn btn--secondary" type="button" data-action="limpar-filtros">Limpar filtros</button>
        </div>`;
      icons();
      return;
    }
    const visiveis = ls.slice(0, state.limite);
    const entradas = ls.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.delta, 0);
    const saidas = ls.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.delta, 0);
    el.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Data</th><th>Tipo</th><th>Item</th><th class="num">Qtd.</th><th class="num">Saldo</th>
              <th>Descrição</th><th>Responsável</th><th><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>${visiveis.map(lancRow).join("")}</tbody>
        </table>
      </div>
      <div class="table-foot">
        <span>Mostrando ${num(visiveis.length)} de ${num(ls.length)} · Entradas <strong class="delta--in">${signed(entradas)}</strong> · Saídas <strong class="delta--out">${signed(saidas)}</strong></span>
        ${ls.length > visiveis.length ? `<button class="btn btn--secondary btn--sm" type="button" data-action="mais">Carregar mais</button>` : ""}
      </div>`;
    icons();
  }

  function lancRow(l) {
    const t = TIPOS[l.tipo] || TIPOS.ajuste;
    const notas = [];
    if (l.estornoDe) notas.push(`<span class="badge badge--neutral badge--plain">Estorno</span>`);
    if (l.porKit) notas.push(`<span class="cell-note">Kit completo × ${num(l.porKit)}</span>`);
    let acao = "";
    if (l.estornadoPor) acao = `<span class="badge badge--neutral badge--plain">Estornado</span>`;
    else if (getItem(l.itemId)) acao = `<button class="icon-btn" type="button" data-action="estornar" data-id="${l.id}" title="Estornar lançamento" aria-label="Estornar lançamento"><i data-lucide="undo-2"></i></button>`;
    return `
      <tr class="${l.estornadoPor ? "is-reverted" : ""}">
        <td class="nowrap">${fmtData(l.data)}</td>
        <td><span class="badge badge--${t.tone}">${t.label}</span>${notas.length ? `<div class="cell-stack">${notas.join("")}</div>` : ""}</td>
        <td><div class="strong">${esc(nomeItemL(l))}</div><div class="muted">${esc(nomeKitL(l))}</div></td>
        <td class="num"><span class="delta delta--${t.delta}">${signed(l.delta)}</span></td>
        <td class="num muted">${num(l.saldoAnterior)} → <strong>${num(l.saldoNovo)}</strong></td>
        <td class="obs">${esc(l.observacao)}</td>
        <td class="muted">${esc(l.responsavel || "—")}</td>
        <td class="nowrap">${acao}</td>
      </tr>`;
  }

  /* ======================================================================
     Menus suspensos
     ====================================================================== */

  let menuAtual = null;

  function toggleMenu(anchor, items) {
    if (menuAtual && menuAtual.anchor === anchor) return closeMenu();
    closeMenu();
    const m = document.createElement("div");
    m.className = "menu";
    m.setAttribute("role", "menu");
    m.innerHTML = items.map((it, i) => it === "sep"
      ? "<hr>"
      : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? "danger" : ""}"><i data-lucide="${it.icon}"></i>${esc(it.label)}</button>`
    ).join("");
    document.body.appendChild(m);
    icons();
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + "px";
    m.style.top = top + "px";
    m.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      const it = items[Number(b.dataset.i)];
      closeMenu();
      it.run();
    });
    anchor.setAttribute("aria-expanded", "true");
    menuAtual = { m, anchor };
    const first = m.querySelector("button");
    if (first) first.focus();
  }

  function closeMenu() {
    if (!menuAtual) return;
    menuAtual.m.remove();
    menuAtual.anchor.removeAttribute("aria-expanded");
    menuAtual = null;
  }

  function menuKit(id) {
    return [
      { icon: "arrow-up-from-line", label: "Saída do kit completo", run: () => abrirLancamento({ tipo: "saida", modo: "kit", kitId: id }) },
      { icon: "arrow-down-to-line", label: "Entrada do kit completo", run: () => abrirLancamento({ tipo: "entrada", modo: "kit", kitId: id }) },
      "sep",
      { icon: "plus", label: "Adicionar item", run: () => abrirItem({ kitId: id }) },
      { icon: "pencil", label: "Editar kit", run: () => abrirKit(id) },
      { icon: "copy", label: "Duplicar kit", run: () => duplicarKit(id) },
      "sep",
      { icon: "trash-2", label: "Excluir kit", danger: true, run: () => excluirKit(id) },
    ];
  }

  function menuItem(id) {
    return [
      { icon: "sliders-horizontal", label: "Ajustar quantidade", run: () => abrirAjuste(id) },
      { icon: "history", label: "Ver histórico", run: () => abrirHistorico(id) },
      { icon: "pencil", label: "Editar item", run: () => abrirItem({ id }) },
      "sep",
      { icon: "trash-2", label: "Excluir item", danger: true, run: () => excluirItem(id) },
    ];
  }

  function menuApp() {
    return [
      { icon: "file-spreadsheet", label: "Baixar planilha", run: abrirExportar },
      { icon: "database", label: "Backup e restauração", run: abrirBackup },
      "sep",
      { icon: "log-out", label: "Sair", run: sair },
    ];
  }

  /* ======================================================================
     Modais
     ====================================================================== */

  let modalAtual = null;

  function openModal({ title, subtitle = "", body, submitLabel = "Salvar", submitClass = "", cancelLabel = "Cancelar", extraFoot = "", wide = false, hideSubmit = false, onSubmit, onMount }) {
    closeModal();
    closeMenu();
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `
      <form class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate>
        <div class="modal__head">
          <div>
            <h2 id="modal-title">${esc(title)}</h2>
            ${subtitle ? `<p>${subtitle}</p>` : ""}
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Fechar"><i data-lucide="x"></i></button>
        </div>
        <div class="modal__body">${body}</div>
        <div class="modal__foot">
          ${extraFoot}
          <button type="button" class="btn btn--secondary" data-close>${esc(cancelLabel)}</button>
          ${hideSubmit ? "" : `<button type="submit" class="btn ${submitClass}">${submitLabel}</button>`}
        </div>
      </form>`;
    document.body.appendChild(back);
    const form = back.querySelector("form");
    modalAtual = { back, form, prevFocus: document.activeElement };

    back.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeModal();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form.dataset.busy || !onSubmit) return;
      clearErrors(form);
      const btn = form.querySelector('[type="submit"]');
      form.dataset.busy = "1";
      if (btn) btn.disabled = true;
      let ok = false;
      try {
        ok = await onSubmit(form);
      } catch (err) {
        console.error(err);
        formError(form, "Algo deu errado: " + (err.message || err));
        ok = false;
      }
      if (modalAtual && modalAtual.form === form) {
        if (ok !== false) closeModal();
        else {
          delete form.dataset.busy;
          if (btn) btn.disabled = false;
        }
      }
    });

    icons();
    if (onMount) onMount(form);
    const first = form.querySelector("[autofocus]") || form.querySelector(".modal__body input:not([type=radio]):not([type=hidden]):not([type=file]), .modal__body select, .modal__body textarea");
    if (first) first.focus();
    return form;
  }

  function closeModal() {
    if (!modalAtual) return;
    const { back, prevFocus } = modalAtual;
    modalAtual = null;
    back.remove();
    if (prevFocus && document.body.contains(prevFocus)) prevFocus.focus();
  }

  function fieldError(form, name, msg) {
    const el = form.querySelector(`[name="${name}"]`);
    const field = el && el.closest(".field");
    if (el) el.setAttribute("aria-invalid", "true");
    if (field) {
      let e = field.querySelector(".field__error");
      if (!e) {
        e = document.createElement("span");
        e.className = "field__error";
        field.appendChild(e);
      }
      e.textContent = msg;
    }
    if (el) el.focus();
    return false;
  }

  function formError(form, msg) {
    const body = form.querySelector(".modal__body");
    const old = form.querySelector(".form-error");
    if (old) old.remove();
    const d = document.createElement("div");
    d.className = "callout callout--danger form-error";
    d.innerHTML = `<i data-lucide="circle-alert"></i><div>${esc(msg)}</div>`;
    body.prepend(d);
    icons();
    body.scrollTop = 0;
    return false;
  }

  function clearErrors(form) {
    form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
    form.querySelectorAll(".field__error").forEach((e) => e.remove());
    const fe = form.querySelector(".form-error");
    if (fe) fe.remove();
  }

  function confirmar({ title, body, label, onOk }) {
    openModal({
      title,
      body,
      submitLabel: label,
      submitClass: "btn--danger",
      onSubmit: onOk,
    });
  }

  function campoObs({ name = "obs", label = "Descrição do lançamento", placeholder = "", hint = "Obrigatório. Conte o motivo: para onde foi, de onde veio, nota fiscal, evento, solicitante.", value = "" } = {}) {
    return `
      <div class="field">
        <label class="field__label" for="f-${name}">${label}</label>
        <textarea class="textarea" id="f-${name}" name="${name}" maxlength="500" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
        <span class="field__hint">${hint}</span>
      </div>`;
  }

  function campoResp() {
    return `
      <div class="field">
        <label class="field__label" for="f-resp">Responsável <span class="opt">(opcional)</span></label>
        <input class="input" id="f-resp" name="resp" maxlength="80" value="${esc(getResp())}" placeholder="Quem está registrando">
      </div>`;
  }

  function campoData() {
    return `
      <div class="field">
        <label class="field__label" for="f-data">Data e hora</label>
        <input class="input" id="f-data" name="data" type="datetime-local" value="${toInputDate()}">
      </div>`;
  }

  /* Lê e valida os campos comuns a todo lançamento (data, descrição, responsável). */
  function lerComuns(form) {
    const valorData = form.data.value;
    // Se a data não foi alterada, usa o horário exato (com segundos) para manter a ordem dos lançamentos.
    const data = valorData === form.data.defaultValue ? new Date() : new Date(valorData);
    if (!valorData || isNaN(data)) return fieldError(form, "data", "Informe a data do lançamento.");
    const obs = form.obs.value.trim();
    if (obs.length < 3) return fieldError(form, "obs", "Descreva o motivo do lançamento. Esse campo é obrigatório.");
    const resp = form.resp.value.trim();
    setResp(resp);
    return { data: data.toISOString(), obs, resp };
  }

  function novoLanc(item, { tipo, delta, data, obs, resp, criadoEm, extra = {} }) {
    const kit = getKit(item.kitId);
    return {
      id: uid(),
      tipo,
      itemId: item.id,
      kitId: item.kitId,
      itemNome: item.nome,
      kitNome: kit ? kit.nome : "",
      delta,
      saldoAnterior: item.quantidade,
      saldoNovo: item.quantidade + delta,
      observacao: obs,
      responsavel: resp,
      data,
      criadoEm,
      ...extra,
    };
  }

  function resumoSaldo(atual, delta, unidade) {
    const novo = atual + delta;
    return `
      <div class="summary">
        <div><span>Saldo atual</span><strong>${num(atual)}</strong></div>
        <div><span>Movimento</span><strong class="delta ${delta > 0 ? "delta--in" : delta < 0 ? "delta--out" : ""}">${signed(delta)}</strong></div>
        <div><span>Saldo após</span><strong style="color:${novo < 0 ? "var(--state-danger)" : "inherit"}">${num(novo)} <small class="muted">${esc(unidade)}</small></strong></div>
      </div>`;
  }

  /* ----------------------------------------------------------------------
     Lançamento (entrada / saída)
     ---------------------------------------------------------------------- */

  function abrirLancamento({ tipo = "saida", itemId = "", kitId = "", modo = "item" } = {}) {
    const kits = kitsOrdenados().filter((k) => itensDoKit(k.id).length);
    if (!kits.length) {
      toast("Cadastre um kit e seus itens antes de fazer lançamentos.", "error");
      return;
    }
    const itemOpts = kits.map((k) => `
      <optgroup label="${esc(k.nome)}">
        ${itensDoKit(k.id).map((i) => `<option value="${i.id}" ${i.id === itemId ? "selected" : ""}>${esc(i.nome)} — ${num(i.quantidade)} ${esc(i.unidade)}</option>`).join("")}
      </optgroup>`).join("");
    const kitOpts = kits.map((k) => `<option value="${k.id}" ${k.id === kitId ? "selected" : ""}>${esc(k.nome)}</option>`).join("");

    const body = `
      <div class="field">
        <span class="field__label">Tipo de lançamento</span>
        <div class="segmented segmented--full" id="seg-tipo">
          <input type="radio" name="tipo" id="t-entrada" value="entrada" ${tipo === "entrada" ? "checked" : ""}>
          <label for="t-entrada"><i data-lucide="arrow-down-to-line"></i>Entrada</label>
          <input type="radio" name="tipo" id="t-saida" value="saida" ${tipo !== "entrada" ? "checked" : ""}>
          <label for="t-saida"><i data-lucide="arrow-up-from-line"></i>Saída</label>
        </div>
      </div>
      <div class="field">
        <span class="field__label">Lançar por</span>
        <div class="segmented segmented--full">
          <input type="radio" name="modo" id="m-item" value="item" ${modo !== "kit" ? "checked" : ""}>
          <label for="m-item"><i data-lucide="package"></i>Item</label>
          <input type="radio" name="modo" id="m-kit" value="kit" ${modo === "kit" ? "checked" : ""}>
          <label for="m-kit"><i data-lucide="boxes"></i>Kit completo</label>
        </div>
      </div>
      <div class="field" data-show="item">
        <label class="field__label" for="f-item">Item</label>
        <select class="select" id="f-item" name="itemId">${itemOpts}</select>
      </div>
      <div class="field" data-show="kit">
        <label class="field__label" for="f-kit">Kit</label>
        <select class="select" id="f-kit" name="kitId">${kitOpts}</select>
        <span class="field__hint">Movimenta todos os itens do kit, de acordo com a quantidade de cada item por kit.</span>
      </div>
      <div class="grid-2">
        <div class="field">
          <label class="field__label" for="f-qtd" id="f-qtd-label">Quantidade</label>
          <input class="input" id="f-qtd" name="qtd" type="number" min="1" step="1" inputmode="numeric" placeholder="0" autofocus>
        </div>
        ${campoData()}
      </div>
      <div id="lanc-preview"></div>
      ${campoObs()}
      ${campoResp()}`;

    openModal({
      title: "Novo lançamento",
      subtitle: "Registre a movimentação e conte o motivo. Tudo fica no histórico.",
      body,
      submitLabel: "Registrar",
      onMount: (form) => {
        const update = () => atualizarLancamento(form);
        form.addEventListener("input", update);
        form.addEventListener("change", update);
        update();
      },
      onSubmit: (form) => salvarLancamento(form),
    });
  }

  function alvosLancamento(form, q) {
    const sinal = form.tipo.value === "entrada" ? 1 : -1;
    if (form.modo.value === "item") {
      const it = getItem(form.itemId.value);
      return it ? [{ item: it, delta: sinal * q }] : [];
    }
    const kit = getKit(form.kitId.value);
    if (!kit) return [];
    return itensDoKit(kit.id).filter((i) => i.qtdPorKit > 0).map((i) => ({ item: i, delta: sinal * q * i.qtdPorKit }));
  }

  function atualizarLancamento(form) {
    const tipo = form.tipo.value;
    const modo = form.modo.value;
    form.querySelectorAll("[data-show]").forEach((el) => { el.hidden = el.dataset.show !== modo; });
    $("#f-qtd-label", form).textContent = modo === "kit" ? "Quantidade de kits" : "Quantidade";
    $("#f-obs", form).placeholder = tipo === "entrada"
      ? "Ex.: Recebimento da gráfica, NF 4512, reposição para o segundo semestre"
      : "Ex.: Envio para o Seminário de Educação em Colatina, solicitado pela equipe comercial";
    const btn = form.querySelector('[type="submit"]');
    btn.textContent = tipo === "entrada" ? "Registrar entrada" : "Registrar saída";

    const q = inteiro(form.qtd.value, 1) || 0;
    const alvos = alvosLancamento(form, q);
    const prev = $("#lanc-preview", form);
    if (!alvos.length) {
      prev.innerHTML = modo === "kit"
        ? `<div class="callout callout--warning"><i data-lucide="triangle-alert"></i><div>Este kit não tem itens que contam para o kit completo.</div></div>`
        : "";
      icons();
      return;
    }
    const falta = alvos.filter((a) => a.item.quantidade + a.delta < 0);
    let html = "";
    if (modo === "item") {
      html = resumoSaldo(alvos[0].item.quantidade, alvos[0].delta, alvos[0].item.unidade);
    } else {
      html = `
        <div class="preview table-wrap">
          <table class="table">
            <thead><tr><th>Item</th><th class="num">Por kit</th><th class="num">Movimento</th><th class="num">Saldo após</th></tr></thead>
            <tbody>
              ${alvos.map((a) => {
                const novo = a.item.quantidade + a.delta;
                return `<tr>
                  <td>${esc(a.item.nome)}</td>
                  <td class="num">${num(a.item.qtdPorKit)}</td>
                  <td class="num"><span class="delta ${a.delta > 0 ? "delta--in" : a.delta < 0 ? "delta--out" : ""}">${signed(a.delta)}</span></td>
                  <td class="num" style="color:${novo < 0 ? "var(--state-danger)" : "inherit"}">${num(a.item.quantidade)} → <strong>${num(novo)}</strong></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
    }
    if (falta.length && q > 0) {
      html += `<div class="callout callout--danger"><i data-lucide="circle-alert"></i><div>Estoque insuficiente para ${falta.map((a) => `<strong>${esc(a.item.nome)}</strong> (disponível: ${num(a.item.quantidade)})`).join(", ")}.</div></div>`;
    }
    prev.innerHTML = html;
    icons();
  }

  async function salvarLancamento(form) {
    const q = inteiro(form.qtd.value, 1);
    if (!q) return fieldError(form, "qtd", "Informe uma quantidade inteira maior que zero.");
    const comuns = lerComuns(form);
    if (!comuns) return false;
    if (form.modo.value === "item" && !getItem(form.itemId.value)) return fieldError(form, "itemId", "Selecione um item.");
    if (form.modo.value === "kit" && !getKit(form.kitId.value)) return fieldError(form, "kitId", "Selecione um kit.");

    await sincronizar();
    const alvos = alvosLancamento(form, q);
    if (!alvos.length) return formError(form, "Não encontramos itens para movimentar. Atualize a página e tente de novo.");
    const falta = alvos.filter((a) => a.item.quantidade + a.delta < 0);
    if (falta.length) {
      return formError(form, "Estoque insuficiente: " + falta.map((a) => `${a.item.nome} (disponível ${num(a.item.quantidade)}, necessário ${num(-a.delta)})`).join("; ") + ". Ajuste a quantidade ou faça um ajuste de estoque antes.");
    }
    const tipo = form.tipo.value;
    const porKit = form.modo.value === "kit";
    const criadoEm = nowIso();
    const loteId = porKit ? uid() : null;
    const lancamentos = [];
    const itens = [];
    for (const a of alvos) {
      lancamentos.push(novoLanc(a.item, { tipo, delta: a.delta, ...comuns, criadoEm, extra: porKit ? { loteId, porKit: q } : {} }));
      itens.push({ ...a.item, quantidade: a.item.quantidade + a.delta, atualizadoEm: criadoEm });
    }
    return salvar({ upsert: { lancamentos, itens } }, tipo === "entrada" ? "Entrada registrada." : "Saída registrada.");
  }

  /* ----------------------------------------------------------------------
     Ajuste manual
     ---------------------------------------------------------------------- */

  function abrirAjuste(itemId) {
    const it = getItem(itemId);
    if (!it) return;
    const kit = getKit(it.kitId);
    openModal({
      title: "Ajustar quantidade",
      subtitle: `<strong>${esc(it.nome)}</strong> · ${esc(kit ? kit.nome : "")}`,
      body: `
        <div class="callout"><i data-lucide="info"></i><div>Use o ajuste para corrigir o estoque depois de uma contagem física, perda ou avaria. Informe a quantidade real que existe hoje.</div></div>
        <div class="grid-2">
          <div class="field">
            <label class="field__label" for="f-nova">Nova quantidade</label>
            <input class="input" id="f-nova" name="nova" type="number" min="0" step="1" inputmode="numeric" value="${it.quantidade}" autofocus>
          </div>
          ${campoData()}
        </div>
        <div id="ajuste-preview"></div>
        ${campoObs({ label: "Motivo do ajuste", placeholder: "Ex.: Contagem física de outubro encontrou 3 unidades a menos (avariadas)" })}
        ${campoResp()}`,
      submitLabel: "Salvar ajuste",
      onMount: (form) => {
        const update = () => {
          const nova = inteiro(form.nova.value, 0);
          $("#ajuste-preview", form).innerHTML = nova == null ? "" : resumoSaldo(it.quantidade, nova - it.quantidade, it.unidade);
        };
        form.nova.addEventListener("input", update);
        update();
        form.nova.select();
      },
      onSubmit: async (form) => {
        const nova = inteiro(form.nova.value, 0);
        if (nova == null) return fieldError(form, "nova", "Informe um número inteiro igual ou maior que zero.");
        const comuns = lerComuns(form);
        if (!comuns) return false;
        await sincronizar();
        const atual = getItem(itemId);
        if (!atual) return formError(form, "Este item não existe mais.");
        if (nova === atual.quantidade) return fieldError(form, "nova", "A nova quantidade é igual à atual. Nada para ajustar.");
        const criadoEm = nowIso();
        const lanc = novoLanc(atual, { tipo: "ajuste", delta: nova - atual.quantidade, ...comuns, criadoEm });
        return salvar({ upsert: { lancamentos: [lanc], itens: [{ ...atual, quantidade: nova, atualizadoEm: criadoEm }] } }, "Quantidade ajustada.");
      },
    });
  }

  /* ----------------------------------------------------------------------
     Estorno
     ---------------------------------------------------------------------- */

  function abrirEstorno(lancId) {
    const l = getLanc(lancId);
    if (!l || l.estornadoPor) return;
    const it = getItem(l.itemId);
    if (!it) {
      toast("O item deste lançamento foi excluído, então não dá para estornar.", "error");
      return;
    }
    const t = TIPOS[l.tipo] || TIPOS.ajuste;
    openModal({
      title: "Estornar lançamento",
      subtitle: "Vamos registrar um novo lançamento que desfaz este. O original continua no histórico, marcado como estornado.",
      body: `
        <div class="callout callout--warning"><i data-lucide="undo-2"></i><div>
          <strong>${t.label} de ${signed(l.delta)} ${esc(it.unidade)}</strong> em ${esc(it.nome)} (${esc(nomeKitL(l))}), registrada em ${fmtData(l.data)}.<br>
          <span class="muted">"${esc(l.observacao)}"</span>
        </div></div>
        ${resumoSaldo(it.quantidade, -l.delta, it.unidade)}
        ${campoObs({ label: "Motivo do estorno", placeholder: "Ex.: Lançamento duplicado por engano", hint: "Obrigatório. Explique por que este lançamento está sendo desfeito." })}
        ${campoResp()}`,
      submitLabel: "Estornar",
      submitClass: "btn--danger",
      onSubmit: async (form) => {
        const obs = form.obs.value.trim();
        if (obs.length < 3) return fieldError(form, "obs", "Explique o motivo do estorno. Esse campo é obrigatório.");
        const resp = form.resp.value.trim();
        setResp(resp);
        await sincronizar();
        const orig = getLanc(lancId);
        const item = getItem(l.itemId);
        if (!orig || orig.estornadoPor) return formError(form, "Este lançamento já foi estornado.");
        if (!item) return formError(form, "O item deste lançamento foi excluído.");
        const delta = -orig.delta;
        if (item.quantidade + delta < 0) return formError(form, `Estoque insuficiente para estornar: disponível ${num(item.quantidade)}, necessário ${num(-delta)}.`);
        const tipo = orig.tipo === "entrada" ? "saida" : orig.tipo === "saida" ? "entrada" : "ajuste";
        const criadoEm = nowIso();
        const novo = novoLanc(item, { tipo, delta, data: criadoEm, obs, resp, criadoEm, extra: { estornoDe: orig.id } });
        return salvar({
          upsert: {
            lancamentos: [novo, { ...orig, estornadoPor: novo.id }],
            itens: [{ ...item, quantidade: item.quantidade + delta, atualizadoEm: criadoEm }],
          },
        }, "Lançamento estornado.");
      },
    });
  }

  /* ----------------------------------------------------------------------
     Kits
     ---------------------------------------------------------------------- */

  function abrirKit(id) {
    const k = id ? getKit(id) : null;
    openModal({
      title: k ? "Editar kit" : "Novo kit",
      subtitle: k ? "" : "Depois de criar o kit, adicione os itens que fazem parte dele.",
      body: `
        <div class="field">
          <label class="field__label" for="f-nome">Nome do kit</label>
          <input class="input" id="f-nome" name="nome" maxlength="80" value="${esc(k ? k.nome : "")}" placeholder="Ex.: Kit Seminário" autofocus>
        </div>
        <div class="field">
          <label class="field__label" for="f-descricao">Descrição <span class="opt">(opcional)</span></label>
          <textarea class="textarea" id="f-descricao" name="descricao" maxlength="300" placeholder="Ex.: Entregue aos participantes dos seminários presenciais">${esc(k ? k.descricao : "")}</textarea>
        </div>`,
      submitLabel: k ? "Salvar alterações" : "Criar kit",
      onSubmit: async (form) => {
        const nome = form.nome.value.trim();
        if (!nome) return fieldError(form, "nome", "Dê um nome ao kit.");
        if (state.db.kits.some((x) => x.id !== id && norm(x.nome) === norm(nome))) return fieldError(form, "nome", "Já existe um kit com esse nome.");
        const agora = nowIso();
        const kit = { ...(k || { id: uid(), criadoEm: agora }), nome, descricao: form.descricao.value.trim(), atualizadoEm: agora };
        return salvar({ upsert: { kits: [kit] } }, k ? "Kit atualizado." : "Kit criado. Agora é só adicionar os itens.");
      },
    });
  }

  function duplicarKit(id) {
    const k = getKit(id);
    if (!k) return;
    const agora = nowIso();
    let nome = `${k.nome} (cópia)`;
    let n = 2;
    while (state.db.kits.some((x) => norm(x.nome) === norm(nome))) nome = `${k.nome} (cópia ${n++})`;
    const novo = { id: uid(), nome, descricao: k.descricao, criadoEm: agora, atualizadoEm: agora };
    const itens = itensDoKit(id).map((i) => ({ ...i, id: uid(), kitId: novo.id, quantidade: 0, criadoEm: agora, atualizadoEm: agora }));
    salvar({ upsert: { kits: [novo], itens } }, "Kit duplicado. Os itens foram copiados com estoque zerado.");
  }

  function excluirKit(id) {
    const k = getKit(id);
    if (!k) return;
    const itens = itensDoKit(id);
    const total = itens.reduce((s, i) => s + i.quantidade, 0);
    confirmar({
      title: "Excluir kit?",
      body: `
        <p>O kit <strong>${esc(k.nome)}</strong> ${itens.length
          ? `e ${itens.length === 1 ? "o item dele" : `os ${itens.length} itens dele`} (${num(total)} unidades em estoque) serão excluídos.`
          : "será excluído."}</p>
        <div class="callout"><i data-lucide="info"></i><div>O histórico de lançamentos continua disponível na aba Lançamentos e na planilha.</div></div>`,
      label: "Excluir kit",
      onOk: () => salvar({ remove: { kits: [id], itens: itens.map((i) => i.id) } }, "Kit excluído."),
    });
  }

  /* ----------------------------------------------------------------------
     Itens
     ---------------------------------------------------------------------- */

  function abrirItem({ id, kitId } = {}) {
    const it = id ? getItem(id) : null;
    const kits = kitsOrdenados();
    if (!kits.length) {
      toast("Crie um kit primeiro. Depois é só adicionar os itens dele.", "error");
      abrirKit();
      return;
    }
    const kitSel = it ? it.kitId : kitId || kits[0].id;
    const unidades = (CONFIG.unidades || ["un"]).map((u) => `<option value="${esc(u)}">`).join("");
    openModal({
      title: it ? "Editar item" : "Novo item",
      body: `
        <div class="field">
          <label class="field__label" for="f-kitId">Kit</label>
          <select class="select" id="f-kitId" name="kitId">
            ${kits.map((k) => `<option value="${k.id}" ${k.id === kitSel ? "selected" : ""}>${esc(k.nome)}</option>`).join("")}
          </select>
          ${it ? `<span class="field__hint">Você pode mover o item para outro kit.</span>` : ""}
        </div>
        <div class="field">
          <label class="field__label" for="f-nome">Nome do item</label>
          <input class="input" id="f-nome" name="nome" maxlength="100" value="${esc(it ? it.nome : "")}" placeholder="Ex.: Caneca personalizada" autofocus>
        </div>
        <div class="grid-3">
          <div class="field">
            <label class="field__label" for="f-codigo">Código <span class="opt">(opcional)</span></label>
            <input class="input" id="f-codigo" name="codigo" maxlength="40" value="${esc(it ? it.codigo : "")}" placeholder="Ex.: CAN-01">
          </div>
          <div class="field">
            <label class="field__label" for="f-unidade">Unidade</label>
            <input class="input" id="f-unidade" name="unidade" maxlength="20" list="lista-unidades" value="${esc(it ? it.unidade : "un")}">
            <datalist id="lista-unidades">${unidades}</datalist>
          </div>
          <div class="field">
            <label class="field__label" for="f-qtdPorKit">Qtd. por kit</label>
            <input class="input" id="f-qtdPorKit" name="qtdPorKit" type="number" min="0" step="1" inputmode="numeric" value="${it ? it.qtdPorKit : 1}">
          </div>
        </div>
        <div class="${it ? "" : "grid-2"}">
          <div class="field">
            <label class="field__label" for="f-minimo">Estoque mínimo</label>
            <input class="input" id="f-minimo" name="minimo" type="number" min="0" step="1" inputmode="numeric" value="${it ? it.estoqueMinimo : 0}">
            <span class="field__hint">Avisamos quando o estoque chegar a esse número. Use 0 para não avisar.</span>
          </div>
          ${it ? "" : `
          <div class="field">
            <label class="field__label" for="f-inicial">Quantidade inicial</label>
            <input class="input" id="f-inicial" name="inicial" type="number" min="0" step="1" inputmode="numeric" value="0">
            <span class="field__hint">Vira uma entrada no histórico.</span>
          </div>`}
        </div>
        ${it ? `
          <div class="callout"><i data-lucide="info"></i><div>Para mudar a quantidade em estoque (hoje: <strong>${num(it.quantidade)} ${esc(it.unidade)}</strong>), use <strong>Ajustar quantidade</strong> ou faça um lançamento. Assim o histórico fica completo.</div></div>`
        : `<div id="obs-inicial" hidden>${campoObs({ value: "Estoque inicial no cadastro do item" })}</div>`}
        <p class="field__hint">Qtd. por kit: quantas unidades deste item vão em cada kit montado. Use 0 se o item for opcional e não deve contar para os kits completos.</p>`,
      submitLabel: it ? "Salvar alterações" : "Adicionar item",
      onMount: (form) => {
        if (it) return;
        const toggle = () => { $("#obs-inicial", form).hidden = !(inteiro(form.inicial.value, 1)); };
        form.inicial.addEventListener("input", toggle);
      },
      onSubmit: async (form) => {
        const kitIdSel = form.kitId.value;
        if (!getKit(kitIdSel)) return fieldError(form, "kitId", "Selecione um kit.");
        const nome = form.nome.value.trim();
        if (!nome) return fieldError(form, "nome", "Dê um nome ao item.");
        if (state.db.itens.some((x) => x.id !== id && x.kitId === kitIdSel && norm(x.nome) === norm(nome))) {
          return fieldError(form, "nome", "Esse kit já tem um item com esse nome.");
        }
        const qtdPorKit = inteiro(form.qtdPorKit.value, 0);
        if (qtdPorKit == null) return fieldError(form, "qtdPorKit", "Use um número inteiro (0 ou mais).");
        const minimo = inteiro(form.minimo.value, 0);
        if (minimo == null) return fieldError(form, "minimo", "Use um número inteiro (0 ou mais).");
        const unidade = form.unidade.value.trim() || "un";
        const agora = nowIso();

        if (it) {
          const atual = getItem(id) || it;
          const item = { ...atual, kitId: kitIdSel, nome, codigo: form.codigo.value.trim(), unidade, qtdPorKit, estoqueMinimo: minimo, atualizadoEm: agora };
          return salvar({ upsert: { itens: [item] } }, "Item atualizado.");
        }

        const inicial = inteiro(form.inicial.value, 0);
        if (inicial == null) return fieldError(form, "inicial", "Use um número inteiro (0 ou mais).");
        const item = { id: uid(), kitId: kitIdSel, nome, codigo: form.codigo.value.trim(), unidade, qtdPorKit, estoqueMinimo: minimo, quantidade: 0, criadoEm: agora, atualizadoEm: agora };
        const changes = { upsert: { itens: [item] } };
        if (inicial > 0) {
          const obs = form.obs.value.trim();
          if (obs.length < 3) return fieldError(form, "obs", "Descreva a origem do estoque inicial.");
          const lanc = novoLanc(item, { tipo: "entrada", delta: inicial, data: agora, obs, resp: getResp(), criadoEm: agora });
          item.quantidade = inicial;
          changes.upsert.lancamentos = [lanc];
        }
        return salvar(changes, "Item adicionado.");
      },
    });
  }

  function excluirItem(id) {
    const it = getItem(id);
    if (!it) return;
    confirmar({
      title: "Excluir item?",
      body: `
        <p>O item <strong>${esc(it.nome)}</strong> (${num(it.quantidade)} ${esc(it.unidade)} em estoque) será removido do kit <strong>${esc((getKit(it.kitId) || {}).nome || "")}</strong>.</p>
        <div class="callout"><i data-lucide="info"></i><div>Os lançamentos deste item continuam no histórico.</div></div>`,
      label: "Excluir item",
      onOk: () => salvar({ remove: { itens: [id] } }, "Item excluído."),
    });
  }

  function abrirHistorico(itemId) {
    const it = getItem(itemId);
    if (!it) return;
    const kit = getKit(it.kitId);
    const ls = lancOrdenados().filter((l) => l.itemId === itemId);
    const entradas = ls.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0);
    const saidas = ls.filter((l) => l.delta < 0).reduce((s, l) => s + l.delta, 0);
    openModal({
      title: it.nome,
      subtitle: `${esc(kit ? kit.nome : "")}${it.codigo ? " · " + esc(it.codigo) : ""} · ${statusItem(it).label}`,
      wide: true,
      hideSubmit: true,
      cancelLabel: "Fechar",
      extraFoot: `
        <button type="button" class="btn btn--ghost" data-action="ajustar" data-id="${it.id}"><i data-lucide="sliders-horizontal"></i>Ajustar</button>
        <button type="button" class="btn btn--ghost" data-action="entrada" data-id="${it.id}"><i data-lucide="plus"></i>Entrada</button>
        <button type="button" class="btn btn--ghost" data-action="saida" data-id="${it.id}"><i data-lucide="minus"></i>Saída</button>`,
      body: `
        <div class="summary">
          <div><span>Em estoque</span><strong>${num(it.quantidade)} <small class="muted">${esc(it.unidade)}</small></strong></div>
          <div><span>Total de acréscimos</span><strong class="delta delta--in">${signed(entradas)}</strong></div>
          <div><span>Total de baixas</span><strong class="delta delta--out">${signed(saidas)}</strong></div>
        </div>
        ${ls.length ? `
          <div class="preview table-wrap">
            <table class="table">
              <thead><tr><th>Data</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Saldo</th><th>Descrição</th></tr></thead>
              <tbody>
                ${ls.map((l) => {
                  const t = TIPOS[l.tipo] || TIPOS.ajuste;
                  return `<tr class="${l.estornadoPor ? "is-reverted" : ""}">
                    <td class="nowrap">${fmtData(l.data)}</td>
                    <td><span class="badge badge--${t.tone}">${t.label}</span></td>
                    <td class="num"><span class="delta delta--${t.delta}">${signed(l.delta)}</span></td>
                    <td class="num muted">${num(l.saldoAnterior)} → <strong>${num(l.saldoNovo)}</strong></td>
                    <td class="obs">${esc(l.observacao)}${l.responsavel ? `<div class="cell-note">${esc(l.responsavel)}</div>` : ""}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>` : `<p class="field__hint">Nenhum lançamento para este item ainda.</p>`}`,
    });
  }

  /* ======================================================================
     Planilha Excel
     ====================================================================== */

  const PERIODOS = [
    { dias: 7, label: "Última semana", nome: "7 dias" },
    { dias: 30, label: "Últimos 30 dias", nome: "30 dias" },
    { dias: 90, label: "Últimos 90 dias", nome: "90 dias" },
    { dias: 365, label: "Último ano", nome: "1 ano" },
  ];

  function abrirExportar() {
    openModal({
      title: "Baixar planilha",
      subtitle: "A planilha traz o estoque disponível de todos os kits e os lançamentos do período que você escolher.",
      body: `
        <div class="choice-list" role="radiogroup" aria-label="Período dos lançamentos">
          ${PERIODOS.map((p) => `
            <label class="choice">
              <input type="radio" name="periodo" value="${p.dias}" ${p.dias === 30 ? "checked" : ""}>
              <div><strong>${p.label}</strong><span>${num(lancNoPeriodo(p.dias).length)} lançamentos</span></div>
            </label>`).join("")}
        </div>`,
      submitLabel: `<i data-lucide="download"></i>Baixar planilha`,
      onSubmit: (form) => exportarExcel(Number(form.periodo.value)),
    });
  }

  function exportarExcel(dias) {
    const XLSX = window.XLSX;
    if (!XLSX) {
      toast("Não foi possível carregar o gerador de planilhas. Confira sua conexão e tente de novo.", "error");
      return false;
    }
    const periodo = PERIODOS.find((p) => p.dias === dias) || PERIODOS[1];
    const agora = new Date();
    const inicio = new Date(agora.getTime() - dias * 86400000);
    const lancs = lancNoPeriodo(dias);
    const kits = kitsOrdenados();
    const wb = XLSX.utils.book_new();

    const sheet = (rows, cols) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = cols.map((wch) => ({ wch }));
      return ws;
    };

    // Resumo
    const somaTipo = (tipo) => lancs.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.delta, 0);
    const resumo = [
      ["Estoque de Marketing — Sapion"],
      [],
      ["Gerado em", fmtData(agora.toISOString())],
      ["Período dos lançamentos", `${periodo.label} (${fmtDia(inicio)} a ${fmtDia(agora)})`],
      [],
      ["Kits cadastrados", state.db.kits.length],
      ["Itens cadastrados", state.db.itens.length],
      ["Unidades em estoque (todos os itens)", state.db.itens.reduce((s, i) => s + i.quantidade, 0)],
      ["Itens com estoque baixo", state.db.itens.filter((i) => statusItem(i).key === "baixo").length],
      ["Itens esgotados", state.db.itens.filter((i) => statusItem(i).key === "esgotado").length],
      [],
      ["Lançamentos no período", lancs.length],
      ["Total de entradas (unidades)", somaTipo("entrada")],
      ["Total de saídas (unidades)", Math.abs(somaTipo("saida"))],
      ["Saldo de ajustes (unidades)", somaTipo("ajuste")],
    ];
    XLSX.utils.book_append_sheet(wb, sheet(resumo, [38, 48]), "Resumo");

    // Estoque atual por item
    const estoque = [["Kit", "Item", "Código", "Unidade", "Qtd. disponível", "Estoque mínimo", "Qtd. por kit", "Situação"]];
    for (const k of kits) {
      for (const i of itensDoKit(k.id)) {
        estoque.push([k.nome, i.nome, i.codigo, i.unidade, i.quantidade, i.estoqueMinimo, i.qtdPorKit, statusItem(i).label]);
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(estoque, [28, 34, 14, 10, 16, 16, 13, 16]), "Estoque atual");

    // Situação dos kits
    const kitsRows = [["Kit", "Descrição", "Itens", "Kits completos disponíveis", "Situação"]];
    for (const k of kits) {
      const r = resumoKit(k);
      kitsRows.push([k.nome, k.descricao, r.itens.length, r.temContagem ? r.completos : "—", r.status.label]);
    }
    XLSX.utils.book_append_sheet(wb, sheet(kitsRows, [28, 44, 8, 26, 16]), "Kits");

    // Lançamentos do período
    const lancRows = [["Data", "Tipo", "Kit", "Item", "Quantidade", "Saldo anterior", "Saldo após", "Descrição", "Responsável", "Observações do sistema"]];
    for (const l of lancs) {
      const notas = [];
      if (l.porKit) notas.push(`Kit completo × ${l.porKit}`);
      if (l.estornoDe) notas.push("Estorno de outro lançamento");
      if (l.estornadoPor) notas.push("Estornado");
      lancRows.push([
        fmtData(l.data), (TIPOS[l.tipo] || TIPOS.ajuste).label, nomeKitL(l), nomeItemL(l),
        l.delta, l.saldoAnterior, l.saldoNovo, l.observacao, l.responsavel, notas.join("; "),
      ]);
    }
    XLSX.utils.book_append_sheet(wb, sheet(lancRows, [17, 10, 26, 30, 12, 14, 12, 60, 20, 28]), `Lançamentos ${periodo.nome}`);

    const dataArq = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
    XLSX.writeFile(wb, `estoque-marketing-sapion_${dataArq}_${periodo.nome.replace(" ", "")}.xlsx`, { compression: true });
    toast("Planilha gerada.");
    return true;
  }

  /* ======================================================================
     Backup
     ====================================================================== */

  function abrirBackup() {
    const local = store.mode !== "supabase";
    openModal({
      title: "Backup e restauração",
      body: `
        <div class="callout ${local ? "callout--warning" : ""}"><i data-lucide="${local ? "triangle-alert" : "database"}"></i><div>
          ${local
            ? "Os dados estão salvos <strong>apenas neste navegador</strong>. Baixe um backup com frequência. Para usar em vários computadores, configure o banco compartilhado (passo a passo no README)."
            : "Os dados estão no <strong>banco compartilhado</strong> (Supabase) e aparecem para todos que acessam o sistema."}
        </div></div>
        <div class="choice-list">
          <button type="button" class="btn btn--secondary" data-action="backup-baixar"><i data-lucide="download"></i>Baixar backup (.json)</button>
          <label class="btn btn--ghost" for="f-restaurar"><i data-lucide="upload"></i>Restaurar a partir de um backup</label>
          <input type="file" id="f-restaurar" accept="application/json,.json" hidden>
        </div>
        <p class="field__hint">Restaurar substitui todos os kits, itens e lançamentos atuais pelos do arquivo. Também serve para levar os dados de um navegador para o banco compartilhado.</p>`,
      hideSubmit: true,
      cancelLabel: "Fechar",
      onMount: (form) => {
        $("#f-restaurar", form).addEventListener("change", (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) lerBackup(file);
        });
      },
    });
  }

  function baixarBackup() {
    const payload = { app: "estoque-marketing-sapion", versao: 1, exportadoEm: nowIso(), ...state.db };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `backup-estoque-sapion_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Backup baixado.");
  }

  function lerBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let db;
      try {
        const json = JSON.parse(reader.result);
        if (!json || !Array.isArray(json.kits) || !Array.isArray(json.itens)) throw new Error("formato");
        db = Store.normalize(json);
      } catch (e) {
        toast("Esse arquivo não parece ser um backup deste sistema.", "error");
        return;
      }
      confirmar({
        title: "Restaurar backup?",
        body: `
          <p>O arquivo tem <strong>${num(db.kits.length)} kits</strong>, <strong>${num(db.itens.length)} itens</strong> e <strong>${num(db.lancamentos.length)} lançamentos</strong>.</p>
          <div class="callout callout--danger"><i data-lucide="triangle-alert"></i><div>Todos os dados atuais serão substituídos pelos do backup. Se quiser, baixe um backup dos dados atuais antes.</div></div>`,
        label: "Restaurar",
        onOk: async () => {
          try {
            await store.replaceAll(db);
            state.db = db;
            renderView();
            toast("Backup restaurado.");
            return true;
          } catch (e) {
            toast("Não foi possível restaurar: " + (e.message || e), "error");
            return false;
          }
        },
      });
    };
    reader.readAsText(file);
  }

  /* ======================================================================
     Eventos globais
     ====================================================================== */

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.closest(".menu")) return;
    const { action, id } = el.dataset;
    switch (action) {
      case "tab":
        state.tab = el.dataset.tab;
        renderView();
        break;
      case "novo-lancamento": abrirLancamento(); break;
      case "entrada": abrirLancamento({ tipo: "entrada", itemId: id }); break;
      case "saida": abrirLancamento({ tipo: "saida", itemId: id }); break;
      case "ajustar": abrirAjuste(id); break;
      case "novo-kit": abrirKit(); break;
      case "novo-item": abrirItem({ kitId: el.dataset.kit }); break;
      case "menu-kit": toggleMenu(el, menuKit(id)); break;
      case "menu-item": toggleMenu(el, menuItem(id)); break;
      case "menu-app": toggleMenu(el, menuApp()); break;
      case "exportar": abrirExportar(); break;
      case "estornar": abrirEstorno(id); break;
      case "backup-baixar": baixarBackup(); break;
      case "mais":
        state.limite += 50;
        renderLancList();
        break;
      case "limpar-filtros":
        state.filtros = { periodo: "todos", tipo: "", kit: "", busca: "" };
        renderView();
        break;
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "busca-kits") {
      state.busca = t.value;
      renderKitsList();
    } else if (t.id === "f-busca") {
      state.filtros.busca = t.value;
      state.limite = 50;
      renderLancList();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    const mapa = { "f-periodo": "periodo", "f-tipo": "tipo", "f-kit": "kit" };
    if (mapa[t.id]) {
      state.filtros[mapa[t.id]] = t.value;
      state.limite = 50;
      renderLancList();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (menuAtual && !menuAtual.m.contains(e.target) && !menuAtual.anchor.contains(e.target)) closeMenu();
  });
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menuAtual) {
      const a = menuAtual.anchor;
      closeMenu();
      a.focus();
    } else if (modalAtual) {
      closeModal();
    }
  });

  /* No modo compartilhado, atualiza os dados ao voltar para a aba e a cada minuto. */
  async function atualizarRemoto() {
    if (!store || store.mode !== "supabase" || modalAtual || menuAtual || !$("#view")) return;
    const ativo = document.activeElement;
    if (ativo && ativo.matches && ativo.matches("input, select, textarea")) return;
    try {
      state.db = await store.load();
      renderView();
    } catch (e) {
      console.error(e);
    }
  }
  window.addEventListener("focus", atualizarRemoto);
  setInterval(atualizarRemoto, 60000);

  /* ======================================================================
     Início
     ====================================================================== */

  if (!CONFIG.senhaHash) {
    app.innerHTML = `<main class="container"><div class="card empty"><h3>Configuração incompleta</h3><p>Defina <strong>senhaHash</strong> em js/config.js.</p></div></main>`;
  } else if (sessionStorage.getItem(AUTH_KEY) === CONFIG.senhaHash) {
    startApp();
  } else {
    renderLogin();
  }
})();
