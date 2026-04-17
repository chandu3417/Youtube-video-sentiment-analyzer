import json
from pathlib import Path


def parse_env(env_path: Path) -> dict:
    values = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    ext_path = Path(__file__).resolve().parent
    template_path = ext_path / "config.template.js"
    output_path = ext_path / "config.js"

    env_values = parse_env(env_path)
    api_key = env_values.get("GEMINI_API_KEY", "")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not found in .env.")

    template = template_path.read_text(encoding="utf-8")
    rendered = template.replace(
        'export const GEMINI_API_KEY = "";',
        f"export const GEMINI_API_KEY = {json.dumps(api_key)};",
    )
    output_path.write_text(rendered, encoding="utf-8")
    print(f"Created {output_path}")


if __name__ == "__main__":
    main()
