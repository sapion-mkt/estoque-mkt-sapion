-- =========================================================================
-- Estoque de Marketing — Sapion
-- Estrutura do banco compartilhado (Supabase).
-- Como usar: no painel do Supabase, abra "SQL Editor" > "New query",
-- cole todo este arquivo e clique em "Run".
-- =========================================================================

create table if not exists public.kits (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.itens (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lancamentos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Acesso pelo site (chave pública "anon").
-- A proteção de entrada é a senha do sistema. Veja a seção "Segurança" do README.
alter table public.kits enable row level security;
alter table public.itens enable row level security;
alter table public.lancamentos enable row level security;

drop policy if exists "acesso_site" on public.kits;
drop policy if exists "acesso_site" on public.itens;
drop policy if exists "acesso_site" on public.lancamentos;

create policy "acesso_site" on public.kits for all to anon using (true) with check (true);
create policy "acesso_site" on public.itens for all to anon using (true) with check (true);
create policy "acesso_site" on public.lancamentos for all to anon using (true) with check (true);
