from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from datetime import datetime
import logging

app = Flask(__name__)
CORS(app)

# Настройка логирования
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host='localhost',
            user='root',
            password='123',
            database='diplom'
        )
        logger.debug("Успешное подключение к MySQL")
        return conn
    except Error as e:
        logger.error(f"Ошибка подключения к MySQL: {str(e)}")
        raise
@app.route('/api/test_db')
def test_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT 1 AS test_result")
        result = cursor.fetchone()
        return jsonify({"success": True, "result": result['test_result']})
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/requests', methods=['GET'])
def get_requests():
    logger.debug("Получение заявок из MySQL")
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Проверяем существование таблицы
        cursor.execute("""
        SELECT COUNT(*) AS table_exists 
        FROM information_schema.tables 
        WHERE table_schema = %s AND table_name = 'requests'
        """, ('diplom',))
        
        table_exists = cursor.fetchone()['table_exists']
        
        if not table_exists:
            logger.error("Таблица 'requests' не существует!")
            return jsonify({"error": "Таблица не существует"}), 404
        
        # Получаем данные
        cursor.execute("SELECT * FROM requests ORDER BY created_at DESC")
        requests = cursor.fetchall()
        
        # Конвертируем datetime в строку
        for request in requests:
            if 'created_at' in request and isinstance(request['created_at'], datetime):
                request['created_at'] = request['created_at'].isoformat()
        
        logger.debug(f"Найдено {len(requests)} заявок")
        return jsonify(requests)
    except Error as e:
        logger.error(f"Ошибка MySQL: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Общая ошибка: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/requests/<int:d>', methods=['PUT'])
def update_request(id):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        UPDATE requests 
        SET status = %s
        WHERE id = %s
        """, (data['status'], id))
        
        conn.commit()
        return jsonify({"success": True})
    except Error as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)