package com.comet.opik.api.resources.v1.events;

import com.comet.opik.api.Alert;
import com.comet.opik.api.AlertEventType;
import com.comet.opik.api.AlertTrigger;
import com.comet.opik.api.AlertTriggerConfigType;
import com.comet.opik.api.Project;
import com.comet.opik.api.events.FeedbackScoresCreated;
import com.comet.opik.api.events.webhooks.AlertTraceInfo;
import com.comet.opik.api.events.webhooks.MetricsAlertPayload;
import com.comet.opik.domain.AlertService;
import com.comet.opik.domain.EntityType;
import com.comet.opik.domain.IdGenerator;
import com.comet.opik.domain.ProjectMetricsDAO;
import com.comet.opik.domain.ProjectService;
import com.comet.opik.domain.alerts.AlertFireTracker;
import com.comet.opik.domain.alerts.AlertScopeUtils;
import com.comet.opik.domain.alerts.AlertWebhookSender;
import com.comet.opik.infrastructure.WebhookConfig;
import com.comet.opik.infrastructure.auth.RequestContext;
import com.comet.opik.infrastructure.lock.LockService;
import com.comet.opik.utils.AsyncUtils;
import com.comet.opik.utils.JsonUtils;
import com.comet.opik.utils.NumberUtils;
import com.google.common.eventbus.Subscribe;
import jakarta.inject.Inject;
import lombok.NonNull;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.util.function.Tuples;
import reactor.util.retry.Retry;
import ru.vyarus.dropwizard.guice.module.installer.feature.eager.EagerSingleton;
import ru.vyarus.dropwizard.guice.module.yaml.bind.Config;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.comet.opik.api.AlertTriggerConfig.NAME_CONFIG_KEY;
import static com.comet.opik.api.AlertTriggerConfig.OPERATOR_CONFIG_KEY;
import static com.comet.opik.api.AlertTriggerConfig.THRESHOLD_CONFIG_KEY;
import static com.comet.opik.api.AlertTriggerConfig.WINDOW_CONFIG_KEY;

@EagerSingleton
@Slf4j
public class FeedbackScoreAlertListener {

    private static final EnumSet<AlertEventType> FEEDBACK_SCORE_EVENTS = EnumSet.of(
            AlertEventType.TRACE_FEEDBACK_SCORE,
            AlertEventType.TRACE_THREAD_FEEDBACK_SCORE);

    private static final Duration INITIAL_DELAY = Duration.ofSeconds(2);
    private static final int MAX_RETRIES = 3;
    private static final Duration RETRY_DELAY = Duration.ofSeconds(2);
    private static final Duration CONCURRENT_EVAL_LOCK = Duration.ofSeconds(5);

    private final AlertService alertService;
    private final ProjectMetricsDAO projectMetricsDAO;
    private final ProjectService projectService;
    private final IdGenerator idGenerator;
    private final AlertWebhookSender alertWebhookSender;
    private final LockService lockService;
    private final AlertFireTracker fireTracker;
    private final WebhookConfig webhookConfig;

    @Inject
    public FeedbackScoreAlertListener(
            @NonNull AlertService alertService,
            @NonNull ProjectMetricsDAO projectMetricsDAO,
            @NonNull ProjectService projectService,
            @NonNull IdGenerator idGenerator,
            @NonNull AlertWebhookSender alertWebhookSender,
            @NonNull LockService lockService,
            @NonNull AlertFireTracker fireTracker,
            @NonNull @Config WebhookConfig webhookConfig) {
        this.alertService = alertService;
        this.projectMetricsDAO = projectMetricsDAO;
        this.projectService = projectService;
        this.idGenerator = idGenerator;
        this.alertWebhookSender = alertWebhookSender;
        this.lockService = lockService;
        this.fireTracker = fireTracker;
        this.webhookConfig = webhookConfig;
    }

    @Subscribe
    public void onFeedbackScoresCreated(@NonNull FeedbackScoresCreated event) {
        if (event.entityType() != EntityType.TRACE && event.entityType() != EntityType.THREAD) {
            return;
        }

        log.info("Received FeedbackScoresCreated event for {} entities in workspace '{}'",
                event.entityIds().size(), event.workspaceId());

        Mono.fromCallable(() -> alertService.findAllByWorkspaceAndEventTypes(
                        event.workspaceId(), FEEDBACK_SCORE_EVENTS))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMapMany(Flux::fromIterable)
                .flatMap(alert -> processAlert(alert, event))
                .onErrorContinue((error, obj) -> log.error(
                        "Error processing feedback score alert event: {}", error.getMessage(), error))
                .subscribe();
    }

