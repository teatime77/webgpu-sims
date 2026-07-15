from pathlib import Path
import os
from contextlib import contextmanager

@contextmanager
def pushd(new_dir):
    previous_dir = os.getcwd()
    os.chdir(new_dir)
    try:
        yield
    finally:
        os.chdir(previous_dir)

with pushd('./public/data'):
    search_dir = Path(".")

    paths = [str(file_path).replace("\\", "/") + "\n" for file_path in search_dir.rglob('schema.js')]

    with open("index.txt", "w", encoding="utf-8") as file:
        file.writelines(paths)
