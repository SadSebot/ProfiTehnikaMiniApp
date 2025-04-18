from flask import Flask, request, jsonify
from flask_cors import CORS
import pyodbc
from datetime import datetime
import os
from config import DB_CONFIG

app = Flask(__name__)
CORS(app)

# Подключение к MS SQL Server
def get_db_connection():
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={DB_CONFIG['server']};"
        f"DATABASE={DB_CONFIG['database']};"
        f"UID={DB_CONFIG['username']};"
        f"PWD={DB_CONFIG['password']}"
    )
    return conn

# Создание таблицы, если её нет
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='requests' AND xtype='U')
    CREATE TABLE requests (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        phone NVARCHAR(20) NOT NULL,
        message NVARCHAR(500) NOT NULL,
        request_date DATETIME NOT NULL,
        status NVARCHAR(20) DEFAULT 'new'
    )
    """)
    conn.commit()
    conn.close()

# API для работы с заявками
@app.route('/api/requests', methods=['POST'])
def create_request():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO requests (name, phone, message, request_date)
        VALUES (?, ?, ?, ?)
        """, data['name'], data['phone'], data['message'], datetime.now())
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Заявка создана"}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/requests', methods=['GET'])
def get_requests():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM requests ORDER BY request_date DESC")
        columns = [column[0] for column in cursor.description]
        requests = [dict(zip(columns, row)) for row in cursor.fetchall()]
        conn.close()
        
        # Конвертация datetime в строку
        for req in requests:
            if 'request_date' in req:
                req['request_date'] = req['request_date'].isoformat()
        
        return jsonify(requests)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/requests/<int:request_id>', methods=['PUT'])
def update_request(request_id):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE requests 
        SET status = ?
        WHERE id = ?
        """, data['status'], request_id)
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)