# Windows PowerShell запуск (SQLite, .env)
python -m venv venv
.\\venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
python -m waitress --listen=0.0.0.0:8000 app:app