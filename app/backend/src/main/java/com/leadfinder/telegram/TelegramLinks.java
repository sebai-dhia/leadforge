package com.leadfinder.telegram;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

/**
 * Connects a person's Telegram chat to their account. The app gives a one-time t.me link that carries a code;
 * the person presses Start, Telegram sends "/start code" to the bot, and the chat is saved on the account the code belongs to.
 */
@Service
@RequiredArgsConstructor
public class TelegramLinks {
    static final Duration CODE_LIFE = Duration.ofMinutes(15);
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Status(boolean available, boolean connected, boolean notifications, int hour) {}

    public record Link(String url, Instant expiresAt) {}

    private final UserRepository users;
    private final TelegramBot bot;
    private final TransactionTemplate tx;

    public Status status(AppUser u) {
        return new Status(bot.enabled() && u.canUseTelegram(), u.getTelegramChatId() != null, u.isTelegramNotify(), u.getTelegramReminderHour());
    }

    /** A new one-time link; an older unused one stops working. Empty when Telegram cannot be reached. zone: the browser's time zone. */
    public Optional<Link> newLink(AppUser u, String lang, String zone) {
        String bot = this.bot.username();
        if (bot == null) return Optional.empty();
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); // 32 characters, all allowed in a start parameter
        Instant expires = Instant.now().plus(CODE_LIFE);
        users.setTelegramLinkCode(u.getId(), code, expires, "fr".equals(lang) ? "fr" : "en", validZone(zone));
        return Optional.of(new Link("https://t.me/" + bot + "?start=" + code, expires));
    }

    /** An unknown or missing zone becomes UTC. */
    static String validZone(String zone) {
        if (zone == null || zone.isBlank() || zone.length() > 64) return "UTC";
        try {
            return java.time.ZoneId.of(zone.trim()).getId();
        } catch (java.time.DateTimeException e) {
            return "UTC";
        }
    }

    public void disconnect(AppUser u) {
        Long chat = u.getTelegramChatId();
        users.disconnectTelegram(u.getId());
        if (chat != null) CompletableFuture.runAsync(() -> bot.send(chat, TelegramText.stopped(u.getTelegramLanguage())));
    }

    public void setHour(AppUser u, int hour) {
        users.setTelegramReminderHour(u.getId(), hour);
    }

    public void setNotify(AppUser u, boolean on) {
        users.setTelegramNotify(u.getId(), on);
    }

    /** A message to the bot: "/start code" connects the chat, "/stop" disconnects it, anything else gets a short help. */
    public void handle(TelegramBot.Incoming m) {
        if (m.chatId() == 0 || m.text() == null || m.text().isBlank()) return;
        String text = m.text().trim();
        Optional<AppUser> owner = users.findByTelegramChatId(m.chatId());
        String lang = owner.map(AppUser::getTelegramLanguage).orElse("en");
        if (text.equals("/start") || text.startsWith("/start ")) {
            connect(m.chatId(), text.substring("/start".length()).trim(), owner.isPresent(), lang);
        } else if (text.equals("/stop")) {
            owner.ifPresent(u -> users.disconnectTelegram(u.getId()));
            bot.send(m.chatId(), owner.isPresent() ? TelegramText.stopped(lang) : TelegramText.help(lang, false));
        } else {
            bot.send(m.chatId(), TelegramText.help(lang, owner.isPresent()));
        }
    }

    private void connect(long chatId, String code, boolean alreadyConnected, String lang) {
        Optional<AppUser> found = code.isEmpty() ? Optional.empty() : users.findByTelegramLinkCode(code);
        if (found.isEmpty() || found.get().getTelegramLinkExpiresAt() == null
                || found.get().getTelegramLinkExpiresAt().isBefore(Instant.now()) || !found.get().canUseTelegram()) {
            // a plain "/start" from a chat that is already connected (Telegram shows the Start button again) just repeats the welcome
            bot.send(chatId, code.isEmpty() && alreadyConnected ? TelegramText.connected(lang)
                    : code.isEmpty() ? TelegramText.help(lang, false)
                    : TelegramText.linkExpired(found.map(AppUser::getTelegramLanguage).orElse(lang)));
            return;
        }
        AppUser u = found.get();
        tx.executeWithoutResult(s -> {
            users.releaseTelegramChat(chatId); // the chat moves here if another account had it
            users.connectTelegram(u.getId(), chatId);
        });
        bot.send(chatId, TelegramText.connected(u.getTelegramLanguage()));
    }
}
