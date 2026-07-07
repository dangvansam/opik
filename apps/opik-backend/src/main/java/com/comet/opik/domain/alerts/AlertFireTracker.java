package com.comet.opik.domain.alerts;

import com.comet.opik.api.AlertEventType;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RBucketReactive;
import org.redisson.api.RedissonReactiveClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class AlertFireTracker {

    private static final Duration TTL = Duration.ofDays(30);

    private final @NonNull RedissonReactiveClient redisClient;

    public String key(UUID alertId, AlertEventType eventType, String configName) {
        return "metrics_alert:last_fire:" + alertId + ":" + eventType.name()
                + (configName != null ? ":" + configName : "");
    }

    public Mono<Optional<Instant>> getLastFireAt(String key) {
        RBucketReactive<String> bucket = redisClient.getBucket(key);
        return bucket.get()
                .map(val -> Optional.of(Instant.parse(val)))
                .defaultIfEmpty(Optional.empty());
    }

    public Mono<Void> setLastFireAt(String key, Instant value) {
        RBucketReactive<String> bucket = redisClient.getBucket(key);
        return bucket.set(value.toString(), TTL);
    }
}
