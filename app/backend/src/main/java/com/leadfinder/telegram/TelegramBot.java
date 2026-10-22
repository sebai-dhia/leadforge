package com.leadfinder.telegram;

import com.leadfinder.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The one Leadforge bot (TELEGRAM_BOT_TOKEN), for the admin's alerts and for each person's own chat.
 * Without a token every call does nothing.
 */
@Slf4j
@Component
public class TelegramBot {
    /** Long polling: Telegram holds getUpdates open this long when there is nothing new. */
    static final int POLL_SECONDS = 25;

    public enum Sent { OK, BLOCKED, FAILED }

    /** One message the bot received: the chat it came from and its text ("/start abc"). */
    public record Incoming(long updateId, long chatId, String text) {}

    private final String token;
    private final RestClient client;
    private final RestClient poller;
    private volatile String username;

    public TelegramBot(AppProperties props) {
        this.token = props.alerts() == null ? null : props.alerts().telegramBotToken();
        this.client = client(Duration.ofSeconds(10));
        this.poller = client(Duration.ofSeconds(POLL_SECONDS + 10));
    }

    private static RestClient client(Duration readTimeout) {
        HttpClient jdk = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(readTimeout);
        return RestClient.builder().requestFactory(factory).build();
    }

    public boolean enabled() {
        return token != null && !token.isBlank();
    }

    /**
     * Sends an HTML message. BLOCKED means the person blocked the bot or the chat is gone: the chat should be forgotten.
     * The token never appears in the log.
     */
    public Sent send(long chatId, String html) {
        return post(Map.of("chat_id", chatId, "text", html, "parse_mode", "HTML", "link_preview_options", Map.of("is_disabled", true)));
    }

    /** Plain text, to a chat id as written in the configuration (the admin's TELEGRAM_CHAT_ID). */
    public Sent sendPlain(String chatId, String text) {
        return post(Map.of("chat_id", chatId, "text", text));
    }

    private Sent post(Map<String, Object> message) {
        if (!enabled()) return Sent.FAILED;
        try {
            client.post()
                    .uri("https://api.telegram.org/bot{token}/sendMessage", token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(message)
                    .retrieve()
                    .toBodilessEntity();
            return Sent.OK;
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().value() == 403 || e.getResponseBodyAsString().contains("chat not found")) return Sent.BLOCKED;
            log.warn("Telegram message could not be sent: HTTP {}", e.getStatusCode().value());
            return Sent.FAILED;
        } catch (RuntimeException e) {
            log.warn("Telegram message could not be sent: {}", e.getClass().getSimpleName());
            return Sent.FAILED;
        }
    }

    /** The bot's @name, for the t.me link. Asked once, then kept. Null when Telegram cannot be reached. */
    public String username() {
        if (!enabled()) return null;
        if (username == null) {
            try {
                JsonNode me = client.get().uri("https://api.telegram.org/bot{token}/getMe", token).retrieve().body(JsonNode.class);
                String name = me == null ? "" : me.path("result").path("username").asString("");
                if (!name.isBlank()) username = name;
            } catch (RuntimeException e) {
                log.warn("Telegram getMe failed: {}", e.getClass().getSimpleName());
            }
        }
        return username;
    }

    /** Waits up to POLL_SECONDS for new messages after {@code offset}. Only plain text messages are returned. */
    List<Incoming> updates(long offset) {
        JsonNode body = poller.get()
                .uri("https://api.telegram.org/bot{token}/getUpdates?offset={o}&timeout={t}&allowed_updates={a}",
                        token, offset, POLL_SECONDS, "[\"message\"]")
                .retrieve()
                .body(JsonNode.class);
        List<Incoming> out = new ArrayList<>();
        if (body == null) return out;
        for (JsonNode u : body.path("result")) {
            JsonNode msg = u.path("message");
            out.add(new Incoming(u.path("update_id").asLong(), msg.path("chat").path("id").asLong(0),
                    "private".equals(msg.path("chat").path("type").asString("")) ? msg.path("text").asString("") : ""));
        }
        return out;
    }
}
