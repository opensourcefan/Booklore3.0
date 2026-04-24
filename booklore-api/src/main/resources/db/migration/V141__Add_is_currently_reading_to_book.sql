-- Add is_currently_reading column to book table
ALTER TABLE book ADD COLUMN is_currently_reading BOOLEAN DEFAULT FALSE NOT NULL;
