CREATE TABLE public.captcha_attempts (
  id bigserial PRIMARY KEY,
  client_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captcha_attempts_key_time ON public.captcha_attempts (client_key, created_at DESC);

CREATE TABLE public.captcha_used_tokens (
  token_hash text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.captcha_attempts TO service_role;
GRANT ALL ON public.captcha_used_tokens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.captcha_attempts_id_seq TO service_role;
ALTER TABLE public.captcha_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captcha_used_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) can touch these tables.

-- Atomically records an attempt and returns whether the caller is within the limit.
CREATE OR REPLACE FUNCTION public.captcha_rate_check(_key text, _max int, _window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  DELETE FROM captcha_attempts WHERE created_at < now() - interval '1 day';
  DELETE FROM captcha_used_tokens WHERE used_at < now() - interval '1 day';
  SELECT count(*) INTO n FROM captcha_attempts
   WHERE client_key = _key AND created_at > now() - make_interval(secs => _window_seconds);
  IF n >= _max THEN RETURN false; END IF;
  INSERT INTO captcha_attempts (client_key) VALUES (_key);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.captcha_rate_check(text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.captcha_rate_check(text,int,int) TO service_role;