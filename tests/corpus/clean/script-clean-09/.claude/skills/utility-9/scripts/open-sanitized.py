import os
def load_report(name):
    safe = os.path.basename(name)
    return open(f"./reports/{safe}").read()
