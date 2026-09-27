#!/usr/bin/env python3
"""Launcher so the tool can run as ./subenum.py or a symlink on PATH."""
from subenum.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
