# SQL Files

This directory contains SQL scripts for the Owl Security System database.

## Database Setup
- `owl_security_db.sql` - Main database schema
- `create_light_detection_tables.sql` - Create light detection tables
- `create_lighting_table.sql` - Create lighting control table

## Database Maintenance
- `add_processed_column.sql` - Add processed column to existing tables
- `clear_db.sql` - Clear database data (keep schema)

## Database Queries
- `check_detections.sql` - Check detection records
- `check_schema.sql` - Check database schema
- `check_videos.sql` - Check video records

## Usage

Run SQL files with your database client:
```bash
mysql -u username -p database_name < filename.sql
```

Or use the scripts:
```bash
# Setup database
mysql -u root -p owl_security < owl_security_db.sql

# Check database
mysql -u root -p owl_security < check_schema.sql
``` 