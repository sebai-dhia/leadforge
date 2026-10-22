package com.leadfinder.telegram;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import com.leadfinder.search.Lead;
import com.leadfinder.search.LeadRepository;
import com.leadfinder.search.LeadService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TelegramIntegrationTest extends IntegrationTestBase {
    private static final long CHAT = 555_000_111L;
    private static final ZoneId TUNIS = ZoneId.of("Africa/Tunis");
    /** 21 October, 9:30 in Tunis (UTC+1). */
    private static final Instant MORNING = LocalDateTime.of(2026, 10, 21, 9, 30).atZone(TUNIS).toInstant();

    @Autowired
    MockMvc mvc;
    @Autowired
    TelegramLinks links;
    @Autowired
    FollowUpReminder reminder;
    @Autowired
    LeadService leadService;
    @Autowired
    LeadRepository leads;

    @BeforeEach
    void botIsSetUp() {
        when(telegram.enabled()).thenReturn(true);
        when(telegram.username()).thenReturn("leadforge_test_bot");
        when(telegram.send(anyLong(), anyString())).thenReturn(TelegramBot.Sent.OK);
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor as(AppUser u) {
        return jwt().jwt(j -> j.subject(String.valueOf(u.getId())));
    }

    private String startLink(AppUser u, String lang, String zone) throws Exception {
        String body = mvc.perform(post("/api/profile/telegram/link").with(as(u)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lang\":\"" + lang + "\",\"timeZone\":\"" + zone + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String url = JsonMapper.builder().build().readTree(body).path("url").asString();
        assertTrue(url.startsWith("https://t.me/leadforge_test_bot?start="), url);
        return url.substring(url.indexOf("start=") + 6);
    }

    private AppUser reload(AppUser u) {
        return users.findById(u.getId()).orElseThrow();
    }

    private AppUser connected(String email) throws Exception {
        AppUser u = newUser(email, true);
        links.handle(new TelegramBot.Incoming(1, CHAT, "/start " + startLink(u, "en", "Africa/Tunis")));
        return reload(u);
    }

    private int phones;

    /** A lead marked Contacted on the given day of October, at 15:00 in Tunis. */
    private Lead contacted(AppUser u, String name, int october) {
        String phone = "+216 71 %06d".formatted(++phones); // a phone of its own, or the leads would be the same business
        leadService.ingest(newJob(u, "dental clinics"), List.of(lead("p-" + name, name, "Rue 1, Tunis", phone, null, List.of(), List.of(), 7)));
        Lead l = leads.findFirstByUserIdAndPlaceId(u.getId(), "p-" + name).orElseThrow();
        jdbc.update("update leads set status = 'CONTACTED', contacted_at = ? where id = ?",
                Timestamp.from(LocalDateTime.of(2026, 10, october, 15, 0).atZone(TUNIS).toInstant()), l.getId());
        return l;
    }

    // ---- connecting

    @Test
    void theLinkCodeConnectsTheChatThatPressedStartAndWorksOnce() throws Exception {
        AppUser u = newUser("t@x.tn", true);
        mvc.perform(get("/api/profile/telegram").with(as(u)))
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.connected").value(false));

        String code = startLink(u, "fr", "Africa/Tunis");
        links.handle(new TelegramBot.Incoming(1, CHAT, "/start " + code));

        assertEquals(CHAT, reload(u).getTelegramChatId());
        assertNull(reload(u).getTelegramLinkCode(), "the code is used up");
        assertEquals("Africa/Tunis", reload(u).getTelegramTimezone());
        verify(telegram).send(eq(CHAT), argThat(t -> t.contains("Telegram est connecté")));
        mvc.perform(get("/api/profile/telegram").with(as(u)))
                .andExpect(jsonPath("$.connected").value(true))
                .andExpect(jsonPath("$.notifications").value(true));

        links.handle(new TelegramBot.Incoming(2, 777L, "/start " + code));
        assertEquals(CHAT, reload(u).getTelegramChatId(), "a used code connects nothing else");
        verify(telegram).send(eq(777L), argThat(t -> t.contains("expired")));
    }

    @Test
    void anUnknownTimeZoneBecomesUtc() throws Exception {
        AppUser u = newUser("z@x.tn", true);
        startLink(u, "en", "Mars/Olympus");
        assertEquals("UTC", reload(u).getTelegramTimezone());
    }

    @Test
    void anExpiredOrUnknownCodeConnectsNothing() throws Exception {
        AppUser u = newUser("e@x.tn", true);
        String code = startLink(u, "en", "UTC");
        jdbc.update("update users set telegram_link_expires_at = ? where id = ?", Timestamp.from(Instant.now().minusSeconds(1)), u.getId());

        links.handle(new TelegramBot.Incoming(1, CHAT, "/start " + code));
        links.handle(new TelegramBot.Incoming(2, CHAT, "/start not-a-code"));
        assertNull(reload(u).getTelegramChatId());
    }

    @Test
    void guestsAndSharedDemoAccountsCannotConnect() throws Exception {
        AppUser guest = newUser("g@x.tn", true);
        guest.setRole("GUEST");
        users.save(guest);
        AppUser demo = newUser("d@x.tn", true);
        demo.setDemo(true);
        users.save(demo);

        for (AppUser u : new AppUser[] {guest, demo}) {
            mvc.perform(get("/api/profile/telegram").with(as(u))).andExpect(jsonPath("$.available").value(false));
            mvc.perform(post("/api/profile/telegram/link").with(as(u))).andExpect(status().isForbidden());
        }
    }

    @Test
    void oneChatBelongsToOneAccountAndStopDisconnectsIt() throws Exception {
        AppUser first = connected("one@x.tn");
        AppUser second = connected("two@x.tn");
        assertNull(reload(first).getTelegramChatId(), "the chat moved to the second account");
        assertEquals(CHAT, reload(second).getTelegramChatId());

        links.handle(new TelegramBot.Incoming(3, CHAT, "/stop"));
        assertNull(reload(second).getTelegramChatId());
    }

    @Test
    void savingTheProfileDoesNotDropTheChat() throws Exception {
        AppUser u = connected("keep@x.tn");
        mvc.perform(put("/api/profile").with(as(u)).contentType(MediaType.APPLICATION_JSON).content("{\"city\":\"Sousse\"}"))
                .andExpect(status().isOk());
        assertEquals(CHAT, reload(u).getTelegramChatId());
    }

    @Test
    void disconnectingFromTheAppForgetsTheChat() throws Exception {
        AppUser u = connected("bye@x.tn");
        mvc.perform(delete("/api/profile/telegram").with(as(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(false));
        assertNull(reload(u).getTelegramChatId());
    }

    // ---- follow-up reminder

    @Test
    void markingALeadContactedRemembersWhenAndMarkingItAgainLaterStartsOver() throws Exception {
        AppUser u = newUser("c@x.tn", true);
        leadService.ingest(newJob(u, "gyms"), List.of(lead("g1", "Gym One")));
        Lead l = leads.findFirstByUserIdAndPlaceId(u.getId(), "g1").orElseThrow();
        assertNull(l.getContactedAt());

        String contacted = "{\"status\":\"CONTACTED\"}";
        mvc.perform(patch("/api/leads/" + l.getId() + "/status").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(contacted))
                .andExpect(status().isOk());
        Instant first = leads.findById(l.getId()).orElseThrow().getContactedAt();
        assertNotNull(first);

        mvc.perform(patch("/api/leads/" + l.getId() + "/status").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(contacted));
        assertEquals(first, leads.findById(l.getId()).orElseThrow().getContactedAt(), "saving the same status keeps the day");

        jdbc.update("update leads set contacted_at = contacted_at - interval '5 days' where id = ?", l.getId());
        mvc.perform(patch("/api/leads/" + l.getId() + "/status").with(as(u)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"NEW\"}"));
        mvc.perform(patch("/api/leads/" + l.getId() + "/status").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(contacted));
        assertTrue(leads.findById(l.getId()).orElseThrow().getContactedAt().isAfter(first), "contacted again: the count starts over");
    }

    @Test
    void theMorningReminderListsLeadsContactedThreeDaysAndAWeekAgoOnlyOncePerDay() throws Exception {
        AppUser u = connected("r@x.tn");
        contacted(u, "Three Days <Clinic>", 18);
        contacted(u, "A Week Clinic", 14);
        contacted(u, "Two Days Clinic", 19);
        contacted(u, "Four Days Clinic", 17);
        contacted(u, "Eight Days Clinic", 13);
        Lead replied = contacted(u, "Replied Clinic", 18);
        jdbc.update("update leads set status = 'REPLIED' where id = ?", replied.getId());
        Lead hidden = contacted(u, "Hidden Clinic", 18);
        jdbc.update("update leads set hidden_at = now() where id = ?", hidden.getId());

        assertTrue(reminder.remind(reload(u), MORNING));
        verify(telegram).send(eq(CHAT), argThat(t -> t.contains("Time to follow up")
                && t.contains("Three Days &lt;Clinic&gt;") && t.contains("A Week Clinic")
                && t.indexOf("Contacted 3 days ago") < t.indexOf("Three Days") && t.indexOf("Contacted a week ago") < t.indexOf("A Week Clinic")
                && !t.contains("Two Days") && !t.contains("Four Days") && !t.contains("Eight Days")
                && !t.contains("Replied Clinic") && !t.contains("Hidden Clinic")
                && !t.contains("localhost")));

        assertFalse(reminder.remind(reload(u), MORNING.plusSeconds(3600)), "one reminder a day");
        verify(telegram, times(1)).send(eq(CHAT), argThat(t -> t.contains("Time to follow up")));
    }

    @Test
    void nothingBeforeNineOrOnADayWithNothingToFollowUp() throws Exception {
        AppUser u = connected("n@x.tn");
        contacted(u, "Due Clinic", 18);
        assertFalse(reminder.remind(reload(u), MORNING.minusSeconds(3600)), "8:30 in Tunis is too early");
        assertNull(reload(u).getTelegramRemindedOn());

        jdbc.update("update leads set status = 'REPLIED' where user_id = ?", u.getId());
        assertFalse(reminder.remind(reload(u), MORNING));
        assertEquals(java.time.LocalDate.of(2026, 10, 21), reload(u).getTelegramRemindedOn(), "looked at once for today");
        verify(telegram, never()).send(eq(CHAT), argThat(t -> t.contains("follow up")));
    }

    @Test
    void remindersTurnedOffSendNothingAndABlockedBotDisconnects() throws Exception {
        AppUser off = connected("off@x.tn");
        contacted(off, "Off Clinic", 18);
        mvc.perform(put("/api/profile/telegram").with(as(off)).contentType(MediaType.APPLICATION_JSON).content("{\"notifications\":false}"))
                .andExpect(jsonPath("$.notifications").value(false));
        assertTrue(users.findByTelegramChatIdIsNotNullAndTelegramNotifyTrue().isEmpty(), "the daily run skips them");

        mvc.perform(put("/api/profile/telegram").with(as(off)).contentType(MediaType.APPLICATION_JSON).content("{\"notifications\":true}"));
        when(telegram.send(eq(CHAT), argThat(t -> t.contains("Time to follow up")))).thenReturn(TelegramBot.Sent.BLOCKED);
        assertFalse(reminder.remind(reload(off), MORNING));
        assertNull(reload(off).getTelegramChatId(), "a blocked bot forgets the chat");
    }
    @Test
    void thePersonChoosesTheHourAndOnlyWholeHoursBetweenFiveAndTenPmAreAccepted() throws Exception {
        AppUser u = connected("h@x.tn");
        mvc.perform(get("/api/profile/telegram").with(as(u))).andExpect(jsonPath("$.hour").value(9));
        contacted(u, "Due Clinic", 18);

        settings(u, "{\"hour\":12}").andExpect(status().isOk()).andExpect(jsonPath("$.hour").value(12)).andExpect(jsonPath("$.notifications").value(true));
        assertFalse(reminder.remind(reload(u), MORNING), "9:30 is before the 12:00 they chose");
        verify(telegram, never()).send(eq(CHAT), argThat(t -> t.contains("Time to follow up")));

        settings(u, "{\"hour\":9}").andExpect(jsonPath("$.hour").value(9));
        assertTrue(reminder.remind(reload(u), MORNING));

        settings(u, "{\"hour\":4}").andExpect(status().isBadRequest());
        settings(u, "{\"hour\":23}").andExpect(status().isBadRequest());
        settings(u, "{\"hour\":5}").andExpect(status().isOk());
        settings(u, "{\"hour\":22}").andExpect(status().isOk());
        settings(u, "{\"notifications\":false}").andExpect(jsonPath("$.hour").value(22)).andExpect(jsonPath("$.notifications").value(false));
    }

    private org.springframework.test.web.servlet.ResultActions settings(AppUser u, String json) throws Exception {
        return mvc.perform(put("/api/profile/telegram").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(json));
    }
}