    private Mono<Void> processAlert(Alert alert, FeedbackScoresCreated event) {
        LockService.Lock concurrentEvalLock = new LockService.Lock("metrics_alert:eval_lock:" + alert.id());

        return lockService.lockUsingToken(concurrentEvalLock, CONCURRENT_EVAL_LOCK)
                .flatMap(acquired -> {
                    if (Boolean.FALSE.equals(acquired)) {
                        log.debug("Skipping alert '{}' - concurrent evaluation already running", alert.name());
                        return Mono.<Void>empty();
                    }

                    return Flux.fromIterable(alert.triggers())
                            .filter(trigger -> FEEDBACK_SCORE_EVENTS.contains(trigger.eventType()))
                            .flatMap(trigger -> evaluateTrigger(alert, trigger, event))
                            .then();
                })
                .onErrorResume(error -> {
                    log.error("Failed to process alert '{}': {}", alert.name(), error.getMessage(), error);
                    return Mono.empty();
                });
    }

    private Mono<Void> evaluateTrigger(Alert alert, AlertTrigger trigger, FeedbackScoresCreated event) {
        List<TriggerConfig> configs = extractTriggerConfigs(trigger, alert.projectId());
        if (configs.isEmpty()) {
            return Mono.empty();
        }

        return Flux.fromIterable(configs)
                .flatMap(config -> evaluateConfig(alert, trigger, config, event))
                .then();
    }

    private Mono<Void> evaluateConfig(Alert alert, AlertTrigger trigger, TriggerConfig config,
            FeedbackScoresCreated event) {

        String fireKey = fireTracker.key(alert.id(), trigger.eventType(), config.name());
        Instant endTime = Instant.now();

        EntityType entityType = trigger.eventType() == AlertEventType.TRACE_FEEDBACK_SCORE
                ? EntityType.TRACE
                : EntityType.THREAD;

        return fireTracker.getLastFireAt(fireKey).flatMap(lastFireAt -> {
            Instant startTime = lastFireAt.orElse(endTime.minusSeconds(config.windowSeconds()));

            return Mono.delay(INITIAL_DELAY)
                    .then(projectMetricsDAO.getAverageFeedbackScore(
                            config.projectIds(), startTime, endTime, entityType, config.name())
                            .contextWrite(ctx -> AsyncUtils.setRequestContext(
                                    ctx, event.userName(), event.workspaceId())))
                    .switchIfEmpty(Mono.defer(() -> {
                        log.debug("No feedback score data yet for alert '{}', name '{}' - will retry",
                                alert.name(), config.name());
                        return Mono.error(new RuntimeException("No data available yet"));
                    }))
                    .retryWhen(Retry.fixedDelay(MAX_RETRIES, RETRY_DELAY)
                            .filter(e -> e.getMessage() != null && e.getMessage().contains("No data available yet")))
                    .onErrorResume(e -> {
                        if (e.getMessage() != null && e.getMessage().contains("Retries exhausted")) {
                            log.debug("No feedback score data found after retries for alert '{}', name '{}'",
                                    alert.name(), config.name());
                        }
                        return Mono.empty();
                    })
                    .flatMap(metricValue -> {
                        log.info("Feedback score metric retrieved for alert '{}': value='{}', name='{}'",
                                alert.name(), metricValue, config.name());

                        if (!compareMetric(metricValue, config.threshold(), config.operator())) {
                            log.debug("Alert '{}' not triggered: {} = '{}', threshold = '{}', name: '{}'",
                                    alert.name(), trigger.eventType(), metricValue, config.threshold(), config.name());
                            return Mono.<Void>empty();
                        }

                        int maxTraces = webhookConfig.getMetrics().getMaxTracesInPayload();

                        return projectMetricsDAO.getTracesForFeedbackScoreAlert(
                                        config.projectIds(), startTime, endTime, entityType, config.name(), maxTraces,
                                        config.operator().value, config.threshold())
                                .contextWrite(ctx -> AsyncUtils.setRequestContext(
                                        ctx, event.userName(), event.workspaceId()))
                                .flatMap(traces -> {
                                    if (traces.isEmpty()) {
                                        log.info("Alert '{}' skipped: threshold breached but no new traces since last fire, name: '{}'",
                                                alert.name(), config.name());
                                        return Mono.<Void>empty();
                                    }

                                    String projectIdsStr = config.projectIds() != null
                                            ? config.projectIds().stream().map(UUID::toString)
                                                    .collect(Collectors.joining(","))
                                            : "";
                                    String projectNamesStr = config.projectIds() != null
                                            ? projectService
                                                    .findByIds(alert.workspaceId(),
                                                            Set.copyOf(config.projectIds()))
                                                    .stream()
                                                    .map(Project::name)
                                                    .collect(Collectors.joining(","))
                                            : "";

                                    return Flux.fromIterable(traces)
                                            .concatMap(trace -> {
                                                log.info("Alert '{}' triggered immediately for trace '{}': {} = '{}', threshold = '{}', name: '{}'",
                                                        alert.name(), trace.traceId(),
                                                        trigger.eventType(), metricValue, config.threshold(),
                                                        config.name());

                                                return Mono.fromCallable(() -> {
                                                    String eventId = idGenerator.generateId().toString();

                                                    var payloadBuilder = MetricsAlertPayload.builder()
                                                            .eventType(trigger.eventType().name())
                                                            .metricName(trigger.eventType().getValue())
                                                            .metricValue(NumberUtils.formatDecimal(metricValue))
                                                            .threshold(NumberUtils.formatDecimal(config.threshold()))
                                                            .windowSeconds(config.windowSeconds())
                                                            .feedbackScoreName(config.name())
                                                            .projectIds(projectIdsStr)
                                                            .projectNames(projectNamesStr)
                                                            .traces(List.of(trace));

                                                    String payloadJson = JsonUtils.writeValueAsString(payloadBuilder.build());
                                                    return Tuples.of(eventId, payloadJson);
                                                })
                                                        .flatMap(payload -> alertWebhookSender.createAndSendWebhook(
                                                                alert,
                                                                alert.workspaceId(),
                                                                "",
                                                                trigger.eventType(),
                                                                List.of(payload.getT1()),
                                                                List.of(payload.getT2()),
                                                                List.of(event.userName())));
                                            })
                                            .then(fireTracker.setLastFireAt(fireKey, endTime));
                                });
                    })
                    .subscribeOn(Schedulers.boundedElastic());
        });
    }

