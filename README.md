# 🚀 Tally Sync Railway SQLite Solution

## Architecture

```
Windows Client (Local)          Railway (Cloud)
┌─────────────────────┐        ┌─────────────────────┐
│  Tally (localhost:  │───────▶│  Express Server     │
│       9000)         │        │  SQLite Database    │
│                     │        │  Auto-deploy from   │
│  Windows Sync       │        │  Git                │
│  Client             │        └─────────────────────┘
│  - UUID Config      │
│  - TDL Logic        │
│  - Data Processing  │
└─────────────────────┘
```

## Components

### Railway SQLite Server (Cloud)
- **File**: `server.js`
- **Database**: SQLite with UUID company_id/division_id
- **Deployment**: Auto-deploys from git to Railway
- **Endpoints**: Bulk sync, metadata, stats, query

### Windows Client (Local)
- **File**: `windows-tally-sync.js`
- **Configuration**: `windows-client-config.json` with UUIDs
- **Logic**: Same as tally-database-loader
- **Connection**: Tally localhost:9000 → Railway SQLite

## Configuration

### UUIDs (Local Configuration)
```json
{
  "company": {
    "id": "629f49fb-983e-4141-8c48-e1423b39e921",
    "name": "SKM Technologies",
    "division_id": "37f3cc0c-58ad-4baf-b309-360116ffc3cd",
    "division_name": "MAIN"
  }
}
```

### Database Schema (Railway SQLite)
All tables include:
- `company_id TEXT NOT NULL` -- UUID format
- `division_id TEXT NOT NULL` -- UUID format
- Standard Tally fields (guid, name, etc.)
- Sync metadata (timestamps, source)

## Usage

### Deploy to Railway
```bash
git add .
git commit -m "Deploy Railway SQLite server"
git push origin main
# Railway auto-deploys
```

### Run Windows Client
```bash
node windows-tally-sync.js
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/bulk-sync/{companyId}/{divisionId}` | Bulk data sync |
| GET | `/api/v1/metadata/{companyId}/{divisionId}` | Sync metadata |
| GET | `/api/v1/sync-status/{companyId}/{divisionId}` | Sync status |
| GET | `/api/v1/stats/{companyId}/{divisionId}` | Database statistics |
| POST | `/api/v1/query/{companyId}/{divisionId}` | Custom SQL queries |
| GET | `/api/v1/tables` | List all tables |

## Features

- ✅ **UUID Support**: company_id and division_id in UUID format
- ✅ **SQLite Database**: Lightweight, reliable, Railway-hosted
- ✅ **Auto-deployment**: Git push → Railway deploy
- ✅ **Batch Processing**: Efficient large dataset handling
- ✅ **Error Handling**: Retry logic and comprehensive error handling
- ✅ **Windows Client**: Local processing with cloud storage

## Development

1. **Local Testing**: Test Windows client against local Railway server
2. **Deploy**: Push to Railway for auto-deployment
3. **Production**: Windows client connects to Railway SQLite

This solution gives you the best of both worlds: local processing with cloud database storage!
