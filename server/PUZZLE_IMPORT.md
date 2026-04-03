# Lichess Puzzle Import

This project can import real chess puzzles from the official Lichess open database.

## What to download

1. Open https://database.lichess.org/#puzzles
2. Download `lichess_db_puzzle.csv.zst`
3. Extract it to a plain `.csv` file

The importer in this project reads the extracted CSV file.

## What the importer does

1. Reads the Lichess CSV rows
2. Uses the first move from the `Moves` column as the opponent move
3. Applies that move to the source FEN
4. Stores the resulting playable puzzle position in PostgreSQL
5. Stores the remaining solution line as `solution_moves`

This follows the Lichess puzzle format notes:
- the CSV FEN is before the opponent move
- the user should see the position after that first move

## Command

Run this from the project root:

```powershell
node server\scripts\import-lichess-puzzles.js --file="C:\path\to\lichess_db_puzzle.csv"
```

Optional filters:

```powershell
node server\scripts\import-lichess-puzzles.js --file="C:\path\to\lichess_db_puzzle.csv" --limit=250 --min-rating=900 --max-rating=2200 --free-count=20 --themes=mate,fork,pin
```

## What the options mean

- `--file`: extracted Lichess CSV file path
- `--limit`: how many puzzles to import
- `--min-rating`: minimum puzzle rating
- `--max-rating`: maximum puzzle rating
- `--free-count`: how many imported puzzles stay free before premium lock starts
- `--themes`: optional comma-separated theme filter

## What happens after import

1. Imported puzzles are stored with source `lichess`
2. The puzzle page uses the playable post-opponent position
3. Imported puzzles are preferred ahead of placeholder seed puzzles
