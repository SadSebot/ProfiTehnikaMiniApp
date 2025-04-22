from flask import Flask, request, jsonify
from flask_cors import CORS
import pyodbc
from datetime import datetime
from config import DB_CONFIG

app = Flask(__name__)
CORS(app)

def get_db_connection():
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={DB_CONFIG['server']};"
        f"DATABASE={DB_CONFIG['database']};"
        f"UID={DB_CONFIG['username']};"
        f"PWD={DB_CONFIG['password']}"
    )
    return conn

# Проверка и создание таблицы (если нужно)
def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'zayavki')
        CREATE TABLE dbo.zayavki (
            id INT IDENTITY(1,1) PRIMARY KEY,
            name NVARCHAR(100) NOT NULL,
            phone NVARCHAR(20) NOT NULL,
            message NVARCHAR(500) NOT NULL,
            request_date DATETIME NOT NULL DEFAULT GETDATE(),
            status NVARCHAR(20) DEFAULT 'new'
        )
        """)
        conn.commit()
        print("Таблица проверена/создана")
    except Exception as e:
        print(f"Ошибка при инициализации БД: {str(e)}")
    finally:
        conn.close()

@app.route('/api/zayavki', methods=['POST'])
def create_zayavka():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO dbo.zayavki (name, phone, message)
        VALUES (?, ?, ?)
        """, data['name'], data['phone'], data['message'])
        conn.commit()
        return jsonify({"success": True, "message": "Заявка создана"}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/zayavki', methods=['GET'])
def get_zayavki():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM dbo.zayavki ORDER BY request_date DESC")
        
        columns = [column[0] for column in cursor.description]
        zayavki = []
        
        for row in cursor.fetchall():
            zayavka = dict(zip(columns, row))
            # Конвертация datetime в строку
            if 'request_date' in zayavka:
                zayavka['request_date'] = zayavka['request_date'].isoformat()
            zayavki.append(zayavka)
            
        return jsonify(zayavki)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/zayavki/<int:zayavka_id>', methods=['PUT'])
def update_zayavka(zayavka_id):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE dbo.zayavki 
        SET status = ?
        WHERE id = ?
        """, data['status'], zayavka_id)
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)