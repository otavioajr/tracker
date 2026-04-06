-- Add GT06 protocol to the device_protocol enum
ALTER TYPE device_protocol ADD VALUE IF NOT EXISTS 'gt06';
