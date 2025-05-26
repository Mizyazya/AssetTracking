from flask import Flask, render_template, request, redirect, url_for, flash, abort, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os
from collections import defaultdict
from sqlalchemy import text
import pytz
import shutil
from dotenv import load_dotenv
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask import session
import re
from functools import wraps

load_dotenv()

# Debug: print current DATABASE_URL from environment
print("DATABASE_URL in env:", os.environ.get('DATABASE_URL'))

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key')

db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.strip():
    if 'localhost' in db_url or '127.0.0.1' in db_url:
        print(f"[INFO] Використовується локальний PostgreSQL: {db_url}")
    elif '@db:' in db_url:
        print("[WARNING] DATABASE_URL містить '@db:'. Якщо ви запускаєте локально (не через Docker Compose), змініть DATABASE_URL на порожній рядок або на SQLite. Зараз буде спроба підключення до контейнера 'db', що призведе до помилки, якщо він не запущений.")
    else:
        print(f"[INFO] Використовується DATABASE_URL: {db_url}")
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
else:
    print("[INFO] DATABASE_URL не задано або порожній. Використовується SQLite (assets.db)")
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///assets.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.template_folder = 'templates'
db = SQLAlchemy(app)

TIMEZONE = os.environ.get('TIMEZONE', 'Europe/Kyiv')
KYIV_TZ = pytz.timezone(TIMEZONE)

# === Flask-Login setup ===
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# === Models ===
class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    people = db.relationship('Person', backref='location', lazy=True)

class Person(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    location_id = db.Column(db.Integer, db.ForeignKey('location.id'), nullable=True)
    assets = db.relationship('Asset', backref='holder', lazy=True, foreign_keys='Asset.current_holder_id')
    phone = db.Column(db.String(15), nullable=True)

class Asset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    serial = db.Column(db.String(100), unique=True)
    quantity = db.Column(db.Integer, default=1)
    type = db.Column(db.String(20), nullable=False)  # 'active' або 'component'
    status = db.Column(db.String(50), default='На складі')
    current_holder_id = db.Column(db.Integer, db.ForeignKey('person.id'))
    comments = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)  # Додаємо поле для дати створення

class AssetLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey('asset.id'), nullable=False)
    person_id = db.Column(db.Integer, db.ForeignKey('person.id'))
    action = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(KYIV_TZ))
    comment = db.Column(db.Text)
    quantity = db.Column(db.Integer, nullable=True)
    # Додаємо зв'язки для зручного доступу до asset та person
    asset = db.relationship('Asset', backref=db.backref('logs', lazy=True))
    person = db.relationship('Person', backref=db.backref('logs', lazy=True))

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey('asset.id'), nullable=False)
    text = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='active')  # active, closed
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(KYIV_TZ))
    closed_at = db.Column(db.DateTime, nullable=True)
    close_comment = db.Column(db.Text)
    asset = db.relationship('Asset', backref=db.backref('tasks', lazy=True))

# === User model ===
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(10), default='user')  # 'admin' або 'user'
    sessions = db.relationship('UserSession', backref='user', cascade="all, delete-orphan", lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def is_admin(self):
        return self.role == 'admin'

    def is_user(self):
        return self.role == 'user'

# --- Модель для логування сесій і входів ---
class UserSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    session_id = db.Column(db.String(128), nullable=False, unique=True)
    login_time = db.Column(db.DateTime, default=datetime.utcnow)
    logout_time = db.Column(db.DateTime, nullable=True)
    ip = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(256), nullable=True)
    active = db.Column(db.Boolean, default=True)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Декоратор для захисту адмінських сторінок ---
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin():
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

