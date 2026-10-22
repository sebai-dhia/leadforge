package com.leadfinder.admin;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.TokenService;
import com.leadfinder.telegram.TelegramBot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The admin's Telegram check: the status, and one test message to the admin only, only when asked. */
class AdminTelegramIntegrationTest extends IntegrationTestBase {
    private static final long ADMIN_CHAT = 900_000_001L;
    private static final long OTHER_CHAT = 900_000_002L;

    @Autowired
    MockMvc mvc;
    @Autowired
    TokenService tokens;

    @BeforeEach
    void botIsSetUp() {
        when(telegram.enabled()).thenReturn(true);
        when(telegram.username()).thenReturn("leadforge_test_bot");
        when(telegram.send(anyLong(), anyString())).thenReturn(TelegramBot.Sent.OK);
    }

    private AppUser account(String email, String role) {
        AppUser u = newUser(email, true);
        u.setRole(role);
        return users.save(u);
    }

    private MockHttpServletRequestBuilder as(AppUser u, MockHttpServletRequestBuilder req) {
        return req.header("Authorization", "Bearer " + tokens.issue(u));
    }

    private void connect(AppUser u, long chat) {
        jdbc.update("update users set telegram_chat_id = ? where id = ?", chat, u.getId());
    }

    @Test
    void onlyTheAdminCanSeeTheStatusOrSendTheTest() throws Exception {
        AppUser user = account("u@x.tn", "USER");
        mvc.perform(as(user, get("/api/admin/telegram"))).andExpect(status().isForbidden());
        mvc.perform(as(user, post("/api/admin/telegram/test"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/telegram")).andExpect(status().is4xxClientError());
        verify(telegram, never()).send(anyLong(), anyString());
    }

    @Test
    void theStatusShowsTheBotAndWhoIsConnectedAndSendsNothing() throws Exception {
        AppUser admin = account("a@x.tn", "ADMIN");
        connect(admin, ADMIN_CHAT);
        connect(account("p@x.tn", "USER"), OTHER_CHAT);

        mvc.perform(as(admin, get("/api/admin/telegram")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenSet").value(true))
                .andExpect(jsonPath("$.botName").value("leadforge_test_bot"))
                .andExpect(jsonPath("$.adminConnected").value(true))
                .andExpect(jsonPath("$.connectedPeople").value(2));
        verify(telegram, never()).send(anyLong(), anyString());
    }

    @Test
    void theTestGoesToTheAdminsChatOnlyAndExactlyOnce() throws Exception {
        AppUser admin = account("a@x.tn", "ADMIN");
        connect(admin, ADMIN_CHAT);
        connect(account("p@x.tn", "USER"), OTHER_CHAT);

        mvc.perform(as(admin, post("/api/admin/telegram/test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("SENT"))
                .andExpect(jsonPath("$.via").value("CONNECTED"));

        verify(telegram, times(1)).send(eq(ADMIN_CHAT), argThat(t -> t.contains("Test") && t.contains("Time to follow up") && t.contains("Salon Nour")));
        verify(telegram, never()).send(eq(OTHER_CHAT), anyString());
        verify(telegram, never()).sendPlain(anyString(), anyString());
    }

    @Test
    void anAdminWhoIsNotConnectedAndHasNoAlertChatGetsToldNothingWasSent() throws Exception {
        AppUser admin = account("a@x.tn", "ADMIN");
        connect(account("p@x.tn", "USER"), OTHER_CHAT);

        mvc.perform(as(admin, post("/api/admin/telegram/test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("NOT_SET"))
                .andExpect(jsonPath("$.via").value("NONE"));
        verify(telegram, never()).send(anyLong(), anyString());
        verify(telegram, never()).sendPlain(anyString(), anyString());
    }

    @Test
    void aRefusedMessageIsReportedAsFailed() throws Exception {
        AppUser admin = account("a@x.tn", "ADMIN");
        connect(admin, ADMIN_CHAT);
        when(telegram.send(eq(ADMIN_CHAT), anyString())).thenReturn(TelegramBot.Sent.FAILED);

        mvc.perform(as(admin, post("/api/admin/telegram/test")))
                .andExpect(jsonPath("$.result").value("FAILED"))
                .andExpect(jsonPath("$.via").value("CONNECTED"));
    }
}
