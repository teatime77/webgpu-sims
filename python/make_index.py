from pathlib import Path

# Define the directory to search and the target file name
search_dir = Path('.')

paths = [str(file_path).replace("\\", "/") + "\n" for file_path in search_dir.rglob('schema.js')]

with open("index.txt", "w", encoding="utf-8") as file:
    file.writelines(paths)
