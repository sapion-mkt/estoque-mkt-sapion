/* =========================================================================
   Camada de dados — Estoque de Marketing Sapion

   Dois modos, com a mesma interface:
   - LocalStore: salva no navegador (localStorage). Funciona sem configurar nada.
   - SupabaseStore: salva num banco compartilhado (Supabase), para a equipe toda.

   Interface:
     await store.init()
     await store.load()           -> { kits, itens, lancamentos }
     await store.commit(changes)  -> grava { upsert: {kits, itens, lancamentos}, remove: {kits, itens} }
     await store.replaceAll(db)   -> substitui tudo (restauração de backup)
   ========================================================================= */

window.Store = (() => {
  "use strict";

  const TABLES = ["kits", "itens", "lancamentos"];
  const LS_KEY = "sapion-estoque-v1";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";

  function emptyDb() {
    return { kits: [], itens: [], lancamentos: [] };
  }

  function toInt(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  /* Garante que os dados tenham o formato esperado (inclusive backups antigos). */
  function normalize(db) {
    const out = emptyDb();
    if (!db || typeof db !== "object") return out;
    out.kits = (Array.isArray(db.kits) ? db.kits : [])
      .filter((k) => k && k.id)
      .map((k) => ({ ...k, nome: String(k.nome || "Kit sem nome"), descricao: String(k.descricao || "") }));
    out.itens = (Array.isArray(db.itens) ? db.itens : [])
      .filter((i) => i && i.id)
      .map((i) => ({
        ...i,
        nome: String(i.nome || "Item sem nome"),
        codigo: String(i.codigo || ""),
        unidade: String(i.unidade || "un"),
        quantidade: toInt(i.quantidade),
        estoqueMinimo: Math.max(0, toInt(i.estoqueMinimo)),
      }));
    out.lancamentos = (Array.isArray(db.lancamentos) ? db.lancamentos : [])
      .filter((l) => l && l.id)
      .map((l) => ({
        ...l,
        delta: toInt(l.delta),
        saldoAnterior: toInt(l.saldoAnterior),
        saldoNovo: toInt(l.saldoNovo),
        observacao: String(l.observacao || ""),
        responsavel: String(l.responsavel || ""),
      }));
    return out;
  }

  /* Aplica um conjunto de alterações a um objeto de dados em memória. */
  function apply(db, changes) {
    const up = (changes && changes.upsert) || {};
    const rm = (changes && changes.remove) || {};
    for (const t of TABLES) {
      for (const row of up[t] || []) {
        const idx = db[t].findIndex((r) => r.id === row.id);
        if (idx >= 0) db[t][idx] = row;
        else db[t].push(row);
      }
      if (rm[t] && rm[t].length) {
        const ids = new Set(rm[t]);
        db[t] = db[t].filter((r) => !ids.has(r.id));
      }
    }
    return db;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Não foi possível carregar " + src));
      document.head.appendChild(s);
    });
  }

  /* ---------------------------------------------------------------------- */

  class LocalStore {
    constructor() {
      this.mode = "local";
    }

    async init() {
      localStorage.setItem(LS_KEY + "-teste", "1");
      localStorage.removeItem(LS_KEY + "-teste");
    }

    async load() {
      const raw = localStorage.getItem(LS_KEY);
      return normalize(raw ? JSON.parse(raw) : emptyDb());
    }

    save(db) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(db));
      } catch (e) {
        throw new Error("o armazenamento do navegador está cheio ou bloqueado.");
      }
    }

    async commit(changes) {
      const db = await this.load();
      this.save(apply(db, changes));
    }

    async replaceAll(db) {
      this.save(normalize(db));
    }
  }

  /* ---------------------------------------------------------------------- */

  class SupabaseStore {
    constructor(url, key) {
      this.mode = "supabase";
      this.url = url;
      this.key = key;
    }

    async init() {
      if (!window.supabase) await loadScript(SUPABASE_CDN);
      this.client = window.supabase.createClient(this.url, this.key, {
        auth: { persistSession: false },
      });
      const { error } = await this.client.from("kits").select("id").limit(1);
      if (error) throw new Error("Falha ao conectar ao banco (Supabase): " + error.message);
    }

    async fetchAll(table) {
      const page = 1000;
      let from = 0;
      const rows = [];
      for (;;) {
        const { data, error } = await this.client
          .from(table)
          .select("id,data")
          .order("id")
          .range(from, from + page - 1);
        if (error) throw new Error(error.message);
        rows.push(...data.map((r) => ({ ...r.data, id: r.id })));
        if (data.length < page) break;
        from += page;
      }
      return rows;
    }

    async load() {
      const [kits, itens, lancamentos] = await Promise.all(TABLES.map((t) => this.fetchAll(t)));
      return normalize({ kits, itens, lancamentos });
    }

    async upsert(table, rows) {
      if (!rows || !rows.length) return;
      const now = new Date().toISOString();
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ id: r.id, data: r, updated_at: now }));
        const { error } = await this.client.from(table).upsert(chunk);
        if (error) throw new Error(error.message);
      }
    }

    async remove(table, ids) {
      if (!ids || !ids.length) return;
      const { error } = await this.client.from(table).delete().in("id", ids);
      if (error) throw new Error(error.message);
    }

    async commit(changes) {
      const up = changes.upsert || {};
      const rm = changes.remove || {};
      // Lançamentos primeiro: se algo falhar no meio, o histórico fica registrado.
      await this.upsert("lancamentos", up.lancamentos);
      await this.upsert("kits", up.kits);
      await this.upsert("itens", up.itens);
      await this.remove("itens", rm.itens);
      await this.remove("kits", rm.kits);
    }

    async replaceAll(db) {
      const clean = normalize(db);
      for (const t of TABLES) {
        const { error } = await this.client.from(t).delete().neq("id", "");
        if (error) throw new Error(error.message);
      }
      for (const t of TABLES) await this.upsert(t, clean[t]);
    }
  }

  /* Aceita o endereço do projeto em qualquer formato copiado do painel do Supabase
     (com /rest/v1/, barra no final ou sem https://) e mantém só https://xxxx.supabase.co */
  function limparUrl(url) {
    let s = String(url).trim().replace(/^["']|["']$/g, "");
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    try {
      return new URL(s).origin;
    } catch (e) {
      return s.replace(/\/+$/, "");
    }
  }

  function create(config) {
    if (config && config.supabaseUrl && config.supabaseAnonKey) {
      const chave = String(config.supabaseAnonKey).trim().replace(/^["']|["']$/g, "");
      return new SupabaseStore(limparUrl(config.supabaseUrl), chave);
    }
    return new LocalStore();
  }

  return { create, apply, normalize, emptyDb, limparUrl };
})();
