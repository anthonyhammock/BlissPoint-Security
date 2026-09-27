from contextlib import contextmanager
@contextmanager
def timer():
    import time
    start = time.time()
    yield
    print(time.time() - start)
