package com.leadfinder.auth;

import com.leadfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GuestAccountIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    GuestCleanup cleanup;

    @Test
    void oneClickCreatesAPrivateEditableGuestWithSmallerLimits() throws Exception {
        String body = mvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("GUEST"))
                .andExpect(jsonPath("$.isDemo").value(false))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("@guest.leadforge.local"));
        AppUser g = users.findAll().get(0);
        assertEquals("GUEST", g.getRole());

        // the guest limit (1 in the test setup) applies, not the normal one (2)
        mvc.perform(get("/api/usage").with(jwt().jwt(j -> j.subject(String.valueOf(g.getId())))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.search.limit").value(1));
    }

    @Test
    void aGuestProfileCannotBeChanged() throws Exception {
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
        AppUser g = users.findAll().get(0);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/profile")
                        .with(jwt().jwt(j -> j.subject(String.valueOf(g.getId()))))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"offer\":\"Logo design for cafes\",\"displayName\":\"Sam\",\"language\":\"fr\"}"))
                .andExpect(status().isForbidden());
        assertEquals("Websites and custom software for small local businesses", users.findById(g.getId()).orElseThrow().getOffer());
    }

    @Test
    void guestCreationIsLimitedPerAddress() throws Exception {
        for (int i = 0; i < 3; i++) {
            sessions.reset();
            mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
        }
        sessions.reset();
        mvc.perform(post("/api/auth/guest")).andExpect(status().isTooManyRequests());
        assertEquals(3, users.count());
    }

    @Test
    void noGuestIsCreatedWhenAllSeatsAreTaken() throws Exception {
        for (int i = 0; i < 5; i++) sessions.registerSession("busy-" + i);
        mvc.perform(post("/api/auth/guest")).andExpect(status().isTooManyRequests());
        assertEquals(0, users.count());
    }

    @Test
    void cleanupDeletesIdleGuestsAndTheirLeadsButKeepsActiveOnesAndRealUsers() throws Exception {
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());   // will go idle
        AppUser idle = users.findAll().get(0);
        sessions.reset();                                                  // its seat is gone
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());   // still holds a seat
        AppUser active = users.findAll().stream().filter(u -> !u.getId().equals(idle.getId())).findFirst().orElseThrow();

        AppUser real = new AppUser();
        real.setEmail("real@example.com");
        real.setPasswordHash("hash");
        users.save(real);

        jdbc.update("INSERT INTO leads (user_id, name, place_id) VALUES (?, 'Cafe', 'p1')", idle.getId());
        jdbc.update("UPDATE users SET created_at = now() - interval '2 hours' WHERE role = 'GUEST' OR id = ?", real.getId());

        cleanup.sweep();

        assertTrue(users.findById(active.getId()).isPresent(), "a guest with an active session is kept");
        assertTrue(users.findById(idle.getId()).isEmpty(), "an idle guest is deleted");
        assertTrue(users.findById(real.getId()).isPresent(), "a real account is never deleted");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM leads WHERE user_id = ?", Integer.class, idle.getId()));
    }
}
