import mysql.connector
conn = mysql.connector.connect(host="127.0.0.1", port=3306, database="fable", user="fable", password="fable")
cursor = conn.cursor(dictionary=True)
cursor.execute("SELECT id, chunk_text, chapter_title FROM book_embeddings WHERE chunk_text LIKE '%I N D E X%' OR chapter_title LIKE '%index%'")
rows = cursor.fetchall()
for row in rows:
    ch_title = (row["chapter_title"] or "").lower()
    text_prefix = row["chunk_text"][:200].lower()
    print("Chunk ID:", row["id"])
    print("Chapter:", ch_title)
    print("Prefix:", repr(text_prefix))
    print("Is index in chapter?", "index" in ch_title)
    print("Is i n d e x in prefix?", "i n d e x" in text_prefix)
    print("---")
