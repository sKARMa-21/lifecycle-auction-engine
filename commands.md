# This is the file where you must mention all the necessary commands that you used to run a task on the terminal

## Run API server
`uvicorn app.main:app --reload`

## Alembic commands 
`alembic upgrade head`

## TO check the Database information and tables:
`psql -h localhost -p 5433 -U auction_user -d lifecycle_auction`

(Enter your password when prompted: change_this_to_a_strong_local_password)

## TO list the tables
`\dt`

## To inspect columns & types of a specific table:
`\d users`
`\d bicycles`

## To check the data in a table:
`SELECT * FROM table_name;`
