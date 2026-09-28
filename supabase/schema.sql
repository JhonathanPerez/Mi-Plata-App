-- =====================================================================
-- Mi Plata · esquema de Supabase (Postgres)
-- Cómo usarlo: Supabase ▸ SQL Editor ▸ New query ▸ pega TODO este archivo ▸ Run.
-- Es seguro ejecutarlo más de una vez (usa "if not exists" / "or replace").
--
-- Reglas de diseño:
--  * Cada fila pertenece a un usuario (user_id) y RLS impide ver o tocar filas ajenas.
--  * Los IDs son TEXT (los de fábrica son como 'cat_alimentacion'), por eso la llave es (user_id, id).
--  * Dinero en pesos enteros (bigint). Nada de decimales.
--  * updated_at lo pone el SERVIDOR (trigger): sirve de cursor para sincronizar sin depender del reloj del teléfono.
--  * Los borrados serán "suaves" (deleted_at) para que se propaguen entre dispositivos.
-- =====================================================================

-- ---------- Función común: sellar updated_at en el servidor ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- categories ----------
create table if not exists public.categories (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  name        text        not null check (char_length(name) between 1 and 30),
  icon        text        not null,
  color       text        not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);
create unique index if not exists categories_user_name_uq
  on public.categories (user_id, lower(name)) where deleted_at is null;
create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);

-- ---------- payment_methods ----------
create table if not exists public.payment_methods (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id            text        not null,
  name          text        not null check (char_length(name) between 1 and 30),
  type          text        not null check (type in ('cash', 'debit_card', 'credit_card', 'other')),
  icon          text        not null,
  color         text        not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  last4         text        check (last4 is null or last4 ~ '^[0-9]{4}$'),  -- nunca el número completo
  is_active     boolean     not null default true,
  sort_order    integer     not null default 0,
  credit_limit  bigint      check (credit_limit is null or credit_limit >= 0),
  cutoff_day    integer     check (cutoff_day is null or cutoff_day between 1 and 31),
  due_day       integer     check (due_day is null or due_day between 1 and 31),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (user_id, id)
);
create unique index if not exists payment_methods_user_name_uq
  on public.payment_methods (user_id, lower(name)) where deleted_at is null;
create index if not exists payment_methods_user_updated_idx on public.payment_methods (user_id, updated_at);

-- ---------- expenses ----------
create table if not exists public.expenses (
  user_id            uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id                 text        not null,
  amount             bigint      not null check (amount > 0 and amount <= 999999999999),
  category_id        text        not null,
  payment_method_id  text        not null,
  expense_date       date        not null,
  expense_time       time,
  note               text        check (note is null or char_length(note) <= 200),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  primary key (user_id, id),
  foreign key (user_id, category_id)       references public.categories (user_id, id),
  foreign key (user_id, payment_method_id) references public.payment_methods (user_id, id)
);
create index if not exists expenses_user_updated_idx  on public.expenses (user_id, updated_at);
create index if not exists expenses_user_date_idx     on public.expenses (user_id, expense_date);
create index if not exists expenses_user_category_idx on public.expenses (user_id, category_id);
create index if not exists expenses_user_method_idx   on public.expenses (user_id, payment_method_id);

-- ---------- budgets ----------
create table if not exists public.budgets (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  year_month  text        not null check (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount      bigint      not null check (amount >= 0 and amount <= 999999999999),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id),
  unique (user_id, year_month)
);
create index if not exists budgets_user_updated_idx on public.budgets (user_id, updated_at);

-- ---------- settings (opcional: preferencias que quieras compartir entre dispositivos) ----------
create table if not exists public.settings (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key         text        not null,
  value       text        not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- ---------- Triggers de updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['categories', 'payment_methods', 'expenses', 'budgets', 'settings']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before insert or update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Seguridad: RLS en TODAS las tablas ----------
do $$
declare t text;
begin
  foreach t in array array['categories', 'payment_methods', 'expenses', 'budgets', 'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "solo lo mio" on public.%I', t);
    execute format(
      'create policy "solo lo mio" on public.%I
         for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ---------- Verificación (debe mostrar rowsecurity = true en las 5 tablas) ----------
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('categories', 'payment_methods', 'expenses', 'budgets', 'settings')
order by tablename;
