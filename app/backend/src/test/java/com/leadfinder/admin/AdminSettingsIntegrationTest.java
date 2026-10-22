package com.leadfinder.admin;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminSettingsIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    TokenService tokens;
    @Autowired
    PasswordEncoder encoder;

    private AppUser account(String email, String role, String password) {
        AppUser u = newUser(email, true);
        u.setRole(role);
        u.setPasswordHash(encoder.encode(password));
        return users.save(u);
    }

    private MockHttpServletRequestBuilder as(AppUser u, MockHttpServletRequestBuilder req) {
        return req.header("Authorization", "Bearer " + tokens.issue(u)).contentType(MediaType.APPLICATION_JSON);
    }

    private String settingsJson(String key, String value) {
        return "{\"values\":{\"" + key + "\":" + (value == null ? "null" : "\"" + value + "\"") + "}}";
    }

    @Test
    void onlyTheAdminCanSeeOrChangeTheConfiguration() throws Exception {
        AppUser user = account("user@example.com", "USER", "password-123456");
        mvc.perform(as(user, get("/api/admin/settings"))).andExpect(status().isForbidden());
        mvc.perform(as(user, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", "9")))).andExpect(status().isForbidden());
        mvc.perform(as(user, get("/api/admin/account"))).andExpect(status().isForbidden());
        mvc.perform(as(user, put("/api/admin/account").content("{\"currentPassword\":\"x\",\"newPassword\":\"abcdefghijkl\"}")))
                .andExpect(status().isForbidden());
    }

    @Test
    void nothingFromTheEnvironmentFileIsShownExceptTheEditableSettings() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN", "password-123456");
        mvc.perform(as(admin, get("/api/admin/settings")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings[?(@.key=='limits.searchesPerDay')].value").value("2"))
                .andExpect(jsonPath("$.secrets").doesNotExist())
                .andExpect(jsonPath("$.info").doesNotExist())
                .andExpect(content().string(not(containsString("test-callback-secret"))))
                .andExpect(content().string(not(containsString("dev-only-secret"))));
    }

    @Test
    void aSavedLimitAppliesAtOnceAndGoingBackToTheEnvValueRemovesTheOverride() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN", "password-123456");
        AppUser user = account("user@example.com", "USER", "password-123456");

        mvc.perform(as(user, get("/api/usage"))).andExpect(jsonPath("$.search.limit").value(2));

        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", "7"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings[?(@.key=='limits.searchesPerDay')].value").value("7"))
                .andExpect(jsonPath("$.settings[?(@.key=='limits.searchesPerDay')].overridden").value(true))
                .andExpect(jsonPath("$.settings[?(@.key=='limits.searchesPerDay')].defaultValue").value("2"));
        mvc.perform(as(user, get("/api/usage"))).andExpect(jsonPath("$.search.limit").value(7));

        // saving the .env value again stores nothing
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", "2"))))
                .andExpect(jsonPath("$.settings[?(@.key=='limits.searchesPerDay')].overridden").value(false));
        assertEquals(0, jdbc.queryForObject("select count(*) from app_settings", Integer.class));

        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", "7")))).andExpect(status().isOk());
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", null))))
                .andExpect(jsonPath("$.settings[?(@.key=='limits.searchesPerDay')].value").value("2"));
        mvc.perform(as(user, get("/api/usage"))).andExpect(jsonPath("$.search.limit").value(2));
    }

    @Test
    void invalidValuesAreRefusedAndNothingIsSaved() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN", "password-123456");
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", "lots")))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("limits.searchesPerDay", "-1")))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("demo.maxSessions", "0")))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("guest.enabled", "maybe")))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("jwtSecret", "x")))).andExpect(status().isBadRequest());
        // one bad value among good ones saves none of them
        mvc.perform(as(admin, put("/api/admin/settings")
                .content("{\"values\":{\"limits.draftsPerDay\":\"5\",\"limits.enrichPerDay\":\"oops\"}}"))).andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from app_settings", Integer.class));
    }

    @Test
    void guestAccessAndSignUpsCanBeSwitchedWithoutARestart() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN", "password-123456");
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());

        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("guest.enabled", "false")))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/guest")).andExpect(status().isNotFound());

        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("guest.enabled", "true")))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());

        mvc.perform(as(admin, put("/api/admin/settings").content(settingsJson("demo.allowRegistration", "false")))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"new@example.com\",\"password\":\"password-123456\"}")).andExpect(status().isForbidden());
    }

    @Test
    void theAdminChangesTheEmailAndPasswordAndSignsInWithThem() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN", "old-password-123");
        account("taken@example.com", "USER", "password-123456");

        mvc.perform(as(admin, get("/api/admin/account"))).andExpect(jsonPath("$.email").value("boss@example.com"));

        mvc.perform(as(admin, put("/api/admin/account").content("{\"currentPassword\":\"wrong\",\"newPassword\":\"new-password-123\"}")))
                .andExpect(status().isForbidden());
        mvc.perform(as(admin, put("/api/admin/account").content("{\"currentPassword\":\"old-password-123\",\"newPassword\":\"short\"}")))
                .andExpect(status().isBadRequest());
        mvc.perform(as(admin, put("/api/admin/account").content("{\"currentPassword\":\"old-password-123\",\"email\":\"taken@example.com\"}")))
                .andExpect(status().isConflict());
        mvc.perform(as(admin, put("/api/admin/account").content("{\"currentPassword\":\"old-password-123\"}")))
                .andExpect(status().isBadRequest());
        mvc.perform(as(admin, put("/api/admin/account").content("{\"currentPassword\":\"old-password-123\",\"email\":\"not-an-email\"}")))
                .andExpect(status().isBadRequest());

        mvc.perform(as(admin, put("/api/admin/account")
                        .content("{\"currentPassword\":\"old-password-123\",\"email\":\"Owner@Example.com\",\"newPassword\":\"new-password-123\"}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("owner@example.com"));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"owner@example.com\",\"password\":\"new-password-123\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"boss@example.com\",\"password\":\"old-password-123\"}")).andExpect(status().isUnauthorized());
    }

    @Test
    void guessingTheCurrentPasswordIsThrottled() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN", "old-password-123");
        String body = "{\"currentPassword\":\"wrong\",\"newPassword\":\"new-password-123\"}";
        for (int i = 0; i < 3; i++) mvc.perform(as(admin, put("/api/admin/account").content(body))).andExpect(status().isForbidden());
        mvc.perform(as(admin, put("/api/admin/account").content(body))).andExpect(status().isTooManyRequests());
    }
}
