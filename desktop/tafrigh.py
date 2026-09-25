"""Entry point of the desktop build (PyInstaller). The same executable also runs the model worker:
the app starts `Tafrigh --transcribe <arguments>` for every local transcription."""
import sys

if __name__ == "__main__":
    if sys.argv[1:2] == ["--transcribe"]:
        from app.worker import run
        run(sys.argv[2:])
    else:
        from app.desktop import main
        main()
