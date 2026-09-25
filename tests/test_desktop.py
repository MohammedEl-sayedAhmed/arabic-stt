"""Tests for the desktop app's identity on Linux: the application-menu entry that gives the window its icon,
and the window class of the browser window. No display is needed.
Run: .venv/bin/python -m unittest discover -s tests -v
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app import desktop  # noqa: E402


@unittest.skipUnless(sys.platform.startswith("linux"), "Linux desktop entries")
class LauncherTests(unittest.TestCase):
    def test_entry_names_the_window_class_and_icon_and_is_kept_current(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"XDG_DATA_HOME": d}):
            dest = desktop.install_launcher()
            self.assertEqual(dest, Path(d) / "applications" / "tafrigh.desktop")
            text = dest.read_text(encoding="utf-8")
            self.assertIn(f"StartupWMClass={desktop.WM_CLASS}\n", text)
            self.assertIn(f"Icon={ROOT / 'app' / 'static' / 'icon-512.png'}\n", text)
            self.assertIn("-m app.desktop", text)
            dest.write_text("[Desktop Entry]\nName=old\n", encoding="utf-8")  # an older version is replaced
            desktop.install_launcher()
            self.assertEqual(dest.read_text(encoding="utf-8"), text)

    def test_browser_window_gets_the_class(self):
        with mock.patch.object(desktop, "browser_candidates", return_value=["/usr/bin/chromium"]), \
                mock.patch.object(desktop.subprocess, "Popen") as popen:
            desktop.app_mode_browser("http://127.0.0.1:8765/", "/tmp/profile")
        args = popen.call_args.args[0]
        self.assertIn(f"--class={desktop.WM_CLASS}", args)
        self.assertIn("--app=http://127.0.0.1:8765/", args)


class IconTests(unittest.TestCase):
    def test_window_icon_exists(self):
        icon = desktop.app_icon()
        if os.name == "nt" and icon is None:
            self.skipTest("no desktop/tafrigh.ico in this checkout")
        self.assertTrue(Path(icon).is_file(), icon)


if __name__ == "__main__":
    unittest.main()
