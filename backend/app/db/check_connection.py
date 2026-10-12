from sqlalchemy import text

from app.db.session import engine

with engine.connect() as connection:
    print(connection.execute(text("SELECT version()")).scalar())

print("PostgreSQL connection successful.")