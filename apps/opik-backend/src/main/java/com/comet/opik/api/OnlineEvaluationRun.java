package com.comet.opik.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record OnlineEvaluationRun(
        UUID traceId,
        String traceName,
        String input,
        String output,
        Instant traceStartTime,
        String scoreName,
        BigDecimal scoreValue,
        String scoreReason,
        Instant scoredAt) {

    @Builder(toBuilder = true)
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record OnlineEvaluationRunPage(
            int page,
            int size,
            long total,
            List<OnlineEvaluationRun> content)
            implements
                Page<OnlineEvaluationRun>{
    }
}