# === Routes ===
@app.route('/')
def index():
    # --- Фільтри ---
    name = request.args.get('name', '').strip()
    serial = request.args.get('serial', '').strip()
    comments = request.args.get('comments', '').strip()
    location_id = request.args.get('location_id', '').strip()
    person_id = request.args.get('person_id', '').strip()
    type_ = request.args.get('type', '').strip()
    sort = request.args.get('sort', 'created_at')
    order = request.args.get('order', 'desc')
    # --- Запити для фільтрів ---
    locations = Location.query.all()
    people = Person.query.all()
    # --- Базовий запит ---
    assets_query = Asset.query
    if name:
        assets_query = assets_query.filter(Asset.name.ilike(f'%{name}%'))
    if serial:
        assets_query = assets_query.filter(Asset.serial.ilike(f'%{serial}%'))
    if comments:
        assets_query = assets_query.filter(Asset.comments.ilike(f'%{comments}%'))
    if location_id:
        # Фільтруємо по людині, яка зараз тримає актив або компонент
        assets_query = assets_query.join(Person, Asset.current_holder_id == Person.id).filter(Person.location_id == int(location_id))
        # Додаємо всі компоненти, які видані людям з цієї локації (через логи)
        people_ids = [p.id for p in Person.query.filter_by(location_id=int(location_id)).all()]
        component_ids = set()
        for asset in Asset.query.filter_by(type='component').all():
            holders_info = defaultdict(int)
            for log in AssetLog.query.filter_by(asset_id=asset.id).order_by(AssetLog.timestamp):
                if log.action == 'Видано' and log.person_id:
                    holders_info[log.person_id] += log.quantity or 0
                elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                    holders_info[log.person_id] -= log.quantity or 0
            for pid in people_ids:
                if holders_info.get(pid, 0) > 0:
                    component_ids.add(asset.id)
        if component_ids:
            assets_query = assets_query.union(Asset.query.filter(Asset.id.in_(component_ids)))
    if person_id:
        # Показуємо всі активи, які закріплені за людиною
        assets_query = assets_query.filter(Asset.current_holder_id == int(person_id))
        # Додаємо всі компоненти, які видані цій людині (через логи)
        # Отримаємо id компонентів, які зараз у цієї людини
        component_ids = set()
        for asset in Asset.query.filter_by(type='component').all():
            holders_info = defaultdict(int)
            for log in AssetLog.query.filter_by(asset_id=asset.id).order_by(AssetLog.timestamp):
                if log.action == 'Видано' and log.person_id:
                    holders_info[log.person_id] += log.quantity or 0
                elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                    holders_info[log.person_id] -= log.quantity or 0
            if holders_info.get(int(person_id), 0) > 0:
                component_ids.add(asset.id)
        if component_ids:
            assets_query = assets_query.union(Asset.query.filter(Asset.id.in_(component_ids)))
    if type_:
        assets_query = assets_query.filter(Asset.type == type_)
    # Сортування
    if sort == 'name':
        if order == 'asc':
            assets_query = assets_query.order_by(Asset.name.asc())
        else:
            assets_query = assets_query.order_by(Asset.name.desc())
    elif sort == 'created_at':
        if order == 'asc':
            assets_query = assets_query.order_by(Asset.created_at.asc())
        else:
            assets_query = assets_query.order_by(Asset.created_at.desc())
    page = request.args.get('page', 1, type=int)
    per_page = 15
    assets = assets_query.paginate(page=page, per_page=per_page, error_out=False)
    holders_map = {}
    for asset in assets.items:
        if asset.type == 'active' and asset.current_holder_id:
            person = db.session.get(Person, asset.current_holder_id)
            holders_map[asset.id] = (person, person.location if person and person.location else None)
        elif asset.type == 'component':
            holders_info = defaultdict(int)
            for log in AssetLog.query.filter_by(asset_id=asset.id).order_by(AssetLog.timestamp):
                if log.action == 'Видано' and log.person_id:
                    holders_info[log.person_id] += log.quantity or 0
                elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                    holders_info[log.person_id] -= log.quantity or 0
            holders_map[asset.id] = [(db.session.get(Person, pid), qty) for pid, qty in holders_info.items() if qty > 0 and db.session.get(Person, pid) is not None]
    # --- Формування посилань для сортування ---
    args = request.args.copy()
    def sort_url(sort_field):
        args_dict = dict(args)
        args_dict.pop('sort', None)
        args_dict.pop('order', None)
        if sort_field == 'name':
            order = 'desc' if request.args.get('sort') == 'name' and request.args.get('order') == 'asc' else 'asc'
        elif sort_field == 'created_at':
            order = 'desc' if request.args.get('sort') != 'created_at' or request.args.get('order') == 'asc' else 'asc'
        elif sort_field == 'task_count':
            order = 'desc' if request.args.get('sort') == 'task_count' and request.args.get('order') == 'asc' else 'asc'
        elif sort_field == 'location':
            order = 'desc' if request.args.get('sort') == 'location' and request.args.get('order') == 'asc' else 'asc'
        else:
            order = 'asc'
        return url_for('index', sort=sort_field, order=order, **args_dict)
    name_sort_url = sort_url('name')
    created_at_sort_url = sort_url('created_at')
    task_count_sort_url = sort_url('task_count')
    location_sort_url = sort_url('location')

    # --- Сортування по задачах та локації ---
    if sort == 'task_count':
        # Підрахунок задач для кожного asset
        assets_list = assets_query.all()
        assets_list = sorted(assets_list, key=lambda a: len([t for t in a.tasks if t.status == 'active']), reverse=(order=='desc'))
        # Пагінація вручну
        from math import ceil
        total = len(assets_list)
        pages = ceil(total / per_page)
        page_items = assets_list[(page-1)*per_page:page*per_page]
        class Pagination:
            def __init__(self, items, page, per_page, total, pages):
                self.items = items
                self.page = page
                self.per_page = per_page
                self.total = total
                self.pages = pages
            def __iter__(self):
                return iter(self.items)
        assets = Pagination(page_items, page, per_page, total, pages)
    elif sort == 'location':
        assets_list = assets_query.all()
        def get_loc_name(asset):
            if asset.current_holder_id:
                person = db.session.get(Person, asset.current_holder_id)
                if person and person.location:
                    return person.location.name
            return ''
        assets_list = sorted(assets_list, key=get_loc_name, reverse=(order=='desc'))
        from math import ceil
        total = len(assets_list)
        pages = ceil(total / per_page)
        page_items = assets_list[(page-1)*per_page:page*per_page]
        class Pagination:
            def __init__(self, items, page, per_page, total, pages):
                self.items = items
                self.page = page
                self.per_page = per_page
                self.total = total
                self.pages = pages
            def __iter__(self):
                return iter(self.items)
        assets = Pagination(page_items, page, per_page, total, pages)
    return render_template('index.html', assets=assets, holders_map=holders_map, locations=locations, people=people, request=request, name_sort_url=name_sort_url, created_at_sort_url=created_at_sort_url, task_count_sort_url=task_count_sort_url, location_sort_url=location_sort_url, year=datetime.utcnow().year)

