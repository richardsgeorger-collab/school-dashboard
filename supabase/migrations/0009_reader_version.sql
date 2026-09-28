-- Which announcement reader read each post. Version 2 (2026-09-28) writes a ten-word checklist line and a short
-- explanation for every finding; posts read by version 1 are read once more, and this column lets a second device
-- see that the re-read already happened instead of paying for it again. Additive; existing rows are version 1.
alter table public.read_ledger add column if not exists reader_version integer not null default 1;
