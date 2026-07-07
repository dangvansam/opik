package com.comet.opik.domain.alerts;

import com.comet.opik.api.WebhookDeliveryLog;
import com.comet.opik.api.WebhookDeliveryLogPage;
import com.google.inject.ImplementedBy;
import io.r2dbc.spi.ConnectionFactory;
import io.r2dbc.spi.Row;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.List;

import static com.comet.opik.domain.AsyncContextUtils.bindWorkspaceIdToFlux;
import static com.comet.opik.utils.AsyncUtils.makeFluxContextAware;

@ImplementedBy(WebhookDeliveryLogDAOImpl.class)
public interface WebhookDeliveryLogDAO {

    Mono<Void> insert(WebhookDeliveryLog log);

    Mono<WebhookDeliveryLogPage> findByAlertId(String workspaceId, String alertId, int page, int size);
}

@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
class WebhookDeliveryLogDAOImpl implements WebhookDeliveryLogDAO {

    private static final String INSERT_STATEMENT = """
            INSERT INTO webhook_delivery_logs
            (workspace_id, alert_id, alert_name, event_type, webhook_event_id,
             payload_json, status, http_status_code, error_message, response_body,
             retry_count, max_retries, created_at, completed_at)
            VALUES
            (:workspace_id, :alert_id, :alert_name, :event_type, :webhook_event_id,
             :payload_json, :status, :http_status_code, :error_message, :response_body,
             :retry_count, :max_retries,
             parseDateTime64BestEffort(:created_at, 9),
             parseDateTime64BestEffort(:completed_at, 9))
            """;

    private static final String COUNT_BY_ALERT_ID = """
            SELECT count() AS total
            FROM webhook_delivery_logs
            WHERE workspace_id = :workspace_id
            AND alert_id = :alert_id
            """;

    private static final String FIND_BY_ALERT_ID = """
            SELECT workspace_id, alert_id, alert_name, event_type, webhook_event_id,
                   payload_json, status, http_status_code, error_message, response_body,
                   retry_count, max_retries, created_at, completed_at
            FROM webhook_delivery_logs
            WHERE workspace_id = :workspace_id
            AND alert_id = :alert_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """;

    private final @NonNull ConnectionFactory connectionFactory;

    @Override
    public Mono<Void> insert(@NonNull WebhookDeliveryLog deliveryLog) {
        return Mono.from(connectionFactory.create())
                .flatMapMany(connection -> {
                    var statement = connection.createStatement(INSERT_STATEMENT)
                            .bind("workspace_id", deliveryLog.workspaceId())
                            .bind("alert_id", deliveryLog.alertId())
                            .bind("alert_name", deliveryLog.alertName())
                            .bind("event_type", deliveryLog.eventType())
                            .bind("webhook_event_id", deliveryLog.webhookEventId())
                            .bind("payload_json", deliveryLog.payloadJson() != null ? deliveryLog.payloadJson() : "")
                            .bind("status", deliveryLog.status().name())
                            .bind("http_status_code", deliveryLog.httpStatusCode())
                            .bind("error_message", deliveryLog.errorMessage() != null ? deliveryLog.errorMessage() : "")
                            .bind("response_body", deliveryLog.responseBody() != null ? deliveryLog.responseBody() : "")
                            .bind("retry_count", deliveryLog.retryCount())
                            .bind("max_retries", deliveryLog.maxRetries())
                            .bind("created_at", deliveryLog.createdAt().toString())
                            .bind("completed_at", deliveryLog.completedAt().toString());

                    return statement.execute();
                })
                .then();
    }

    @Override
    public Mono<WebhookDeliveryLogPage> findByAlertId(@NonNull String workspaceId, @NonNull String alertId,
            int page, int size) {
        int offset = (page - 1) * size;

        Mono<Long> countMono = Mono.from(connectionFactory.create())
                .flatMapMany(connection -> {
                    var statement = connection.createStatement(COUNT_BY_ALERT_ID)
                            .bind("workspace_id", workspaceId)
                            .bind("alert_id", alertId);
                    return makeFluxContextAware(bindWorkspaceIdToFlux(statement));
                })
                .flatMap(result -> result.map((row, metadata) -> row.get("total", Long.class)))
                .next()
                .defaultIfEmpty(0L);

        Mono<List<WebhookDeliveryLog>> dataMono = Mono.from(connectionFactory.create())
                .flatMapMany(connection -> {
                    var statement = connection.createStatement(FIND_BY_ALERT_ID)
                            .bind("workspace_id", workspaceId)
                            .bind("alert_id", alertId)
                            .bind("limit", size)
                            .bind("offset", offset);
                    return makeFluxContextAware(bindWorkspaceIdToFlux(statement));
                })
                .flatMap(result -> result.map((row, metadata) -> mapRow(row)))
                .collectList();

        return Mono.zip(countMono, dataMono)
                .map(tuple -> WebhookDeliveryLogPage.builder()
                        .page(page)
                        .size(size)
                        .total(tuple.getT1())
                        .content(tuple.getT2())
                        .build());
    }

    private WebhookDeliveryLog mapRow(Row row) {
        return WebhookDeliveryLog.builder()
                .workspaceId(row.get("workspace_id", String.class))
                .alertId(row.get("alert_id", String.class))
                .alertName(row.get("alert_name", String.class))
                .eventType(row.get("event_type", String.class))
                .webhookEventId(row.get("webhook_event_id", String.class))
                .payloadJson(row.get("payload_json", String.class))
                .status(WebhookDeliveryLog.DeliveryStatus.valueOf(row.get("status", String.class)))
                .httpStatusCode(row.get("http_status_code", Integer.class))
                .errorMessage(row.get("error_message", String.class))
                .responseBody(row.get("response_body", String.class))
                .retryCount(row.get("retry_count", Integer.class))
                .maxRetries(row.get("max_retries", Integer.class))
                .createdAt(row.get("created_at", Instant.class))
                .completedAt(row.get("completed_at", Instant.class))
                .build();
    }
}
