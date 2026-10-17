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
        assertEquals("Custom websites, booking systems and automation for small local businesses", users.findById(g.getId()).orElseThrow().getOffer());
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

    private org.springframework.test.web.servlet.request.RequestPostProcessor as(AppUser u) {
        return jwt().jwt(j -> j.subject(String.valueOf(u.getId())));
    }

    @Test
    void aGuestPicksASpecializationWhichSetsServicesIndustriesAndOffer() throws Exception {
        mvc.perform(post("/api/auth/guest").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"specialization\":\"UXUI\"}"))
                .andExpect(status().isOk());
        AppUser g = users.findAll().get(0);
        mvc.perform(get("/api/profile").with(as(g)))
                .andExpect(jsonPath("$.specialization").value("UXUI"))
                .andExpect(jsonPath("$.headline").value("UX/UI designer"))
                .andExpect(jsonPath("$.services[0]").value("UI/UX design"))
                .andExpect(jsonPath("$.targets[0]").value("Hotels and guesthouses"))
                .andExpect(jsonPath("$.offer").value("UX/UI design and website redesign for small local businesses"));
    }

    @Test
    void theIndustriesSuggestedMatchTheSpecialization() throws Exception {
        mvc.perform(post("/api/auth/guest").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"specialization\":\"STRATEGY\"}")).andExpect(status().isOk());
        AppUser g = users.findAll().get(0);
        mvc.perform(get("/api/searches/suggested-niches").with(as(g)))
                .andExpect(jsonPath("$[0]").value("restaurants"))
                .andExpect(jsonPath("$[1]").value("bakeries"));
    }

    @Test
    void aGuestCanSwitchSpecializationButNotEditAnythingElse() throws Exception {
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
        AppUser g = users.findAll().get(0);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/profile/specialization")
                        .with(as(g)).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"specialization\":\"STRATEGY\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.specialization").value("STRATEGY"))
                .andExpect(jsonPath("$.services.length()").value(3));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/profile")
                        .with(as(g)).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"headline\":\"hacked\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void anUnknownSpecializationIsRejected() throws Exception {
        mvc.perform(post("/api/auth/guest").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"specialization\":\"HACKER\"}")).andExpect(status().isBadRequest());
        assertEquals(0, users.count());
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
        AppUser g = users.findAll().get(0);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/profile/specialization")
                        .with(as(g)).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"specialization\":\"HACKER\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aRealAccountDoesNotUsePresets() throws Exception {
        AppUser real = new AppUser();
        real.setEmail("real2@example.com");
        real.setPasswordHash("hash");
        real = users.save(real);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/profile/specialization")
                        .with(as(real)).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"specialization\":\"UXUI\"}"))
                .andExpect(status().isForbidden());
    }
}
