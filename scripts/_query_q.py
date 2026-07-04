import sqlite3, json

conn = sqlite3.connect("dev.db")
c = conn.cursor()
c.execute(
    "SELECT id, paperId, number, ref, question, options, answer, source FROM Question "
    "WHERE question LIKE '%阻止了保單為被保險人作出彌償%'"
)
rows = c.fetchall()
for r in rows:
    print("id:", r[0])
    print("paperId:", r[1])
    print("number:", r[2])
    print("ref:", r[3])
    print("question:", r[4])
    print("options:", r[5])
    print("answer:", r[6])
    print("source:", r[7])
    print("---")
conn.close()
