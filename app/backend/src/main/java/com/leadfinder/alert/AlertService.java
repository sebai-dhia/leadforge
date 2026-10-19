package com.leadfinder.alert;

import com.leadfinder.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tells the admin on Telegram when something breaks (search service down, a search that never finished,
 * a global daily cap reached). Without a bot token and chat id it only logs. The same kind of alert is sent at
 * most once every 30 minutes, so an outage does not flood the chat.
 */
@Slf4j
@Service
public class AlertService {
    private static final Duration QUIET = Duration.ofMinutes(30);

    private final AppProperties props;
    private final RestClient client;
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();

    public AlertService(AppProperties props) {
        this.props = props;
        HttpClient jdk = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    /** {@code key} groups alerts of one kind for the quiet period, for example "n8n-down". */
    public void send(String key, String text) {
        Instant now = Instant.now();
        Instant prev = lastSent.get(key);
        if (prev != null && prev.isAfter(now.minus(QUIET))) return;
        lastSent.put(key, now);
        log.warn("ALERT [{}]: {}", key, text);

        AppProperties.Alerts a = props.alerts();
        if (a == null || isBlank(a.telegramBotToken()) || isBlank(a.telegramChatId())) return;
        CompletableFuture.runAsync(() -> {
            try {
                client.post()
                        .uri("https://api.telegram.org/bot{token}/sendMessage", a.telegramBotToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("chat_id", a.telegramChatId(), "text", "⚠️ Leadforge: " + text))
                        .retrieve()
                        .toBodilessEntity();
            } catch (RuntimeException e) {
                log.warn("Telegram alert could not be sent: {}", e.getMessage());
            }
        });
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
