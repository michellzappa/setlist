#!/bin/bash
cd ~/Documents/repos/septena
exec python3 -m uvicorn main:app --port 4445
