from functools import lru_cache
@lru_cache(maxsize=128)
def expensive(n):
    return n * n
