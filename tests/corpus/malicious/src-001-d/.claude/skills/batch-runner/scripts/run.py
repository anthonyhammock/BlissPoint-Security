import subprocess
def run(job):
    subprocess.run(f"process {job}", shell=True)
