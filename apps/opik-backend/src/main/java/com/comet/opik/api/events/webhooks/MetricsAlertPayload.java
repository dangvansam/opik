package com.comet.opik.api.events.webhooks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;
import lombok.NonNull;

import java.util.List;

@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record MetricsAlertPayload(
        String eventType,
        String metricName,
        @NonNull String metricValue,
        @NonNull String threshold,
        long windowSeconds,
        String projectIds,
        String projectNames,
        String feedbackScoreName,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<AlertTraceInfo> traces) {
}
