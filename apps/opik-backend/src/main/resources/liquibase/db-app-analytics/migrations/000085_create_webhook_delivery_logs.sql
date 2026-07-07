--liquibase formatted sql
--changeset DangVanSam:000085_create_webhook_delivery_logs

CREATE TABLE IF NOT EXISTS ${ANALYTICS_DB_DATABASE_NAME}.webhook_delivery_logs (
    workspace_id String,
    alert_id String,
    alert_name String,
    event_type String,
    webhook_event_id String,
    payload_json String,
    status Enum8('PENDING'=0, 'SUCCESS'=1, 'FAILED'=2),
    http_status_code Int32 DEFAULT 0,
    error_message String DEFAULT '',
    retry_count UInt8 DEFAULT 0,
    max_retries UInt8 DEFAULT 3,
    created_at DateTime64(9, 'UTC') DEFAULT now64(9),
    completed_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/${ANALYTICS_DB_DATABASE_NAME}/webhook_delivery_logs', '{replica}')
ORDER BY (workspace_id, alert_id, created_at)
TTL toDateTime(created_at) + toIntervalMonth(3);
