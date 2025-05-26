#!/bin/bash
# Linux/Mac запуск (SQLite, .env)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
gunicorn -w 4 -b 0.0.0.0:8000 app:app