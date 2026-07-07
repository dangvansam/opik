--liquibase formatted sql
--changeset DangVanSam:000086_add_response_body_to_webhook_delivery_logs

ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.webhook_delivery_logs
    ADD COLUMN IF NOT EXISTS response_body String DEFAULT '';
