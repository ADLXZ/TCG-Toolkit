import importlib.util
from pathlib import Path
import re
import pytest

spec = importlib.util.spec_from_file_location("build_pages", "scripts/build_pages.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_public_artifact(tmp_path):
    output = tmp_path / "pages"
    module.build(output, "https://api.example.com")
    assert 'https://api.example.com' in (output / "api-config.js").read_text()
    assert (output / ".nojekyll").exists()
    assert all(p.suffix in {".html", ".css", ".js"} or p.name == ".nojekyll" for p in output.iterdir())
    html = (output / "index.html").read_text(encoding="utf-8")
    for value in re.findall(r'(?:src|href)="([^"#]+)"', html):
        assert not value.startswith("/")
        if value.startswith("./") and value != "./":
            assert (output / value).exists()


@pytest.mark.parametrize("url", ["", "http://api.example.com", "https://api.example.com/path", "https://user@api.example.com"])
def test_invalid_api(tmp_path, url):
    with pytest.raises(ValueError):
        module.build(tmp_path / "pages", url)
