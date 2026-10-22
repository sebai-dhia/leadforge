package com.leadfinder.admin;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.TokenService;
import com.leadfinder.usage.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminUsersIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    TokenService tokens;
    @Autowired
    PasswordEncoder encoder;
    @Autowired
    UsageService usage;

    private AppUser account(String email, String role) {
        AppUser u = newUser(email, true);
        u.setRole(role);
        u.setPasswordHash(encoder.encode("password-123456"));
        return users.save(u);
    }

    private MockHttpServletRequestBuilder as(AppUser u, MockHttpServletRequestBuilder req) {
        return req.header("Authorization", "Bearer " + tokens.issue(u)).contentType(MediaType.APPLICATION_JSON);
    }

    private String loginBody(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    @Test
    void onlyTheAdminCanAddOrRemoveUsers() throws Exception {
        AppUser user = account("user@example.com", "USER");
        AppUser other = account("other@example.com", "USER");
        mvc.perform(as(user, post("/api/admin/users").content("{\"email\":\"new@example.com\"}"))).andExpect(status().isForbidden());
        mvc.perform(as(user, delete("/api/admin/users/" + other.getId()))).andExpect(status().isForbidden());
        assertEquals(2, users.count());
    }

    @Test
    void anAddedAccountWithoutAPasswordGetsAGeneratedOneThatWorksOnce() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");

        MvcResult res = mvc.perform(as(admin, post("/api/admin/users").content("{\"email\":\"New.Person@Example.com\",\"displayName\":\"New Person\"}")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("new.person@example.com"))
                .andReturn();
        String body = res.getResponse().getContentAsString();
        String password = com.jayway.jsonpath.JsonPath.read(body, "$.generatedPassword");
        assertNotNull(password);
        assertTrue(password.length() >= 12);

        AppUser created = users.findByEmail("new.person@example.com").orElseThrow();
        assertEquals("USER", created.getRole());
        assertEquals("New Person", created.getDisplayName());
        assertEquals(false, created.isOnboarded());

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("new.person@example.com", password)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("USER")).andExpect(jsonPath("$.onboarded").value(false));
    }

    @Test
    void anAddedAccountWithAChosenPasswordDoesNotReturnIt() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        mvc.perform(as(admin, post("/api/admin/users").content("{\"email\":\"chosen@example.com\",\"password\":\"my-own-password-1\"}")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.generatedPassword").value(nullValue()));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("chosen@example.com", "my-own-password-1")))
                .andExpect(status().isOk());
    }

    @Test
    void badInputIsRefused() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        account("taken@example.com", "USER");
        mvc.perform(as(admin, post("/api/admin/users").content("{\"email\":\"taken@example.com\"}"))).andExpect(status().isConflict());
        mvc.perform(as(admin, post("/api/admin/users").content("{\"email\":\"TAKEN@example.com\"}"))).andExpect(status().isConflict());
        mvc.perform(as(admin, post("/api/admin/users").content("{\"email\":\"not-an-email\"}"))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, post("/api/admin/users").content("{}"))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, post("/api/admin/users").content("{\"email\":\"short@example.com\",\"password\":\"short\"}"))).andExpect(status().isBadRequest());
        assertEquals(2, users.count());
    }

    @Test
    void removingAnAccountDeletesItsLeadsAndSearchesButKeepsItsUseInTheCounts() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser victim = account("leaving@example.com", "USER");
        AppUser stays = account("stays@example.com", "USER");
        newJob(victim, "gyms");
        newJob(stays, "cafes");
        jdbc.update("INSERT INTO leads (user_id, name, place_id) VALUES (?, 'Cafe', 'p1')", victim.getId());
        jdbc.update("INSERT INTO leads (user_id, name, place_id) VALUES (?, 'Bar', 'p2')", stays.getId());
        usage.consume(victim.getId(), UsageService.Kind.SEARCH);

        mvc.perform(as(admin, delete("/api/admin/users/" + victim.getId()))).andExpect(status().isNoContent());

        assertTrue(users.findById(victim.getId()).isEmpty());
        assertEquals(0, jdbc.queryForObject("select count(*) from leads where user_id = ?", Integer.class, victim.getId()));
        assertEquals(0, jdbc.queryForObject("select count(*) from search_jobs where niche = 'gyms'", Integer.class));
        // other people are untouched
        assertTrue(users.findById(stays.getId()).isPresent());
        assertEquals(1, jdbc.queryForObject("select count(*) from leads where user_id = ?", Integer.class, stays.getId()));
        assertEquals(1, jdbc.queryForObject("select count(*) from search_jobs where niche = 'cafes'", Integer.class));
        // the use still counts toward the caps for everyone, without the account
        assertEquals(1, jdbc.queryForObject("select count(*) from usage_events where user_id is null and kind = 'SEARCH'", Integer.class));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("leaving@example.com", "password-123456")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void theAdminCannotRemoveThemselvesAnotherAdminOrSomeoneWhoDoesNotExist() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser otherAdmin = account("boss2@example.com", "ADMIN");

        mvc.perform(as(admin, delete("/api/admin/users/" + admin.getId()))).andExpect(status().isConflict());
        mvc.perform(as(admin, delete("/api/admin/users/" + otherAdmin.getId()))).andExpect(status().isConflict());
        mvc.perform(as(admin, delete("/api/admin/users/99999"))).andExpect(status().isNotFound());
        assertEquals(2, users.count());
    }

    @Test
    void removingAGuestFreesItsSeat() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
        assertEquals(1, sessions.getStatus().activeSessions());
        AppUser guest = users.findAll().stream().filter(u -> "GUEST".equals(u.getRole())).findFirst().orElseThrow();

        mvc.perform(as(admin, delete("/api/admin/users/" + guest.getId()))).andExpect(status().isNoContent());

        assertEquals(0, sessions.getStatus().activeSessions());
    }
}
