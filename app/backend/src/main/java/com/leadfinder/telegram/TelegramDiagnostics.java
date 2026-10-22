package com.leadfinder.telegram;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.config.AppProperties;
import com.leadfinder.search.Lead;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/** What the admin sees about Telegram, and the test message that proves it works. */
@Service
@RequiredArgsConstructor
public class TelegramDiagnostics {
    /** polling: OFF, STARTING, OK or FAILING (see TelegramPoller). botName is empty when Telegram does not accept the token or cannot be reached. */
    public record Status(boolean tokenSet, String botName, String polling, boolean alertChatSet, boolean adminConnected, long connectedPeople) {}

    /** SENT: Telegram accepted it. NOT_SET: nowhere to send it. BLOCKED: the chat blocked the bot. FAILED: Telegram refused or did not answer. */
    public enum Result { SENT, NOT_SET, BLOCKED, FAILED }

    /** via: where the one test message went: CONNECTED (the admin's own chat from the profile), ALERT_CHAT (TELEGRAM_CHAT_ID, the admin's chat for alerts) or NONE. */
    public record TestResult(Result result, String via) {}

    private final TelegramBot bot;
    private final TelegramPoller poller;
    private final FollowUpReminder reminders;
    private final UserRepository users;
    private final AppProperties props;

    public Status status(AppUser admin) {
        String name = bot.enabled() ? bot.username() : null;
        return new Status(bot.enabled(), name, poller.state(), alertChat() != null, admin.getTelegramChatId() != null,
                users.findByTelegramChatIdIsNotNullAndTelegramNotifyTrue().size());
    }

    /**
     * Sends one sample reminder, to the admin only, and only when this is called (the admin pressing the button). It goes to the
     * admin's own connected chat, or else to the admin's alert chat. Nothing is stored and no real lead or other person is involved.
     */
    public TestResult test(AppUser admin) {
        String lang = admin.getTelegramLanguage();
        String text = TelegramText.testBanner(lang)
                + TelegramText.followUp(lang, sample("Salon Nour", "+216 71 111 111", "whatsapp"),
                        sample("Clinique Sami", "contact@clinique-sami.tn", "email"), reminders.appUrl());
        if (admin.getTelegramChatId() != null) return new TestResult(result(bot.send(admin.getTelegramChatId(), text)), "CONNECTED");
        if (alertChat() != null) return new TestResult(result(bot.sendPlain(alertChat(), plain(text))), "ALERT_CHAT");
        return new TestResult(Result.NOT_SET, "NONE");
    }

    /** The alert chat is sent plain text, so the HTML tags are dropped. */
    private static String plain(String html) {
        return html.replaceAll("<[^>]+>", "").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&");
    }

    private String alertChat() {
        String chat = props.alerts() == null ? null : props.alerts().telegramChatId();
        return chat == null || chat.isBlank() ? null : chat.trim();
    }

    private static Result result(TelegramBot.Sent sent) {
        return switch (sent) {
            case OK -> Result.SENT;
            case BLOCKED -> Result.BLOCKED;
            case FAILED -> Result.FAILED;
        };
    }

    private static List<Lead> sample(String name, String contact, String channel) {
        Lead l = new Lead();
        l.setName(name);
        l.setDraftChannel(channel);
        if (contact.contains("@")) l.setEmails(contact); else l.setPhone(contact);
        return List.of(l);
    }
}