@app.route('/people')
def people():
    locations = Location.query.all()
    query = Person.query
    filter_info = []
    location_id = request.args.get('location_id')
    search = request.args.get('search', '').strip()
    has_assets = request.args.get('has_assets', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = 15  # Жорстко встановлюємо значення per_page
    if location_id == 'none':
        query = query.filter(Person.location_id == None)
        filter_info.append('Без локації')
    elif location_id:
        query = query.filter(Person.location_id == int(location_id))
        loc = db.session.get(Location, int(location_id))
        if loc:
            filter_info.append(f'Локація: {loc.name}')
    if search:
        query = query.filter(Person.name.ilike(f'%{search}%'))
        filter_info.append(f"Пошук: '{search}'")
    if has_assets == 'yes':
        query = query.filter((Person.assets.any(Asset.type == 'active')) | (Person.assets.any(Asset.type == 'component')))
        filter_info.append('Має майно')
    elif has_assets == 'no':
        query = query.filter(~(Person.assets.any(Asset.type == 'active')) & ~(Person.assets.any(Asset.type == 'component')))
        filter_info.append('Немає майна')
    people_paginated = query.order_by(Person.name).paginate(page=page, per_page=per_page, error_out=False)
    filter_info = ', '.join(filter_info) if filter_info else None
    return render_template('people.html', people_paginated=people_paginated, locations=locations, filter_info=filter_info, request=request)

@app.route('/add_person', methods=['POST'])
def add_person():
    name = request.form['name'].strip()
    if not name:
        flash('Імʼя не може бути порожнім', 'danger')
        return redirect(url_for('people'))
    location_id = request.form.get('location_id') or None
    db.session.add(Person(name=name, location_id=location_id))
    db.session.commit()
    flash('Людину додано', 'success')
    return redirect(url_for('people'))

@app.route('/locations')
def locations():
    locations = Location.query.all()
    return render_template('locations.html', locations=locations)

@app.route('/asset/<int:asset_id>')
def asset_detail(asset_id):
    asset = get_or_404(Asset, asset_id)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    logs = AssetLog.query.filter_by(asset_id=asset_id).order_by(AssetLog.timestamp.desc()).paginate(page=page, per_page=15)
    people = Person.query.all()
    holder = None
    holders_info = None
    # Показуємо задачі лише для активів
    active_tasks = Task.query.filter_by(asset_id=asset_id, status='active').all() if asset.type == 'active' else []
    if asset.type == 'active':
        if asset.current_holder_id:
            holder = db.session.get(Person, asset.current_holder_id)
    elif asset.type == 'component':
        holders_info = defaultdict(int)
        for log in AssetLog.query.filter_by(asset_id=asset_id).order_by(AssetLog.timestamp):
            if log.action == 'Видано' and log.person_id:
                holders_info[log.person_id] += log.quantity or 0
            elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                holders_info[log.person_id] -= log.quantity or 0
        holders_info = {db.session.get(Person, pid): qty for pid, qty in holders_info.items() if qty > 0 and db.session.get(Person, pid) is not None}
    return render_template('asset_detail.html', asset=asset, logs=logs, people=people, holder=holder, holders_info=holders_info, active_tasks=active_tasks, request=request)

@app.route('/add_component_supply/<int:asset_id>', methods=['POST'])
def add_component_supply(asset_id):
    asset = get_or_404(Asset, asset_id)
    qty = int(request.form['quantity'])
    comment = request.form.get('comment', '')
    asset.quantity += qty
    db.session.add(AssetLog(asset_id=asset_id, action='Поставка', quantity=qty, comment=comment or 'Поставка компоненту'))
    db.session.commit()
    return redirect(url_for('asset_detail', asset_id=asset_id))

@app.route('/add_task/<int:asset_id>', methods=['POST'])
def add_task(asset_id):
    text = request.form['task_text'].strip()
    if text:
        db.session.add(Task(asset_id=asset_id, text=text))
        db.session.add(AssetLog(asset_id=asset_id, action='Задача', comment=f'Створено задачу: {text}'))
        db.session.commit()
    return redirect(url_for('asset_detail', asset_id=asset_id))

# При закритті задачі — фіксуємо час у Київському часовому поясі
@app.route('/close_task/<int:task_id>', methods=['POST'])
def close_task(task_id):
    task = Task.query.get_or_404(task_id)
    if task.status == 'closed':
        flash('Задача вже закрита.', 'info')
        return redirect(request.referrer or url_for('all_tasks'))
    task.status = 'closed'
    task.closed_at = datetime.now(KYIV_TZ)
    task.close_comment = request.form.get('close_comment', '')
    # Додаємо запис у історію активу
    db.session.add(AssetLog(asset_id=task.asset_id, action='Задача закрита', comment=f'Задача: {task.text}\nКоментар: {task.close_comment}'))
    db.session.commit()
    flash('Задачу закрито.', 'success')
    return redirect(request.referrer or url_for('all_tasks'))

@app.route('/tasks')
def all_tasks():
    # Фільтри
    location_id = request.args.get('location_id')
    person_id = request.args.get('person_id')
    asset_name = request.args.get('asset_name', '').strip()
    task_text = request.args.get('task_text', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()
    closed_from = request.args.get('closed_from', '').strip()
    closed_to = request.args.get('closed_to', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = 15
    locations = Location.query.all()
    people = Person.query.all()
    # Базовий запит: тільки для активів
    active_tasks_query = Task.query.join(Asset).filter(Asset.type == 'active', Task.status == 'active')
    closed_tasks_query = Task.query.join(Asset).filter(Asset.type == 'active', Task.status == 'closed')
    if location_id and location_id != '':
        active_tasks_query = active_tasks_query.join(Person, Asset.current_holder_id == Person.id).join(Location, Person.location_id == Location.id).filter(Person.location_id == int(location_id))
        closed_tasks_query = closed_tasks_query.join(Person, Asset.current_holder_id == Person.id).join(Location, Person.location_id == Location.id).filter(Person.location_id == int(location_id))
    if person_id and person_id != '':
        active_tasks_query = active_tasks_query.join(Person, Asset.current_holder_id == Person.id).filter(Asset.current_holder_id == int(person_id))
        closed_tasks_query = closed_tasks_query.join(Person, Asset.current_holder_id == Person.id).filter(Asset.current_holder_id == int(person_id))
    if asset_name:
        active_tasks_query = active_tasks_query.filter(Asset.name.ilike(f'%{asset_name}%'))
        closed_tasks_query = closed_tasks_query.filter(Asset.name.ilike(f'%{asset_name}%'))
    if task_text:
        active_tasks_query = active_tasks_query.filter(Task.text.ilike(f'%{task_text}%'))
        closed_tasks_query = closed_tasks_query.filter(Task.text.ilike(f'%{task_text}%'))
    if date_from:
        try:
            date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
            active_tasks_query = active_tasks_query.filter(Task.created_at >= date_from_dt)
            closed_tasks_query = closed_tasks_query.filter(Task.created_at >= date_from_dt)
        except Exception:
            pass
    if date_to:
        try:
            date_to_dt = datetime.strptime(date_to, '%Y-%m-%d')
            date_to_dt = date_to_dt.replace(hour=23, minute=59, second=59)
            active_tasks_query = active_tasks_query.filter(Task.created_at <= date_to_dt)
            closed_tasks_query = closed_tasks_query.filter(Task.created_at <= date_to_dt)
        except Exception:
            pass
    if closed_from:
        try:
            closed_from_dt = datetime.strptime(closed_from, '%Y-%m-%d')
            closed_tasks_query = closed_tasks_query.filter(Task.closed_at >= closed_from_dt)
        except Exception:
            pass
    if closed_to:
        try:
            closed_to_dt = datetime.strptime(closed_to, '%Y-%m-%d')
            closed_to_dt = closed_to_dt.replace(hour=23, minute=59, second=59)
            closed_tasks_query = closed_tasks_query.filter(Task.closed_at <= closed_to_dt)
        except Exception:
            pass
    active_tasks_paginated = active_tasks_query.order_by(Task.created_at).paginate(page=page, per_page=per_page)
    closed_tasks_paginated = closed_tasks_query.order_by(Task.closed_at.desc()).paginate(page=page, per_page=per_page)
    # Групування відкритих задач по активу
    grouped_active_tasks = {}
    for task in active_tasks_paginated.items:
        asset = task.asset
        if asset.id not in grouped_active_tasks:
            grouped_active_tasks[asset.id] = {'asset': asset, 'tasks': []}
        grouped_active_tasks[asset.id]['tasks'].append(task)
    return render_template('tasks.html',
        grouped_active_tasks=grouped_active_tasks,
        closed_tasks_paginated=closed_tasks_paginated,
        active_tasks_paginated=active_tasks_paginated,
        locations=locations,
        people=people,
        request=request
    )

@app.route('/assign_asset/<int:asset_id>', methods=['POST'])
def assign_asset(asset_id):
    asset = get_or_404(Asset, asset_id)
    comment = request.form.get('comment', '')
    if asset.type == 'active':
        person_id = int(request.form['person_id'])
        prev_holder = asset.current_holder_id
        asset.current_holder_id = person_id
        asset.status = 'У користуванні'
        prev_holder_name = db.session.get(Person, prev_holder).name if prev_holder else 'Склад'
        new_holder_name = db.session.get(Person, person_id).name
        # Лог для попереднього власника (якщо був)
        if prev_holder:
            db.session.add(AssetLog(asset_id=asset_id, person_id=prev_holder, action='Передано', comment=f"Передано {'людині' if person_id else 'на склад'}: {new_holder_name if person_id else 'Склад'}. {comment}"))
        # Лог для нового власника
        db.session.add(AssetLog(asset_id=asset_id, person_id=person_id, action='Отримано', comment=f"Отримано від {'людини' if prev_holder else 'складу'}: {prev_holder_name}. {comment}"))
    elif asset.type == 'component':
        qty = int(request.form['quantity'])
        person_id = int(request.form['person_id'])
        from_person_id = request.form.get('from_person_id')
        if from_person_id:
            from_person_id = int(from_person_id)
            holders_info = defaultdict(int)
            for log in AssetLog.query.filter_by(asset_id=asset_id).order_by(AssetLog.timestamp):
                if log.action == 'Видано' and log.person_id:
                    holders_info[log.person_id] += log.quantity or 0
                elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                    holders_info[log.person_id] -= log.quantity or 0
            if holders_info[from_person_id] < qty:
                flash('Недостатньо компонентів у користувача для передачі', 'danger')
                return redirect(url_for('asset_detail', asset_id=asset_id))
            db.session.add(AssetLog(asset_id=asset_id, person_id=from_person_id, action='Повернення', quantity=qty, comment=f"Передача іншому користувачу (До: {db.session.get(Person, person_id).name}) {comment}"))
            db.session.add(AssetLog(asset_id=asset_id, person_id=person_id, action='Видано', quantity=qty, comment=f"Передано від іншого користувача (Від: {db.session.get(Person, from_person_id).name}) {comment}"))
        else:
            if asset.quantity >= qty:
                asset.quantity -= qty
                db.session.add(AssetLog(asset_id=asset_id, person_id=person_id, action='Видано', quantity=qty, comment=f"{comment} (До: {db.session.get(Person, person_id).name})"))
            else:
                flash('Недостатньо компонентів на складі', 'danger')
                return redirect(url_for('asset_detail', asset_id=asset_id))
    db.session.commit()
    return redirect(url_for('asset_detail', asset_id=asset_id))

@app.route('/return_asset/<int:asset_id>', methods=['POST'])
def return_asset(asset_id):
    asset = get_or_404(Asset, asset_id)
    if asset.type == 'active':
        prev_holder = asset.current_holder_id
        asset.current_holder_id = None
        asset.status = 'На складі'
        db.session.add(AssetLog(asset_id=asset_id, person_id=prev_holder, action='Повернено', comment=f"Від: {db.session.get(Person, prev_holder).name if prev_holder else ''} До: Склад"))
    elif asset.type == 'component':
        qty = int(request.form['quantity'])
        person_id = int(request.form['person_id'])
        comment = request.form.get('comment', '')
        holders_info = defaultdict(int)
        for log in AssetLog.query.filter_by(asset_id=asset_id).order_by(AssetLog.timestamp):
            if log.action == 'Видано' and log.person_id:
                holders_info[log.person_id] += log.quantity or 0
            elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                holders_info[log.person_id] -= log.quantity or 0
        if holders_info[person_id] < qty:
            flash('Недостатньо компонентів у користувача для повернення', 'danger')
            return redirect(url_for('asset_detail', asset_id=asset_id))
        asset.quantity += qty
        db.session.add(AssetLog(asset_id=asset_id, person_id=person_id, action='Повернення', quantity=qty, comment=f"Від: {db.session.get(Person, person_id).name} До: Склад {comment}"))
    db.session.commit()
    return redirect(url_for('asset_detail', asset_id=asset_id))

@app.route('/add_asset', methods=['POST'])
def add_asset():
    name = request.form['name']
    serial = request.form['serial'] or None  # Заміна порожнього рядка на None
    type = request.form['type']
    comments = request.form.get('comments', '')

    if type == 'active':
        asset = Asset(name=name, serial=serial, quantity=1, type=type, comments=comments)
        db.session.add(asset)
        try:
            db.session.flush()
        except Exception as e:
            db.session.rollback()
            if serial:  # Перевірка тільки для непорожніх серійних номерів
                flash('Актив з таким серійним номером вже існує', 'danger')
            else:
                flash('Помилка при додаванні активу', 'danger')
            return redirect(url_for('index'))
        db.session.add(AssetLog(asset_id=asset.id, action='Створено', comment='Початковий запис', quantity=1))
    else:
        quantity = int(request.form.get('quantity', 1))
        if not serial:
            serial = f'component-{int(datetime.utcnow().timestamp()*1000)}'
        asset = Asset(name=name, serial=serial, quantity=quantity, type=type, comments=comments)
        db.session.add(asset)
        try:
            db.session.flush()
        except Exception as e:
            db.session.rollback()
            flash('Компонент з таким серійним номером вже існує', 'danger')
            return redirect(url_for('index'))
        db.session.add(AssetLog(asset_id=asset.id, action='Створено', comment='Початковий запис', quantity=quantity))

    db.session.commit()
    flash('Майно додано', 'success')
    return redirect(url_for('index'))

@app.route('/edit_person/<int:person_id>', methods=['GET', 'POST'])
def edit_person(person_id):
    person = db.session.get(Person, person_id)
    if not person:
        abort(404)

    if request.method == 'POST':
        person.name = request.form['name'].strip()
        person.phone = request.form.get('phone', '').strip() or None
        location_id = request.form.get('location_id')
        person.location_id = int(location_id) if location_id else None
        db.session.commit()
        flash('Дані людини оновлено', 'success')
        return redirect(url_for('people'))

    locations = Location.query.all()
    return render_template('edit_person.html', person=person, locations=locations)

@app.route('/delete_person/<int:person_id>', methods=['POST'])
def delete_person(person_id):
    person = get_or_404(Person, person_id)
    assets = Asset.query.filter_by(current_holder_id=person.id).all()
    if not assets:
        db.session.delete(person)
        db.session.commit()
        flash('Людину видалено', 'success')
    else:
        flash('Не можна видалити людину, за якою закріплене майно', 'danger')
    return redirect(url_for('people'))

@app.route('/edit_location/<int:location_id>', methods=['POST'])
def edit_location(location_id):
    loc = get_or_404(Location, location_id)
    loc.name = request.form['name']
    db.session.commit()
    flash('Локацію оновлено', 'success')
    return redirect(url_for('locations'))

@app.route('/delete_location/<int:location_id>', methods=['POST'])
def delete_location(location_id):
    loc = get_or_404(Location, location_id)
    for person in loc.people:
        person.location_id = None
    db.session.delete(loc)
    db.session.commit()
    flash('Локацію видалено', 'success')
    return redirect(url_for('locations'))

@app.route('/add_location', methods=['POST'])
def add_location():
    name = request.form['name'].strip()
    if not name:
        flash('Назва локації не може бути порожньою', 'danger')
        return redirect(url_for('locations'))
    db.session.add(Location(name=name))
    db.session.commit()
    flash('Локацію додано', 'success')
    return redirect(url_for('locations'))

@app.route('/person/<int:person_id>')
def person_detail(person_id):
    person = get_or_404(Person, person_id)
    assets = Asset.query.filter_by(current_holder_id=person.id).all()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    logs = AssetLog.query.filter_by(person_id=person.id).order_by(AssetLog.timestamp.desc()).paginate(page=page, per_page=15)
    categories = sorted(set([a.type for a in assets]))
    components = []
    for asset in Asset.query.filter_by(type='component').all():
        holders_info = defaultdict(int)
        for log in AssetLog.query.filter_by(asset_id=asset.id).order_by(AssetLog.timestamp):
            if log.action == 'Видано' and log.person_id:
                holders_info[log.person_id] += log.quantity or 0
            elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                holders_info[log.person_id] -= log.quantity or 0
        if holders_info.get(person.id, 0) > 0:
            components.append({'asset': asset, 'quantity': holders_info[person.id]})
    people = Person.query.filter(Person.id != person.id).all()
    locations = Location.query.all()
    return render_template('person_detail.html', person=person, categories=categories, people=people, logs=logs, components=components, locations=locations, request=request)

@app.route('/location/<int:location_id>')
def location_detail(location_id):
    location = get_or_404(Location, location_id)
    people = Person.query.filter_by(location_id=location.id).all()
    all_people = Person.query.all()
    assets = Asset.query.filter(Asset.current_holder_id.in_([p.id for p in people])).all() if people else []
    components = []
    for asset in Asset.query.filter_by(type='component').all():
        holders_info = defaultdict(int)
        for log in AssetLog.query.filter_by(asset_id=asset.id).order_by(AssetLog.timestamp):
            if log.action == 'Видано' and log.person_id:
                holders_info[log.person_id] += log.quantity or 0
            elif log.action in ['Повернення', 'Повернено'] and log.person_id:
                holders_info[log.person_id] -= log.quantity or 0
        if people:
            for person in people:
                qty = holders_info.get(person.id, 0)
                if qty > 0:
                    components.append({'asset': asset, 'person': person, 'quantity': qty})
    return render_template('location_detail.html', location=location, people=people, assets=assets, components=components, all_people=all_people)




def get_or_404(model, id):
    obj = db.session.get(model, id)
    if obj is None:
        abort(404)
    return obj

@app.route('/edit_asset/<int:asset_id>', methods=['POST'])
def edit_asset(asset_id):
    asset = db.session.get(Asset, asset_id)
    if not asset:
        abort(404)

    asset.name = request.form['name'].strip()
    asset.serial = request.form['serial'].strip() or None
    asset.comments = request.form['comments'].strip()

    db.session.commit()
    flash('Дані активу оновлено', 'success')
    return redirect(url_for('asset_detail', asset_id=asset_id))

@app.route('/backup_database', methods=['POST'])
def backup_database():
    backup_folder = os.path.join(os.getcwd(), 'backup')
    os.makedirs(backup_folder, exist_ok=True)
    db_url = app.config['SQLALCHEMY_DATABASE_URI']
    if db_url.startswith('sqlite'):  # SQLite backup
        source_db = os.path.join(os.getcwd(), 'instance', 'assets.db')
        backup_db = os.path.join(backup_folder, f'assets_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db')
        try:
            shutil.copy2(source_db, backup_db)
            flash('Резервну копію бази даних створено успішно (SQLite).', 'success')
        except Exception as e:
            flash(f'Помилка при створенні резервної копії: {str(e)}', 'danger')
    elif db_url.startswith('postgresql'):
        # Формуємо ім'я файлу дампу
        backup_file = os.path.join(backup_folder, f'assets_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.sql')
        # Парсимо дані підключення
        import re
        m = re.match(r"postgresql://(.*?):(.*?)@(.*?):(.*?)/(.*)", db_url)
        if m:
            user, password, host, port, dbname = m.groups()
            # Формуємо команду pg_dump
            cmd = f"PGPASSWORD={password} pg_dump -h {host} -p {port} -U {user} -F c -b -v -f '{backup_file}' {dbname}"
            result = os.system(cmd)
            if result == 0 and os.path.exists(backup_file):
                flash('Резервну копію бази даних створено успішно (PostgreSQL).', 'success')
            elif os.path.exists(backup_file):
                flash('Резервну копію бази даних створено, але pg_dump повернув помилку. Перевірте дамп.', 'warning')
            else:
                flash('Помилка при створенні резервної копії PostgreSQL.', 'danger')
        else:
            flash('Не вдалося розпарсити DATABASE_URL для резервного копіювання.', 'danger')
    else:
        flash('Невідомий тип бази даних для резервного копіювання.', 'danger')
    return redirect(url_for('index'))

# === Flask-Login: маршрути для входу/виходу ===
from flask import render_template_string

# --- Логування входу ---
from uuid import uuid4

@app.before_request
def update_session_activity():
    if current_user.is_authenticated:
        session.permanent = True
        app.permanent_session_lifetime = 1800  # 30 хвилин
        session.modified = True

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    error = None
    if request.method == 'POST':
        username = request.form['username'].strip().lower()
        password = request.form['password']
        user = User.query.filter(db.func.lower(User.username) == username).first()
        if user and user.check_password(password):
            login_user(user)
            # --- Логування входу ---
            sid = str(uuid4())
            session['sid'] = sid
            db.session.add(UserSession(user_id=user.id, session_id=sid, ip=request.remote_addr, user_agent=request.headers.get('User-Agent')))
            db.session.commit()
            return redirect(url_for('index'))
        else:
            error = 'Невірний логін або пароль'
    return render_template('login.html', error=error)

@app.route('/logout')
@login_required
def logout():
    # --- Логування виходу ---
    sid = session.get('sid')
    if sid:
        usess = UserSession.query.filter_by(session_id=sid, active=True).first()
        if usess:
            usess.active = False
            usess.logout_time = datetime.utcnow()
            db.session.commit()
    logout_user()
    session.pop('sid', None)
    return redirect(url_for('login'))

# --- Сторінка активних сесій для адміна ---
@app.route('/user_sessions/<int:user_id>')
@login_required
@admin_required
def user_sessions(user_id):
    user = User.query.get_or_404(user_id)
    sessions = UserSession.query.filter_by(user_id=user.id).order_by(UserSession.login_time.desc()).all()
    return render_template('user_sessions.html', user=user, sessions=sessions)

# --- Сторінка своїх сесій для користувача ---
@app.route('/my_sessions')
@login_required
def my_sessions():
    sessions = UserSession.query.filter_by(user_id=current_user.id).order_by(UserSession.login_time.desc()).all()
    return render_template('user_sessions.html', user=current_user, sessions=sessions, self_view=True)

# --- Завершення сесії (адмін може закрити будь-яку, користувач — свою) ---
@app.route('/close_session/<int:session_id>', methods=['POST'])
@login_required
def close_session(session_id):
    usess = UserSession.query.get_or_404(session_id)
    if current_user.is_admin() or (usess.user_id == current_user.id):
        if usess.active:
            # Замість видалення user_id (яке спричиняє IntegrityError), просто ставимо active=False і час виходу
            usess.active = False
            usess.logout_time = datetime.utcnow()
            db.session.commit()
            flash('Сесію завершено', 'success')
    return redirect(request.referrer or url_for('index'))

# --- Валідація пароля ---
def validate_password(password):
    if len(password) < 8 or len(password) > 64:
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[a-z]', password):
        return False
    if not re.search(r'\d', password):
        return False
    if not re.search(r'[^A-Za-z0-9]', password):
        return False
    return True

# --- Використання валідації при створенні/зміні пароля ---
# у add_user, edit_user, profile

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        password_confirm = request.form['password_confirm']
        if password != password_confirm:
            flash('Паролі не співпадають', 'danger')
            return redirect(url_for('register'))
        if User.query.filter_by(username=username).first():
            flash('Користувач з таким логіном вже існує', 'danger')
            return redirect(url_for('register'))
        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        flash('Реєстрація успішна. Тепер ви можете увійти.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/users')
@login_required
@admin_required
def users():
    users = User.query.all()
    return render_template('users.html', users=users)

@app.route('/add_user', methods=['GET', 'POST'])
@login_required
@admin_required
def add_user():
    error = None
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        role = request.form.get('role', 'user')
        if User.query.filter(db.func.lower(User.username) == username.lower()).first():
            error = 'Користувач з таким логіном вже існує'
        elif not validate_password(password):
            error = 'Пароль не відповідає вимогам безпеки.'
        else:
            user = User(username=username, role=role)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            return redirect(url_for('users'))
    return render_template('add_user.html', error=error)

@app.route('/edit_user/<int:user_id>', methods=['GET', 'POST'])
@login_required
@admin_required
def edit_user(user_id):
    user = User.query.get_or_404(user_id)
    error = None
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        role = request.form.get('role', user.role)
        if username.lower() != user.username.lower() and User.query.filter(db.func.lower(User.username) == username.lower()).first():
            error = 'Користувач з таким логіном вже існує'
        elif password and not validate_password(password):
            error = 'Пароль не відповідає вимогам безпеки.'
        else:
            user.username = username
            if password:
                user.set_password(password)
            user.role = role
            db.session.commit()
            return redirect(url_for('users'))
    return render_template('edit_user.html', user=user, error=error)

@app.route('/delete_user/<int:user_id>', methods=['POST'])
@login_required
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.is_admin() and User.query.filter_by(role='admin').count() == 1:
        flash('Неможливо видалити останнього адміністратора!', 'danger')
        return redirect(url_for('users'))
    db.session.delete(user)
    db.session.commit()
    flash('Користувача видалено', 'success')
    return redirect(url_for('users'))

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    user = current_user
    error = None
    if request.method == 'POST':
        password = request.form['password']
        if not validate_password(password):
            error = 'Пароль не відповідає вимогам безпеки.'
        else:
            user.set_password(password)
            db.session.commit()
            flash('Пароль змінено', 'success')
    return render_template('edit_user.html', user=user, error=error, self_edit=True)

# === Захист усіх основних сторінок ===
from functools import wraps

def protect_all_routes(app):
    for rule in app.url_map.iter_rules():
        if rule.endpoint not in ('login', 'static') and rule.endpoint in app.view_functions:
            view_func = app.view_functions[rule.endpoint]
            if not getattr(view_func, 'is_login_required', False):
                app.view_functions[rule.endpoint] = login_required(view_func)
                app.view_functions[rule.endpoint].is_login_required = True

protect_all_routes(app)

# === Створення таблиць і першого користувача, якщо немає жодного ===
with app.app_context():
    db.create_all()
    if not User.query.first():
        user = User(username='admin', role='admin')
        user.set_password('admin')
        db.session.add(user)
        db.session.commit()
        print('Створено користувача admin/admin (змініть пароль після входу)')

app.permanent_session_lifetime = timedelta(minutes=30)

@app.before_request
def make_session_permanent():
    session.permanent = True

@app.before_request
def check_session_valid():
    if current_user.is_authenticated:
        sid = session.get('sid')
        if not sid:
            logout_user()
            session.clear()
            return redirect(url_for('login'))
        usess = UserSession.query.filter_by(session_id=sid, active=True).first()
        # Якщо сесія неактивна або user_id некоректний — розлогінити
        if not usess or not usess.user_id:
            if usess:
                try:
                    usess.active = False
                    usess.logout_time = datetime.utcnow()
                    db.session.commit()
                except Exception:
                    db.session.rollback()
            logout_user()
            session.clear()
            flash('Сесію завершено адміністратором або з іншого пристрою.', 'warning')
            return redirect(url_for('login'))

if __name__ == "__main__":
    app.run(debug=True)
else:
    # Gunicorn entrypoint: створення таблиць при першому запуску
    with app.app_context():
        db.create_all()