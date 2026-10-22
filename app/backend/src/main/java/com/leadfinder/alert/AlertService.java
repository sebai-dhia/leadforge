package com.leadfinder.alert;

import com.leadfinder.config.AppProperties;
import com.leadfinder.telegram.TelegramBot;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tells the admin on Telegram when something breaks (search service down, a search that never finished,
 * a global daily cap reached), in the chat TELEGRAM_CHAT_ID. Without a bot token and chat id it only logs. The same kind of alert is sent at
 * most once every 30 minutes, so an outage does not flood the chat.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {
    private static final Duration QUIET = Duration.ofMinutes(30);

    private final AppProperties props;
    private final TelegramBot bot;
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();

    /** {@code key} groups alerts of one kind for the quiet period, for example "n8n-down". */
    public void send(String key, String text) {
        Instant now = Instant.now();
        Instant prev = lastSent.get(key);
        if (prev != null && prev.isAfter(now.minus(QUIET))) return;
        lastSent.put(key, now);
        log.warn("ALERT [{}]: {}", key, text);

        String chat = props.alerts() == null ? null : props.alerts().telegramChatId();
        if (!bot.enabled() || chat == null || chat.isBlank()) return;
        CompletableFuture.runAsync(() -> bot.sendPlain(chat.trim(), "⚠️ Leadforge: " + text));
    }
}
