import os
def convert(name):
    os.system(f"pdftoppm {name} out")
