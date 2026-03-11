"""
Obsidian-to-blog publish pipeline.

Scans the Obsidian vault for markdown files with `publish: deflocksc` in YAML
frontmatter, processes them (converts wikilinks, strips vault metadata), and
copies them into src/content/blog/ for the Astro site.

Usage:
    python scripts/publish.py
"""

import os
import re
import shutil
import subprocess
import sys

import yaml

VAULT_PATH = r"C:\Users\tim\OneDrive\Documents\Tim's Vault"
BLOG_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "content", "blog")

# Frontmatter tags to strip (vault-internal metadata)
STRIP_TAG_PREFIXES = ("area-", "type-", "status-")

# Required frontmatter fields for blog posts
REQUIRED_FIELDS = ("title", "date", "summary")


def find_publishable_files(vault_path: str) -> list[str]:
    """Walk the vault and find markdown files with `publish: deflocksc`."""
    results = []
    for root, dirs, files in os.walk(vault_path):
        # Skip hidden directories and common non-content dirs
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fname in files:
            if not fname.endswith(".md"):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                if has_publish_tag(content):
                    results.append(fpath)
            except (OSError, UnicodeDecodeError):
                continue
    return results


def has_publish_tag(content: str) -> bool:
    """Check if content has `publish: deflocksc` in YAML frontmatter."""
    if not content.startswith("---"):
        return False
    end = content.find("---", 3)
    if end == -1:
        return False
    frontmatter = content[3:end]
    try:
        data = yaml.safe_load(frontmatter)
    except yaml.YAMLError:
        return False
    if not isinstance(data, dict):
        return False
    publish = data.get("publish", "")
    if isinstance(publish, str):
        return publish.strip().lower() == "deflocksc"
    if isinstance(publish, list):
        return "deflocksc" in [str(p).strip().lower() for p in publish]
    return False


def process_content(content: str) -> str:
    """Process markdown content for the blog.

    - Strips the `publish` field from frontmatter
    - Strips vault-internal tags
    - Converts [[wikilinks|display text]] to display text
    - Converts [[wikilinks]] to plain text
    """
    # Split frontmatter and body
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            frontmatter_str = content[3:end]
            body = content[end + 3:].lstrip("\n")

            try:
                data = yaml.safe_load(frontmatter_str)
            except yaml.YAMLError:
                data = {}

            if isinstance(data, dict):
                # Remove publish field
                data.pop("publish", None)

                # Mark as draft (flip to false or remove when ready to publish)
                data["draft"] = True

                # Strip vault-internal tags
                if "tags" in data and isinstance(data["tags"], list):
                    data["tags"] = [
                        t for t in data["tags"]
                        if not any(
                            str(t).startswith(prefix) for prefix in STRIP_TAG_PREFIXES
                        )
                    ]
                    if not data["tags"]:
                        del data["tags"]

                # Rebuild frontmatter
                frontmatter_str = yaml.dump(
                    data, default_flow_style=False, allow_unicode=True, sort_keys=False
                ).strip()

            content = f"---\n{frontmatter_str}\n---\n\n{body}"

    # Convert [[wikilinks|display text]] to display text
    content = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", content)

    # Convert [[wikilinks]] to plain text (just the link text)
    content = re.sub(r"\[\[([^\]]+)\]\]", r"\1", content)

    return content


def validate_frontmatter(content: str, filepath: str) -> bool:
    """Check that required frontmatter fields exist."""
    if not content.startswith("---"):
        print(f"  SKIP {filepath}: no frontmatter")
        return False

    end = content.find("---", 3)
    if end == -1:
        print(f"  SKIP {filepath}: malformed frontmatter")
        return False

    try:
        data = yaml.safe_load(content[3:end])
    except yaml.YAMLError:
        print(f"  SKIP {filepath}: invalid YAML")
        return False

    if not isinstance(data, dict):
        print(f"  SKIP {filepath}: frontmatter is not a dict")
        return False

    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        print(f"  SKIP {filepath}: missing fields: {', '.join(missing)}")
        return False

    return True


def main():
    if not os.path.isdir(VAULT_PATH):
        print(f"ERROR: Vault not found at {VAULT_PATH}")
        sys.exit(1)

    # Resolve the repo root (parent of scripts/)
    repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

    os.makedirs(BLOG_DIR, exist_ok=True)

    print(f"Scanning vault: {VAULT_PATH}")
    files = find_publishable_files(VAULT_PATH)
    print(f"Found {len(files)} file(s) with publish: deflocksc")

    processed = 0
    published_files = []
    for fpath in files:
        fname = os.path.basename(fpath)
        print(f"\nProcessing: {fname}")

        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        content = process_content(content)

        if not validate_frontmatter(content, fname):
            continue

        # Write to blog directory
        slug = fname.lower().replace(" ", "-")
        dest = os.path.join(BLOG_DIR, slug)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"  -> {dest}")
        published_files.append(dest)
        processed += 1

    print(f"\nDone. {processed} file(s) published to {BLOG_DIR}")

    if processed == 0:
        print("No files to commit.")
        return

    # Git add, commit, push
    print("\nCommitting and pushing to remote...")
    try:
        for f in published_files:
            subprocess.run(["git", "add", f], cwd=repo_root, check=True)

        slugs = ", ".join(os.path.basename(f) for f in published_files)
        msg = f"content(blog): publish {processed} post(s)\n\n{slugs}"
        subprocess.run(["git", "commit", "-m", msg], cwd=repo_root, check=True)
        subprocess.run(["git", "push"], cwd=repo_root, check=True)
        print("Pushed to remote. Netlify will auto-rebuild.")
    except subprocess.CalledProcessError as e:
        print(f"Git error: {e}")
        print("Files were written but not committed. Run git commands manually.")
        sys.exit(1)


if __name__ == "__main__":
    main()
