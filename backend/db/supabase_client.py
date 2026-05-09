# backend/db/supabase_client.py
# Server-side Supabase client using SERVICE_ROLE key.
# Bypasses RLS — only used inside FastAPI (never exposed to browser).

import os
from functools import lru_cache
from supabase import create_client, Client

@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """
    Returns a singleton Supabase client authenticated with SERVICE_ROLE_KEY.
    lru_cache ensures the client is created once per process.
    SERVICE_ROLE_KEY bypasses RLS — always pass team_id explicitly in queries.
    """
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    return create_client(url, key)
