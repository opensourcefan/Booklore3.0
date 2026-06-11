import requests
import pymysql

conn = pymysql.connect(host='backend_db', user='fable', password='fable', db='fable')
cur = conn.cursor()
cur.execute("SELECT session_id FROM spring_session LIMIT 1")
res = cur.fetchone()
if res:
    print(f"Session: {res[0]}")
    cookies = {'SESSION': res[0]}
    r = requests.get('http://app-backend:6060/api/v1/books/paged?page=0&size=20', cookies=cookies)
    print(r.status_code)
    print(r.text[:500])
else:
    print("No session found")
