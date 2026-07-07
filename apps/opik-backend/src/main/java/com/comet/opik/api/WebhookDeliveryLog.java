package com.comet.opik.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.time.Instant;

@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record WebhookDeliveryLog(
        String workspaceId,
        String alertId,
        String alertName,
        String eventType,
        String webhookEventId,
        String payloadJson,
        DeliveryStatus status,
        int httpStatusCode,
        String errorMessage,
        String responseBody,
        int retryCount,
        int maxRetries,
        Instant createdAt,
        Instant completedAt) {

    public enum DeliveryStatus {
        PENDING,
        SUCCESS,
        FAILED
    }
}
