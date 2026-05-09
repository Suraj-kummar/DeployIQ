import subprocess
import os

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running {cmd}: {result.stderr}")
    return result.stdout.strip()

def main():
    # Get all untracked files
    files_str = run_cmd("git ls-files -o --exclude-standard")
    if not files_str:
        print("No files to commit.")
        return
        
    files = files_str.split("\n")
    total_files = len(files)
    
    print(f"Found {total_files} files to commit.")
    
    for i, file in enumerate(files, 1):
        # Add file
        run_cmd(f"git add \"{file}\"")
        # Commit file
        run_cmd(f"git commit -m \"Upload part {i}: Add {os.path.basename(file)}\"")
        print(f"Committed part {i}/{total_files}: {file}")
        
    print("Pushing to remote...")
    run_cmd("git push -u origin main") # or master
    
    print("Done!")

if __name__ == "__main__":
    main()
