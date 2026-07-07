--liquibase formatted sql
--changeset sam:000069_add_retry_config_to_webhooks

ALTER TABLE webhooks ADD COLUMN max_retries INT NULL;
ALTER TABLE webhooks ADD COLUMN retry_delay_ms INT NULL;
