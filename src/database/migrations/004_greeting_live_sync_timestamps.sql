-- ==============================================================================
-- IMAGO Footfall & Retail Conversion Domain Schema
-- Migration: 004_greeting_live_sync_timestamps.sql
-- Automatic Updated Timestamps for Real-Time Greeting Broadcast Synchronization
-- ==============================================================================

USE `imago_footfall_db`;

-- Add automatic updated_at timestamp to retail_greeting_ho_campaigns
ALTER TABLE `retail_greeting_ho_campaigns`
  ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add automatic updated_at timestamp to retail_greeting_terminals
ALTER TABLE `retail_greeting_terminals`
  ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
