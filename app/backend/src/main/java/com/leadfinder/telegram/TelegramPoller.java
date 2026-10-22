package com.leadfinder.telegram;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;

/**
 * Reads what people send to the bot with long polling (getUpdates), so no public webhook address is needed, in
 * development or in production. Only one running backend may poll a bot: a second one (another machine with the same
 * token) gets HTTP 409 and the two take turns, so give each environment its own bot.
 */
@Slf4j
@Component
public class TelegramPoller {
    private final TelegramBot bot;
    private final TelegramLinks links;
    private final boolean enabled;
    private volatile Thread thread;

    public TelegramPoller(TelegramBot bot, TelegramLinks links, @Value("${app.telegram.polling:true}") boolean enabled) {
        this.bot = bot;
        this.links = links;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!enabled || !bot.enabled() || thread != null) return;
        thread = Thread.ofPlatform().daemon().name("telegram-poller").start(this::run);
    }

    @PreDestroy
    public void stop() {
        Thread t = thread;
        thread = null;
        if (t != null) t.interrupt();
    }

    private void run() {
        long offset = 0;
        int failures = 0;
        while (thread == Thread.currentThread()) {
            try {
                for (TelegramBot.Incoming m : bot.updates(offset)) {
                    offset = m.updateId() + 1; // confirmed at the next call, so a message is handled once even after an error below
                    try {
                        links.handle(m);
                    } catch (RuntimeException e) {
                        log.warn("Telegram message could not be handled: {}", e.getClass().getSimpleName());
                    }
                }
                failures = 0;
            } catch (RuntimeException e) {
                if (Thread.currentThread().isInterrupted()) return;
                failures++;
                if (failures == 1 || failures % 20 == 0) {
                    String why = e instanceof HttpClientErrorException h && h.getStatusCode().value() == 409
                            ? "another backend is polling the same bot" : e.getClass().getSimpleName();
                    log.warn("Telegram polling failed ({}), retrying", why);
                }
                try {
                    Thread.sleep(Math.min(60_000, 2_000L * failures));
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
    }
}
