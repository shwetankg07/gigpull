-- gigpull — Postgres schema for the deployed startup tab.
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS companies (
  id            serial PRIMARY KEY,
  identity_key  text NOT NULL UNIQUE,
  mode          text NOT NULL,
  name          text NOT NULL,
  city          text,
  category      text,
  website       text,
  source_url    text,
  lat           real,
  lon           real,
  created_at    text NOT NULL,
  updated_at    text NOT NULL
);
CREATE INDEX IF NOT EXISTS companies_mode_idx ON companies (mode);

CREATE TABLE IF NOT EXISTS signals (
  id          serial PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  source      text NOT NULL,
  kind        text NOT NULL,
  value_json  text NOT NULL,
  observed_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_company_idx ON signals (company_id);

CREATE TABLE IF NOT EXISTS probes (
  id          serial PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  kind        text NOT NULL,
  ok          boolean NOT NULL,
  result_json text NOT NULL,
  ran_at      text NOT NULL,
  expires_at  text NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id          serial PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  type        text NOT NULL,
  value       text NOT NULL,
  source      text NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company_id);

CREATE TABLE IF NOT EXISTS scores (
  id                  serial PRIMARY KEY,
  company_id          integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  total               real NOT NULL,
  breakdown_json      text NOT NULL,
  weights_version     text NOT NULL,
  scored_at           text NOT NULL,
  rerank_verdict      text,
  rerank_reason       text,
  rerank_adjustment   real,
  rerank_fit          text,
  adjusted_total      real,
  reranked_at         text,
  rerank_signal_hash  text
);
CREATE INDEX IF NOT EXISTS scores_company_idx ON scores (company_id, scored_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id           serial PRIMARY KEY,
  company_id   integer NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'new',
  brief_md     text,
  rating       integer,
  contacted_at text,
  follow_up_at text,
  notes        text,
  -- Any of job / gig / interesting, as a sorted JSON array. One company can
  -- be more than one, which is why this is not an enum column.
  intent       text NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS runs (
  id          serial PRIMARY KEY,
  collector   text NOT NULL,
  mode        text NOT NULL,
  started_at  text NOT NULL,
  finished_at text,
  ok          boolean,
  item_count  integer,
  error       text
);

CREATE TABLE IF NOT EXISTS graph_nodes (
  id         text PRIMARY KEY,
  kind       text NOT NULL,
  label      text NOT NULL,
  company_id integer REFERENCES companies (id) ON DELETE CASCADE,
  sector     text,
  degree     integer NOT NULL,
  x          real NOT NULL,
  y          real NOT NULL
);
CREATE INDEX IF NOT EXISTS graph_nodes_kind_idx ON graph_nodes (kind);

CREATE TABLE IF NOT EXISTS graph_edges (
  id     serial PRIMARY KEY,
  source text NOT NULL,
  target text NOT NULL,
  kind   text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS graph_edges_pair_idx ON graph_edges (source, target, kind);
CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges (source);

-- Row level security.
--
-- The browser is given the anon key, which is public by design — anyone who
-- views source has it. RLS is the only thing standing between that key and
-- every founder's contact details in this database, so it is enabled on every
-- table with no anon policy anywhere. Reads require a signed-in user; writes
-- happen through the service role, which bypasses RLS and is never sent to
-- the browser.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','signals','probes','contacts','scores','leads','runs',
    'graph_nodes','graph_edges'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_authenticated_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      t || '_authenticated_read', t);
  END LOOP;

  -- The board writes lead status and intent directly as the signed-in user.
  DROP POLICY IF EXISTS leads_authenticated_write ON leads;
  CREATE POLICY leads_authenticated_write ON leads
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;
