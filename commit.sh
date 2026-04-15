#!/bin/bash

# commit.sh - Commits كل ملف على حدة (Individual file commits)
# This script iterates through all changed files and commits them one by one.

# Use porcelain v1 for consistent output
# -uall ensures that files within untracked directories are listed individually
git status --porcelain=v1 -uall | while IFS= read -r line; do
    # Extract status (first 2 characters) and filename (from index 3 onwards)
    status_code="${line:0:2}"
    file_path="${line:3}"

    # Remove potential quotes around filename (if it contains spaces)
    file_path=$(echo "$file_path" | sed -e 's/^"//' -e 's/"$//')

    # Skip empty lines
    if [ -z "$file_path" ]; then
        continue
    fi

    # Determine the verb based on the status code
    # X Y
    # X: Status of index
    # Y: Status of work tree
    case "$status_code" in
        " M" | "M ")
            action="update: modified"
            git add "$file_path"
            ;;
        "??" | " A" | "A ")
            action="feat: added"
            git add "$file_path"
            ;;
        " D" | "D ")
            action="refactor: deleted"
            git rm --cached "$file_path" > /dev/null 2>&1 || git rm "$file_path" > /dev/null 2>&1
            ;;
        "R ")
            action="refactor: renamed"
            # In "R ", the file is already staged. file_path is "old -> new"
            # We don't need to git add here as it's already in the index.
            # However, for the commit message, "old -> new" is descriptive.
            ;;
        *)
            action="chore: updated"
            git add "$file_path"
            ;;
    esac

    # Commit with a descriptive message
    echo "Committing: $file_path"
    git commit -m "$action $file_path"
done

echo "Done! All files committed individually."