    private boolean compareMetric(BigDecimal metricValue, BigDecimal threshold, Operator operator) {
        return switch (operator) {
            case GREATER_THAN -> metricValue.compareTo(threshold) > 0;
            case LESS_THAN -> metricValue.compareTo(threshold) < 0;
        };
    }

    private List<TriggerConfig> extractTriggerConfigs(AlertTrigger trigger, UUID projectId) {
        if (CollectionUtils.isEmpty(trigger.triggerConfigs())) {
            return List.of();
        }

        Set<UUID> collected = AlertScopeUtils.collectProjectIds(projectId, trigger.triggerConfigs());
        List<UUID> projectIds = collected.isEmpty() ? null : List.copyOf(collected);

        AlertTriggerConfigType thresholdConfigType = AlertTriggerConfigType.THRESHOLD_FEEDBACK_SCORE;

        return trigger.triggerConfigs().stream()
                .filter(c -> c.type() == thresholdConfigType)
                .map(config -> {
                    var thresholdStr = config.configValue().get(THRESHOLD_CONFIG_KEY);
                    if (thresholdStr == null) return null;
                    BigDecimal threshold = new BigDecimal(thresholdStr);

                    var windowStr = config.configValue().get(WINDOW_CONFIG_KEY);
                    if (windowStr == null) return null;
                    long windowSeconds = Long.parseLong(windowStr);

                    String name = config.configValue().get(NAME_CONFIG_KEY);
                    if (name == null) return null;

                    var operatorStr = config.configValue().get(OPERATOR_CONFIG_KEY);
                    if (operatorStr == null) return null;
                    Operator operator = Operator.fromString(operatorStr);

                    return new TriggerConfig(projectIds, threshold, windowSeconds, name, operator);
                })
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toList());
    }

    private record TriggerConfig(List<UUID> projectIds, BigDecimal threshold, long windowSeconds, String name,
            Operator operator) {
    }

    private enum Operator {
        GREATER_THAN(">"),
        LESS_THAN("<");

        private final String value;

        Operator(String value) {
            this.value = value;
        }

        static Operator fromString(String value) {
            for (Operator op : values()) {
                if (op.value.equals(value)) return op;
            }
            throw new IllegalArgumentException("Unknown operator: " + value);
        }
    }
}
