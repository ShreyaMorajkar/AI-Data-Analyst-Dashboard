import duckdb
import pathlib
import os

p = pathlib.Path(os.getcwd()) / 'test.csv'
open(p, 'w').write('a,b\n1,2\n')
try:
    db = duckdb.connect()
    query = f"CREATE VIEW test AS SELECT * FROM '{p}'"
    print("Executing query:", query)
    db.execute(query)
    print(db.execute('SELECT * FROM test').df())
except Exception as e:
    print("Error:", e)
finally:
    p.unlink()
