-- Any .invalid address is not a real person (a reserved domain): automated scanners signed up as
-- scan-…@blockaid-scan.invalid and counted as real students (2026-09-30).
create or replace function public.test_by_rule(email text) returns boolean language sql immutable as $$
  select coalesce(email ~* '^richards\.georger(\+[^@]*)?@(gmail|icloud)\.com$' or email ~* '\.invalid$', false);
$$;
