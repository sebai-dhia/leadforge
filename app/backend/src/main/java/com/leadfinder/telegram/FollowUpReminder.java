package com.leadfinder.telegram;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.config.AppProperties;
import com.leadfinder.search.Lead;
import com.leadfinder.search.LeadRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Each morning (from 9:00 in the person's time zone) tells them on Telegram which businesses they marked Contacted
 * and that still have not replied: once 3 days after, once a week after, then never again. Nothing is sent on a day
 * with nothing to follow up.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FollowUpReminder {
    static final int HOUR = 9;
    static final int FIRST_DAY = 3;
    static final int LAST_DAY = 7;

    private final UserRepository users;
    private final LeadRepository leads;
    private final TelegramBot bot;
    private final AppProperties props;

    /** Every 15 minutes, so each person gets theirs shortly after 9:00. "-" turns it off (the tests call remind directly). */
    @Scheduled(cron = "${app.telegram.reminder-cron:0 */15 * * * *}")
    public void run() {
        if (!bot.enabled()) return;
        Instant now = Instant.now();
        for (AppUser u : users.findByTelegramChatIdIsNotNullAndTelegramNotifyTrue()) {
            try {
                remind(u, now);
            } catch (RuntimeException e) {
                log.warn("Follow-up reminder for user {} failed: {}", u.getId(), e.getClass().getSimpleName());
            }
        }
    }

    /** Sends today's reminder to one person if it is their morning and it was not looked at yet today. True when a message went out. */
    boolean remind(AppUser u, Instant now) {
        if (!u.canUseTelegram() || u.getTelegramChatId() == null) return false;
        ZoneId zone = ZoneId.of(TelegramLinks.validZone(u.getTelegramTimezone()));
        ZonedDateTime local = now.atZone(zone);
        LocalDate today = local.toLocalDate();
        if (local.getHour() < HOUR || today.equals(u.getTelegramRemindedOn())) return false;
        users.setTelegramRemindedOn(u.getId(), today); // first: an error below never sends the same reminder twice

        Instant from = today.minusDays(LAST_DAY).atStartOfDay(zone).toInstant();
        Instant to = today.minusDays(FIRST_DAY - 1).atStartOfDay(zone).toInstant();
        List<Lead> waiting = leads.findAwaitingReply(u.getId(), from, to);
        List<Lead> threeDays = waiting.stream().filter(l -> daysAgo(l, today, zone) == FIRST_DAY).toList();
        List<Lead> aWeek = waiting.stream().filter(l -> daysAgo(l, today, zone) == LAST_DAY).toList();
        if (threeDays.isEmpty() && aWeek.isEmpty()) return false;

        String text = TelegramText.followUp(u.getTelegramLanguage(), threeDays, aWeek, appUrl());
        TelegramBot.Sent sent = bot.send(u.getTelegramChatId(), text);
        if (sent == TelegramBot.Sent.BLOCKED) users.disconnectTelegram(u.getId()); // the person blocked the bot: stop trying
        return sent == TelegramBot.Sent.OK;
    }

    /** Calendar days in the person's time zone, so "3 days ago" means three mornings ago. */
    private static long daysAgo(Lead l, LocalDate today, ZoneId zone) {
        return ChronoUnit.DAYS.between(l.getContactedAt().atZone(zone).toLocalDate(), today);
    }

    /** The web app's address for the link to the leads. None for localhost: it opens only on the developer's machine, and Telegram may reject it. */
    private String appUrl() {
        String origin = props.corsOrigin() == null ? "" : props.corsOrigin().trim().replaceAll("/+$", "");
        return origin.startsWith("https://") || (origin.startsWith("http://") && !origin.matches("^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?$"))
                ? origin : "";
    }
}
