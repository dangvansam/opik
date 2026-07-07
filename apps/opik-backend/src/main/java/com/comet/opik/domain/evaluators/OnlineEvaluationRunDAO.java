package com.comet.opik.domain.evaluators;

import com.comet.opik.api.OnlineEvaluationRun;
import com.comet.opik.utils.template.TemplateUtils;
import com.google.inject.ImplementedBy;
import io.r2dbc.spi.ConnectionFactory;
import io.r2dbc.spi.Row;
import io.r2dbc.spi.Statement;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static com.comet.opik.domain.AsyncContextUtils.bindWorkspaceIdToFlux;
import static com.comet.opik.utils.AsyncUtils.makeFluxContextAware;

@ImplementedBy(OnlineEvaluationRunDAOImpl.class)
public interface OnlineEvaluationRunDAO {

    Mono<Long> countRuns(@NonNull String workspaceId, @NonNull Set<UUID> projectIds);

    Flux<OnlineEvaluationRun> findRuns(@NonNull String workspaceId, @NonNull Set<UUID> projectIds,
            int limit, int offset);
}

@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
class OnlineEvaluationRunDAOImpl implements OnlineEvaluationRunDAO {

    private static final String COUNT_QUERY = """
            SELECT count() AS total
            FROM authored_feedback_scores fs
            WHERE fs.workspace_id = :workspace_id
              AND fs.source = 'online_scoring'
              AND fs.project_id IN :project_ids
              AND fs.entity_type = 'trace'
            """;

    private static final String FIND_QUERY = """
            SELECT
                fs.entity_id AS trace_id,
                t.name AS trace_name,
                LEFT(t.input, 200) AS input,
                LEFT(t.output, 200) AS output,
                t.start_time AS trace_start_time,
                fs.name AS score_name,
                fs.value AS score_value,
                fs.reason AS score_reason,
                fs.created_at AS scored_at
            FROM authored_feedback_scores fs
            INNER JOIN traces t ON t.id = fs.entity_id AND t.workspace_id = fs.workspace_id
            WHERE fs.workspace_id = :workspace_id
              AND fs.source = 'online_scoring'
              AND fs.project_id IN :project_ids
              AND fs.entity_type = 'trace'
            ORDER BY fs.created_at DESC
            LIMIT :limit
            OFFSET :offset
            """;

    private final @NonNull ConnectionFactory connectionFactory;

    @Override
    public Mono<Long> countRuns(@NonNull String workspaceId, @NonNull Set<UUID> projectIds) {
        return Mono.from(connectionFactory.create())
                .flatMapMany(connection -> {
                    var template = TemplateUtils.newST(COUNT_QUERY);
                    Statement statement = connection.createStatement(template.render())
                            .bind("project_ids", projectIds.toArray(new UUID[0]));

                    return makeFluxContextAware(bindWorkspaceIdToFlux(statement));
                })
                .flatMap(result -> result.map((row, metadata) -> row.get("total", Long.class)))
                .next()
                .defaultIfEmpty(0L);
    }

    @Override
    public Flux<OnlineEvaluationRun> findRuns(@NonNull String workspaceId, @NonNull Set<UUID> projectIds,
            int limit, int offset) {
        return Mono.from(connectionFactory.create())
                .flatMapMany(connection -> {
                    var template = TemplateUtils.newST(FIND_QUERY);
                    Statement statement = connection.createStatement(template.render())
                            .bind("project_ids", projectIds.toArray(new UUID[0]))
                            .bind("limit", limit)
                            .bind("offset", offset);

                    return makeFluxContextAware(bindWorkspaceIdToFlux(statement));
                })
                .flatMap(result -> result.map((row, metadata) -> mapRow(row)));
    }

    private OnlineEvaluationRun mapRow(Row row) {
        return OnlineEvaluationRun.builder()
                .traceId(row.get("trace_id", UUID.class))
                .traceName(row.get("trace_name", String.class))
                .input(row.get("input", String.class))
                .output(row.get("output", String.class))
                .traceStartTime(row.get("trace_start_time", Instant.class))
                .scoreName(row.get("score_name", String.class))
                .scoreValue(row.get("score_value", BigDecimal.class))
                .scoreReason(row.get("score_reason", String.class))
                .scoredAt(row.get("scored_at", Instant.class))
                .build();
    }
}
